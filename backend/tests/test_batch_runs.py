import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.routers.batch_runs import get_batch_run_by_id, get_batch_runs, post_batch_run, post_batch_run_item
from app.services.batch_runs import create_batch_run, get_batch_run, list_batch_runs, record_batch_run_item


class FakeBatchDb:
    def __init__(self):
        self.queries = []
        self.batches = {}
        self.items = {}
        self.now = datetime(2026, 6, 23, 12, 0, tzinfo=timezone.utc)

    async def query(self, sql, params=None):
        self.queries.append((sql, params))
        params = params or []
        if "INSERT INTO batch_runs" in sql:
            batch_id, source, row_count, status, now = params
            row = self.batches.get(batch_id, {})
            row.update(
                {
                    "id": batch_id,
                    "source": source,
                    "row_count": row_count,
                    "status": status,
                    "success_count": row.get("success_count", 0),
                    "duplicate_count": row.get("duplicate_count", 0),
                    "error_count": row.get("error_count", 0),
                    "created_at": row.get("created_at", now),
                    "updated_at": now,
                }
            )
            self.batches[batch_id] = row
            return [row]
        if "INSERT INTO batch_run_items" in sql:
            (
                batch_id,
                row_number,
                client_username,
                program_ids,
                start_date,
                end_date,
                status,
                duplicate,
                result_url,
                bundle_url,
                presenter_notes_url,
                publisher_recommendations_excel_url,
                publisher_performance_excel_url,
                error,
                request_key,
                now,
            ) = params
            row = {
                "batch_id": batch_id,
                "row_number": row_number,
                "client_username": client_username,
                "program_ids": program_ids,
                "start_date": start_date,
                "end_date": end_date,
                "status": status,
                "duplicate": duplicate,
                "result_url": result_url,
                "bundle_url": bundle_url,
                "presenter_notes_url": presenter_notes_url,
                "publisher_recommendations_excel_url": publisher_recommendations_excel_url,
                "publisher_performance_excel_url": publisher_performance_excel_url,
                "error": error,
                "request_key": request_key,
                "created_at": self.items.get((batch_id, row_number), {}).get("created_at", now),
                "updated_at": now,
            }
            self.items[(batch_id, row_number)] = row
            return [row]
        if "UPDATE batch_runs" in sql:
            batch_id, now = params
            batch = self.batches[batch_id]
            rows = [row for (item_batch_id, _), row in self.items.items() if item_batch_id == batch_id]
            batch["success_count"] = sum(1 for row in rows if row["status"] == "success")
            batch["duplicate_count"] = sum(1 for row in rows if row["duplicate"] or row["status"] == "duplicate")
            batch["error_count"] = sum(1 for row in rows if row["status"] == "error")
            if batch["row_count"] and len(rows) >= batch["row_count"]:
                batch["status"] = "completed_with_errors" if batch["error_count"] else "completed"
            else:
                batch["status"] = "running"
            batch["updated_at"] = now
            return [batch]
        if "FROM batch_run_items" in sql and "ORDER BY row_number" in sql:
            batch_id = params[0]
            return [
                row
                for (_, _), row in sorted(self.items.items(), key=lambda item: item[0][1])
                if row["batch_id"] == batch_id
            ]
        if "FROM batch_runs" in sql and "WHERE id" in sql:
            return [self.batches[params[0]]] if params[0] in self.batches else []
        if "FROM batch_runs" in sql and "ORDER BY created_at" in sql:
            return list(self.batches.values())[: params[0]]
        return []


class BatchRunsServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_batch_and_records_row_results(self):
        db = FakeBatchDb()
        batch = await create_batch_run(
            {"id": "batch-1", "source": "extension", "rowCount": 2},
            db=db,
        )

        self.assertEqual(batch["id"], "batch-1")
        self.assertEqual(batch["rowCount"], 2)
        self.assertEqual(batch["rows"], [])

        updated = await record_batch_run_item(
            "batch-1",
            {
                "rowNumber": 1,
                "clientUsername": "client@example.com",
                "programIds": ["310990", "297463"],
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
                "status": "success",
                "resultUrl": "http://127.0.0.1/report.pptx",
                "bundleUrl": "http://127.0.0.1/report_bundle.zip",
                "presenterNotesUrl": "http://127.0.0.1/presenter-notes.docx",
                "publisherRecommendationsExcelUrl": "http://127.0.0.1/recommendations.xlsx",
                "publisherPerformanceExcelUrl": "http://127.0.0.1/performance.xlsx",
            },
            db=db,
        )

        self.assertEqual(updated["status"], "running")
        self.assertEqual(updated["successCount"], 1)
        self.assertEqual(updated["rows"][0]["programIds"], "310990, 297463")
        self.assertEqual(updated["rows"][0]["resultUrl"], "http://127.0.0.1/report.pptx")
        self.assertEqual(updated["rows"][0]["bundleUrl"], "http://127.0.0.1/report_bundle.zip")
        self.assertEqual(updated["rows"][0]["presenterNotesUrl"], "http://127.0.0.1/presenter-notes.docx")
        self.assertEqual(updated["rows"][0]["publisherRecommendationsExcelUrl"], "http://127.0.0.1/recommendations.xlsx")
        self.assertEqual(updated["rows"][0]["publisherPerformanceExcelUrl"], "http://127.0.0.1/performance.xlsx")

        completed = await record_batch_run_item(
            "batch-1",
            {
                "rowNumber": 2,
                "clientUsername": "client@example.com",
                "programIds": "310990",
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
                "status": "duplicate",
                "duplicate": True,
                "error": "Duplicate QBR request blocked",
            },
            db=db,
        )

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["successCount"], 1)
        self.assertEqual(completed["duplicateCount"], 1)
        self.assertEqual(completed["errorCount"], 0)
        self.assertEqual(len(completed["rows"]), 2)

    async def test_lists_and_fetches_batch_runs(self):
        db = FakeBatchDb()
        await create_batch_run({"id": "batch-1", "source": "extension", "rowCount": 1}, db=db)

        batches = await list_batch_runs(db=db)
        batch = await get_batch_run("batch-1", db=db)

        self.assertEqual(batches[0]["id"], "batch-1")
        self.assertEqual(batch["id"], "batch-1")
        self.assertEqual(batch["rows"], [])


class BatchRunsRouterTest(unittest.IsolatedAsyncioTestCase):
    async def test_batch_router_wraps_service_results(self):
        batch = {"id": "batch-1", "rows": []}

        with patch("app.routers.batch_runs.create_batch_run", new=AsyncMock(return_value=batch)) as create_mock:
            response = await post_batch_run({"id": "batch-1"})

        self.assertEqual(response, {"batch": batch})
        create_mock.assert_awaited_once_with({"id": "batch-1"})

        with patch("app.routers.batch_runs.record_batch_run_item", new=AsyncMock(return_value=batch)) as item_mock:
            response = await post_batch_run_item("batch-1", {"rowNumber": 1})

        self.assertEqual(response, {"batch": batch})
        item_mock.assert_awaited_once_with("batch-1", {"rowNumber": 1})

        with patch("app.routers.batch_runs.get_batch_run", new=AsyncMock(return_value=batch)):
            self.assertEqual(await get_batch_run_by_id("batch-1"), {"batch": batch})

        with patch("app.routers.batch_runs.list_batch_runs", new=AsyncMock(return_value=[batch])):
            self.assertEqual(await get_batch_runs(), {"batches": [batch]})


if __name__ == "__main__":
    unittest.main()
