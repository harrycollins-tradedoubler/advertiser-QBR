import uuid
from datetime import datetime, timezone
from typing import Any

from app.services.db import neon_db

CREATE_BATCH_RUNS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS batch_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    row_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_BATCH_RUN_ITEMS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS batch_run_items (
    batch_id TEXT NOT NULL REFERENCES batch_runs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    client_username TEXT NOT NULL DEFAULT '',
    program_ids TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    duplicate BOOLEAN NOT NULL DEFAULT false,
    result_url TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    request_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (batch_id, row_number)
)
"""

CREATE_BATCH_RUN_ITEMS_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS batch_run_items_batch_id_idx
ON batch_run_items (batch_id, row_number)
"""

INSERT_BATCH_RUN_SQL = """
INSERT INTO batch_runs (
    id,
    source,
    row_count,
    status,
    created_at,
    updated_at
)
VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
ON CONFLICT (id) DO UPDATE SET
    source = EXCLUDED.source,
    row_count = EXCLUDED.row_count,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at
RETURNING *
"""

UPSERT_BATCH_RUN_ITEM_SQL = """
INSERT INTO batch_run_items (
    batch_id,
    row_number,
    client_username,
    program_ids,
    start_date,
    end_date,
    status,
    duplicate,
    result_url,
    error,
    request_key,
    created_at,
    updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $12::timestamptz)
ON CONFLICT (batch_id, row_number) DO UPDATE SET
    client_username = EXCLUDED.client_username,
    program_ids = EXCLUDED.program_ids,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    status = EXCLUDED.status,
    duplicate = EXCLUDED.duplicate,
    result_url = EXCLUDED.result_url,
    error = EXCLUDED.error,
    request_key = EXCLUDED.request_key,
    updated_at = EXCLUDED.updated_at
RETURNING *
"""

REFRESH_BATCH_RUN_COUNTS_SQL = """
UPDATE batch_runs
SET
    success_count = (
        SELECT count(*)::integer FROM batch_run_items WHERE batch_id = $1 AND status = 'success'
    ),
    duplicate_count = (
        SELECT count(*)::integer FROM batch_run_items WHERE batch_id = $1 AND (duplicate = true OR status = 'duplicate')
    ),
    error_count = (
        SELECT count(*)::integer FROM batch_run_items WHERE batch_id = $1 AND status = 'error'
    ),
    status = CASE
        WHEN row_count > 0 AND (SELECT count(*) FROM batch_run_items WHERE batch_id = $1) >= row_count THEN
            CASE
                WHEN (SELECT count(*) FROM batch_run_items WHERE batch_id = $1 AND status = 'error') > 0 THEN 'completed_with_errors'
                ELSE 'completed'
            END
        ELSE 'running'
    END,
    updated_at = $2::timestamptz
WHERE id = $1
RETURNING *
"""

SELECT_BATCH_RUN_SQL = """
SELECT *
FROM batch_runs
WHERE id = $1
"""

SELECT_BATCH_RUN_ITEMS_SQL = """
SELECT *
FROM batch_run_items
WHERE batch_id = $1
ORDER BY row_number ASC
"""

