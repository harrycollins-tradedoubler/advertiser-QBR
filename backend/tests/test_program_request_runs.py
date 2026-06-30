import unittest
from datetime import datetime, timezone

from app.services.program_request_runs import (
    build_request_key,
    extract_program_id,
    list_program_request_runs,
    record_program_request,
    record_program_request_result,
    summarize_program_request,
)


class FakeSqlDb:
    is_postgrest = False

    def __init__(self):
        self.queries = []
        self.existing_keys = set()
        self.duration_by_key = {}

    async def query(self, sql, params=None):
        self.queries.append((sql, params))
        if "SELECT 1 FROM program_request_runs WHERE request_key" in sql:
            return [{"exists": 1}] if params and params[0] in self.existing_keys else []
        if "UPDATE program_request_runs" in sql and "build_duration_ms" in sql:
            build_duration_ms, request_key = params
            if request_key in self.existing_keys:
                self.duration_by_key[request_key] = build_duration_ms
                return [{"request_key": request_key, "build_duration_ms": build_duration_ms}]
            return []
        if "INSERT INTO program_request_runs" in sql:
            request_key = params[-1]
            if request_key and request_key in self.existing_keys:
                return []
            if request_key:
                self.existing_keys.add(request_key)
            return [{"program_id": params[0], "timestamp": params[1]}]
        return []


class FakePostgrestDb:
    is_postgrest = True

    def __init__(self):
        self.inserts = []
        self.rows = []

    async def select_postgrest(self, table, select, filters=None, order=None, limit=None):
        request_key_filter = (filters or {}).get("request_key", "")
        if request_key_filter.startswith("eq."):
            request_key = request_key_filter[3:]
            return [row for row in self.rows if row.get("request_key") == request_key][: limit or 1]
        return []

    async def insert_postgrest(self, table, payload):
        self.inserts.append((table, payload))
        self.rows.append(payload)
        return [payload]


