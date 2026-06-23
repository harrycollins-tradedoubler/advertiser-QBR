import logging
from datetime import datetime, timezone
from typing import Any

from app.services.db import neon_db

logger = logging.getLogger(__name__)

CREATE_PROGRAM_REQUEST_RUNS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS program_request_runs (
    program_id TEXT NOT NULL,
    client_username TEXT NOT NULL DEFAULT '',
    program_ids TEXT NOT NULL DEFAULT '',
    program_names TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    language_code TEXT NOT NULL DEFAULT '',
    currency_code TEXT NOT NULL DEFAULT '',
    analysis_level TEXT NOT NULL DEFAULT '',
    request_key TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

ALTER_PROGRAM_REQUEST_RUNS_TABLE_SQL = """
ALTER TABLE program_request_runs
    ADD COLUMN IF NOT EXISTS client_username TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS program_ids TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS program_names TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS start_date TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS analysis_level TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS request_key TEXT NOT NULL DEFAULT ''
"""

BACKFILL_PROGRAM_REQUEST_RUNS_REQUEST_KEY_SQL = """
UPDATE program_request_runs
SET request_key = lower(trim(client_username)) || '|' || (
    SELECT string_agg(program_id_value, ',' ORDER BY lower(program_id_value))
    FROM (
        SELECT DISTINCT trim(raw_program_id) AS program_id_value
        FROM regexp_split_to_table(program_ids, ',') AS raw_program_id
        WHERE trim(raw_program_id) <> ''
    ) AS canonical_program_ids
) || '|' || trim(start_date) || '|' || trim(end_date)
WHERE request_key = ''
    AND trim(client_username) <> ''
    AND trim(program_ids) <> ''
    AND trim(start_date) <> ''
    AND trim(end_date) <> ''
"""

CREATE_PROGRAM_REQUEST_RUNS_DEDUPE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS program_request_runs_request_key_idx
ON program_request_runs (request_key)
WHERE request_key <> ''
"""

INSERT_PROGRAM_REQUEST_RUN_SQL = """
INSERT INTO program_request_runs (
    program_id,
    "timestamp",
    client_username,
    program_ids,
    program_names,
    start_date,
    end_date,
    language_code,
    currency_code,
    analysis_level,
    request_key
)
VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING program_id, "timestamp"
"""

SELECT_PROGRAM_REQUEST_RUNS_SQL = """
SELECT
    program_id,
    "timestamp",
    client_username,
    program_ids,
    program_names,
    start_date,
    end_date,
    language_code,
    currency_code,
    analysis_level,
    request_key
FROM program_request_runs
ORDER BY "timestamp" DESC
LIMIT $1
"""

POSTGREST_SELECT_COLUMNS = (
    "program_id,timestamp,client_username,program_ids,program_names,"
    "start_date,end_date,language_code,currency_code,analysis_level,request_key"
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_list(values: Any) -> list[str]:
    if isinstance(values, list):
        return [_clean_text(value) for value in values if _clean_text(value)]
    if isinstance(values, str):
        return [_clean_text(value) for value in values.split(",") if _clean_text(value)]
    value = _clean_text(values)
    return [value] if value else []


def _first_text(payload: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = _clean_text(payload.get(key))
        if value:
            return value
    return ""


def _canonical_program_ids(program_ids: str) -> list[str]:
    seen = set()
    canonical: list[str] = []
    for value in _clean_list(program_ids):
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        canonical.append(value)
    return sorted(canonical, key=lambda item: item.lower())


def build_request_key(summary: dict[str, str]) -> str:
    client_username = _clean_text(summary.get("client_username")).lower()
    program_ids = _canonical_program_ids(summary.get("program_ids", ""))
    start_date = _clean_text(summary.get("start_date"))
    end_date = _clean_text(summary.get("end_date"))
    if not client_username or not program_ids or not start_date or not end_date:
        return ""
    return "|".join([client_username, ",".join(program_ids), start_date, end_date])


def extract_program_id(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None

    for key in ("programId", "program_id", "ProgramID", "Program ID"):
        value = _clean_text(payload.get(key))
        if value:
            return value

    for key in ("publisherProgramIds", "programIds", "advertiserProgramIds", "analysisProgramIds"):
        values = _clean_list(payload.get(key))
        if values:
            return values[0]

    return None


def summarize_program_request(payload: Any) -> dict[str, str] | None:
    if not isinstance(payload, dict):
        return None

    program_id = extract_program_id(payload)
    if not program_id:
        return None

    program_ids: list[str] = []
    for key in ("advertiserProgramIds", "publisherProgramIds", "analysisProgramIds", "programIds"):
        for value in _clean_list(payload.get(key)):
            if value not in program_ids:
                program_ids.append(value)
    if not program_ids:
        program_ids = [program_id]

    program_names = _clean_list(payload.get("programNames"))
    single_program_name = _first_text(payload, ("programName", "publisherProgramName", "clientName"))
    if single_program_name and single_program_name not in program_names:
        program_names.insert(0, single_program_name)

    summary = {
        "program_id": program_id,
        "client_username": _first_text(payload, ("clientUsername", "client_username", "username")),
        "program_ids": ", ".join(program_ids),
        "program_names": ", ".join(program_names),
        "start_date": _first_text(payload, ("startDate", "fromDate", "dateFrom")),
        "end_date": _first_text(payload, ("endDate", "toDate", "dateTo")),
        "language_code": _first_text(payload, ("languageCode", "language")),
        "currency_code": _first_text(payload, ("currencyCode", "currency")),
        "analysis_level": _first_text(payload, ("analysisLevel", "analysisScope", "scope")),
    }
    summary["request_key"] = build_request_key(summary)
    return summary


async def _ensure_program_request_runs_table(db=neon_db) -> None:
    await db.query(CREATE_PROGRAM_REQUEST_RUNS_TABLE_SQL)
    await db.query(ALTER_PROGRAM_REQUEST_RUNS_TABLE_SQL)
    await db.query(BACKFILL_PROGRAM_REQUEST_RUNS_REQUEST_KEY_SQL)
    await db.query(CREATE_PROGRAM_REQUEST_RUNS_DEDUPE_INDEX_SQL)


async def record_program_request_result(
    payload: Any,
    requested_at: datetime | None = None,
    db=neon_db,
) -> dict[str, bool | str]:
    summary = summarize_program_request(payload)
    if not summary:
        return {"recorded": False, "duplicate": False, "reason": "missing_program_id", "requestKey": ""}

    timestamp = requested_at or datetime.now(timezone.utc)
    timestamp_iso = timestamp.astimezone(timezone.utc).isoformat()

    if getattr(db, "is_postgrest", False):
        if summary["request_key"]:
            existing = await db.select_postgrest(
                table="program_request_runs",
                select="request_key",
                filters={"request_key": f"eq.{summary['request_key']}"},
                limit=1,
            )
            if existing:
                return {
                    "recorded": False,
                    "duplicate": True,
                    "reason": "duplicate_request",
                    "requestKey": summary["request_key"],
                }

        await db.insert_postgrest(
            "program_request_runs",
            {
                **summary,
                "timestamp": timestamp_iso,
            },
        )
        return {"recorded": True, "duplicate": False, "reason": "", "requestKey": summary["request_key"]}

    await _ensure_program_request_runs_table(db)
    if summary["request_key"]:
        existing = await db.query(
            "SELECT 1 FROM program_request_runs WHERE request_key = $1 LIMIT 1",
            [summary["request_key"]],
        )
        if existing:
            return {
                "recorded": False,
                "duplicate": True,
                "reason": "duplicate_request",
                "requestKey": summary["request_key"],
            }

    rows = await db.query(
        INSERT_PROGRAM_REQUEST_RUN_SQL,
        [
            summary["program_id"],
            timestamp,
            summary["client_username"],
            summary["program_ids"],
            summary["program_names"],
            summary["start_date"],
            summary["end_date"],
            summary["language_code"],
            summary["currency_code"],
            summary["analysis_level"],
            summary["request_key"],
        ],
    )
    return {"recorded": bool(rows), "duplicate": False, "reason": "", "requestKey": summary["request_key"]}


async def record_program_request(
    payload: Any,
    requested_at: datetime | None = None,
    db=neon_db,
) -> bool:
    result = await record_program_request_result(payload, requested_at=requested_at, db=db)
    return bool(result["recorded"])


async def try_record_program_request(payload: Any) -> bool:
    try:
        return await record_program_request(payload)
    except Exception as exc:
        logger.warning("Failed to record program request run: %s", exc)
        return False


def _serialize_run(row: dict[str, Any]) -> dict[str, str]:
    timestamp = row.get("timestamp")
    if isinstance(timestamp, datetime):
        timestamp_value = timestamp.astimezone(timezone.utc).isoformat()
    else:
        timestamp_value = _clean_text(timestamp)

    return {
        "programId": _clean_text(row.get("program_id") or row.get("Program ID")),
        "timestamp": timestamp_value,
        "clientUsername": _clean_text(row.get("client_username")),
        "programIds": _clean_text(row.get("program_ids")),
        "programNames": _clean_text(row.get("program_names")),
        "startDate": _clean_text(row.get("start_date")),
        "endDate": _clean_text(row.get("end_date")),
        "languageCode": _clean_text(row.get("language_code")),
        "currencyCode": _clean_text(row.get("currency_code")),
        "analysisLevel": _clean_text(row.get("analysis_level")),
        "requestKey": _clean_text(row.get("request_key")),
    }


async def list_program_request_runs(limit: int = 100, db=neon_db) -> list[dict[str, str]]:
    safe_limit = min(max(int(limit or 100), 1), 500)

    if getattr(db, "is_postgrest", False):
        rows = await db.select_postgrest(
            table="program_request_runs",
            select=POSTGREST_SELECT_COLUMNS,
            order="timestamp.desc",
            limit=safe_limit,
        )
        return [_serialize_run(row) for row in rows]

    await _ensure_program_request_runs_table(db)
    rows = await db.query(SELECT_PROGRAM_REQUEST_RUNS_SQL, [safe_limit])
    return [_serialize_run(row) for row in rows]