SELECT_BATCH_RUNS_SQL = """
SELECT *
FROM batch_runs
ORDER BY created_at DESC
LIMIT $1
"""


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _clean_program_ids(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(_clean_text(item) for item in value if _clean_text(item))
    return _clean_text(value)


def _clean_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _clean_text(value).lower() in {"1", "true", "yes", "y"}


def _serialize_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return _clean_text(value)


def _serialize_batch(row: dict[str, Any], items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    batch = {
        "id": _clean_text(row.get("id")),
        "source": _clean_text(row.get("source")),
        "status": _clean_text(row.get("status")),
        "rowCount": _clean_int(row.get("row_count")),
        "successCount": _clean_int(row.get("success_count")),
        "duplicateCount": _clean_int(row.get("duplicate_count")),
        "errorCount": _clean_int(row.get("error_count")),
        "createdAt": _serialize_timestamp(row.get("created_at")),
        "updatedAt": _serialize_timestamp(row.get("updated_at")),
    }
    if items is not None:
        batch["rows"] = [_serialize_item(item) for item in items]
    return batch


def _serialize_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "batchId": _clean_text(row.get("batch_id")),
        "rowNumber": _clean_int(row.get("row_number")),
        "clientUsername": _clean_text(row.get("client_username")),
        "programIds": _clean_text(row.get("program_ids")),
        "startDate": _clean_text(row.get("start_date")),
        "endDate": _clean_text(row.get("end_date")),
        "status": _clean_text(row.get("status")),
        "duplicate": bool(row.get("duplicate")),
        "resultUrl": _clean_text(row.get("result_url")),
        "error": _clean_text(row.get("error")),
        "requestKey": _clean_text(row.get("request_key")),
        "createdAt": _serialize_timestamp(row.get("created_at")),
        "updatedAt": _serialize_timestamp(row.get("updated_at")),
    }


async def ensure_batch_run_tables(db=neon_db) -> None:
    await db.query(CREATE_BATCH_RUNS_TABLE_SQL)
    await db.query(CREATE_BATCH_RUN_ITEMS_TABLE_SQL)
    await db.query(CREATE_BATCH_RUN_ITEMS_INDEX_SQL)


async def create_batch_run(payload: dict[str, Any], db=neon_db) -> dict[str, Any]:
    await ensure_batch_run_tables(db)
    now = datetime.now(timezone.utc)
    batch_id = _clean_text(payload.get("id")) or str(uuid.uuid4())
    source = _clean_text(payload.get("source"))
    row_count = max(_clean_int(payload.get("rowCount", payload.get("row_count"))), 0)
    status = _clean_text(payload.get("status")) or "running"

    rows = await db.query(INSERT_BATCH_RUN_SQL, [batch_id, source, row_count, status, now])
    return _serialize_batch(rows[0], items=[]) if rows else {
        "id": batch_id,
        "source": source,
        "status": status,
        "rowCount": row_count,
        "successCount": 0,
        "duplicateCount": 0,
        "errorCount": 0,
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
        "rows": [],
    }


async def record_batch_run_item(batch_id: str, payload: dict[str, Any], db=neon_db) -> dict[str, Any]:
    await ensure_batch_run_tables(db)
    now = datetime.now(timezone.utc)
    safe_batch_id = _clean_text(batch_id)
    row_number = _clean_int(payload.get("rowNumber", payload.get("row_number")), 0)
    if not safe_batch_id or row_number < 1:
        raise ValueError("batchId and rowNumber are required.")

    status = _clean_text(payload.get("status")) or "running"
    duplicate = _clean_bool(payload.get("duplicate")) or status == "duplicate"
    await db.query(
        UPSERT_BATCH_RUN_ITEM_SQL,
        [
            safe_batch_id,
            row_number,
            _clean_text(payload.get("clientUsername", payload.get("client_username"))),
            _clean_program_ids(payload.get("programIds", payload.get("program_ids"))),
            _clean_text(payload.get("startDate", payload.get("start_date"))),
            _clean_text(payload.get("endDate", payload.get("end_date"))),
            status,
            duplicate,
            _clean_text(payload.get("resultUrl", payload.get("result_url"))),
            _clean_text(payload.get("error")),
            _clean_text(payload.get("requestKey", payload.get("request_key"))),
            now,
        ],
    )
    await db.query(REFRESH_BATCH_RUN_COUNTS_SQL, [safe_batch_id, now])
    batch = await get_batch_run(safe_batch_id, db=db)
    if not batch:
        raise ValueError(f"Batch run not found: {safe_batch_id}")
    return batch


async def get_batch_run(batch_id: str, db=neon_db) -> dict[str, Any] | None:
    await ensure_batch_run_tables(db)
    rows = await db.query(SELECT_BATCH_RUN_SQL, [_clean_text(batch_id)])
    if not rows:
        return None
    items = await db.query(SELECT_BATCH_RUN_ITEMS_SQL, [_clean_text(batch_id)])
    return _serialize_batch(rows[0], items=items)


async def list_batch_runs(limit: int = 25, db=neon_db) -> list[dict[str, Any]]:
    await ensure_batch_run_tables(db)
    safe_limit = min(max(_clean_int(limit, 25), 1), 100)
    rows = await db.query(SELECT_BATCH_RUNS_SQL, [safe_limit])
    return [_serialize_batch(row) for row in rows]