class ProgramRequestRunsTest(unittest.IsolatedAsyncioTestCase):
    def test_extracts_program_id_from_qbr_payload(self):
        self.assertEqual(
            extract_program_id({"type": "QBR_REQUEST", "programId": "310990"}),
            "310990",
        )

    def test_falls_back_to_first_publisher_program_id(self):
        self.assertEqual(
            extract_program_id({"publisherProgramIds": ["310990", "123456"]}),
            "310990",
        )

    def test_summarizes_selected_program_context(self):
        summary = summarize_program_request(
            {
                "clientUsername": "client@example.com",
                "advertiserProgramIds": ["310990", "123456"],
                "programNames": ["Program A", "Program B"],
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
                "languageCode": "DE",
                "currencyCode": "EUR",
                "analysisLevel": "program",
            }
        )

        self.assertEqual(
            summary,
            {
                "program_id": "310990",
                "client_username": "client@example.com",
                "program_ids": "310990, 123456",
                "program_names": "Program A, Program B",
                "start_date": "2026-01-01",
                "end_date": "2026-03-31",
                "language_code": "DE",
                "currency_code": "EUR",
                "analysis_level": "program",
                "request_key": "client@example.com|123456,310990|2026-01-01|2026-03-31",
            },
        )

    def test_request_key_ignores_program_id_order(self):
        left = build_request_key(
            {
                "client_username": "Client@Example.com",
                "program_ids": "310990, 123456",
                "start_date": "2026-01-01",
                "end_date": "2026-03-31",
            }
        )
        right = build_request_key(
            {
                "client_username": "client@example.com",
                "program_ids": "123456, 310990",
                "start_date": "2026-01-01",
                "end_date": "2026-03-31",
            }
        )

        self.assertEqual(left, right)

    async def test_records_program_request_with_direct_sql(self):
        db = FakeSqlDb()
        requested_at = datetime(2026, 4, 9, 10, 30, tzinfo=timezone.utc)

        result = await record_program_request_result(
            {
                "clientUsername": "client@example.com",
                "programId": "310990",
                "programNames": ["HP Store"],
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
                "languageCode": "EN",
                "currencyCode": "GBP",
                "analysisLevel": "program",
            },
            requested_at=requested_at,
            db=db,
        )

        self.assertEqual(
            result,
            {
                "recorded": True,
                "duplicate": False,
                "reason": "",
                "requestKey": "client@example.com|310990|2026-01-01|2026-03-31",
            },
        )
        self.assertEqual(len(db.queries), 6)
        self.assertIn("CREATE TABLE IF NOT EXISTS program_request_runs", db.queries[0][0])
        self.assertIn("ALTER TABLE program_request_runs", db.queries[1][0])
        self.assertIn("UPDATE program_request_runs", db.queries[2][0])
        self.assertIn("CREATE INDEX", db.queries[3][0])
        self.assertIn("INSERT INTO program_request_runs", db.queries[5][0])
        self.assertEqual(
            db.queries[5][1],
            [
                "310990",
                requested_at,
                "client@example.com",
                "310990",
                "HP Store",
                "2026-01-01",
                "2026-03-31",
                "EN",
                "GBP",
                "program",
                None,
                "client@example.com|310990|2026-01-01|2026-03-31",
            ],
        )

    async def test_updates_existing_request_with_build_duration(self):
        db = FakeSqlDb()
        payload = {
            "clientUsername": "client@example.com",
            "programId": "310990",
            "startDate": "2026-01-01",
            "endDate": "2026-03-31",
        }

        await record_program_request_result(payload, db=db)
        result = await record_program_request_result(payload, build_duration_ms=1532, db=db)

        self.assertEqual(
            result,
            {
                "recorded": False,
                "duplicate": False,
                "updated": True,
                "reason": "",
                "requestKey": "client@example.com|310990|2026-01-01|2026-03-31",
            },
        )
        self.assertEqual(
            db.duration_by_key["client@example.com|310990|2026-01-01|2026-03-31"],
            1532,
        )

    async def test_duplicate_same_client_program_and_date_range_is_not_recorded(self):
        db = FakeSqlDb()
        payload = {
            "clientUsername": "client@example.com",
            "programId": "310990",
            "startDate": "2026-01-01",
            "endDate": "2026-03-31",
        }

        first = await record_program_request_result(payload, db=db)
        second = await record_program_request_result(payload, db=db)

        self.assertEqual(first["recorded"], True)
        self.assertEqual(
            second,
            {
                "recorded": False,
                "duplicate": True,
                "reason": "duplicate_request",
                "requestKey": "client@example.com|310990|2026-01-01|2026-03-31",
            },
        )

    async def test_same_client_program_with_different_date_range_is_recorded(self):
        db = FakeSqlDb()
        first = await record_program_request_result(
            {
                "clientUsername": "client@example.com",
                "programId": "310990",
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
            },
            db=db,
        )
        second = await record_program_request_result(
            {
                "clientUsername": "client@example.com",
                "programId": "310990",
                "startDate": "2026-04-01",
                "endDate": "2026-06-30",
            },
            db=db,
        )

        self.assertEqual(first["recorded"], True)
        self.assertEqual(second["recorded"], True)
        self.assertEqual(second["duplicate"], False)

    async def test_record_program_request_returns_bool_for_existing_callers(self):
        db = FakeSqlDb()
        recorded = await record_program_request(
            {
                "clientUsername": "client@example.com",
                "programId": "310990",
                "startDate": "2026-01-01",
                "endDate": "2026-03-31",
            },
            db=db,
        )

        self.assertTrue(recorded)

    async def test_records_program_request_with_postgrest(self):
        db = FakePostgrestDb()
        requested_at = datetime(2026, 4, 9, 10, 30, tzinfo=timezone.utc)

        result = await record_program_request_result(
            {"programId": "310990", "programName": "HP Store", "currencyCode": "EUR"},
            requested_at=requested_at,
            db=db,
        )

        self.assertEqual(result["recorded"], True)
        self.assertEqual(
            db.inserts,
            [
                (
                    "program_request_runs",
                    {
                        "program_id": "310990",
                        "client_username": "",
                        "program_ids": "310990",
                        "program_names": "HP Store",
                        "start_date": "",
                        "end_date": "",
                        "language_code": "",
                        "currency_code": "EUR",
                        "analysis_level": "",
                        "build_duration_ms": None,
                        "request_key": "",
                        "timestamp": "2026-04-09T10:30:00+00:00",
                    },
                )
            ],
        )

    async def test_skips_payloads_without_program_id(self):
        db = FakeSqlDb()

        result = await record_program_request_result({}, db=db)

        self.assertEqual(result, {"recorded": False, "duplicate": False, "reason": "missing_program_id", "requestKey": ""})
        self.assertEqual(db.queries, [])

    async def test_lists_recent_program_request_runs(self):
        requested_at = datetime(2026, 4, 9, 10, 30, tzinfo=timezone.utc)

        class ListDb(FakeSqlDb):
            async def query(self, sql, params=None):
                self.queries.append((sql, params))
                if "SELECT" in sql and "program_id" in sql:
                    return [
                        {
                            "program_id": "310990",
                            "timestamp": requested_at,
                            "client_username": "client@example.com",
                            "program_ids": "310990, 123456",
                            "program_names": "HP Store, Partner Store",
                            "start_date": "2026-01-01",
                            "end_date": "2026-03-31",
                            "language_code": "EN",
                            "currency_code": "GBP",
                            "analysis_level": "program",
                            "build_duration_ms": 1532,
                            "request_key": "client@example.com|123456,310990|2026-01-01|2026-03-31",
                        }
                    ]
                return []

        db = ListDb()

        runs = await list_program_request_runs(limit=25, db=db)

        self.assertEqual(
            runs,
            [
                {
                    "programId": "310990",
                    "timestamp": "2026-04-09T10:30:00+00:00",
                    "clientUsername": "client@example.com",
                    "programIds": "310990, 123456",
                    "programNames": "HP Store, Partner Store",
                    "startDate": "2026-01-01",
                    "endDate": "2026-03-31",
                    "languageCode": "EN",
                    "currencyCode": "GBP",
                    "analysisLevel": "program",
                    "buildDurationMs": 1532,
                    "requestKey": "client@example.com|123456,310990|2026-01-01|2026-03-31",
                }
            ],
        )
        self.assertEqual(db.queries[4][1], [25])


if __name__ == "__main__":
    unittest.main()



