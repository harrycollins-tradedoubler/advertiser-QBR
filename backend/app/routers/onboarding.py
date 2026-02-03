from fastapi import APIRouter, HTTPException
from app.services.db import neon_db
from app.services.onboarding_analyzer import analyze_onboarding

router = APIRouter()

async def _get_postgrest_columns(table: str) -> set[str]:
    rows = await neon_db.select_postgrest(
        table=table,
        select="*",
        filters={},
        limit=1,
    )
    if not rows:
        return set()
    return set(rows[0].keys())


async def _get_program_id_column() -> str | None:
    if neon_db.is_postgrest:
        columns = await _get_postgrest_columns("conversation_logs_v2")
        for name in ("ProgramID", "program_id", "programid"):
            if name in columns:
                return name
        return None

    rows = await neon_db.query(
        "SELECT 1 "
        "FROM information_schema.columns "
        "WHERE table_schema = 'public' "
        "AND table_name = 'conversation_logs_v2' "
        "AND column_name IN ('program_id', 'ProgramID', 'programid') "
        "LIMIT 1"
    )
    if not rows:
        return None
    # Prefer quoted ProgramID if present.
    rows = await neon_db.query(
        "SELECT column_name "
        "FROM information_schema.columns "
        "WHERE table_schema = 'public' "
        "AND table_name = 'conversation_logs_v2' "
        "AND column_name IN ('ProgramID', 'program_id', 'programid') "
        "ORDER BY CASE column_name WHEN 'ProgramID' THEN 0 WHEN 'program_id' THEN 1 ELSE 2 END "
        "LIMIT 1"
    )
    return rows[0].get("column_name") if rows else None


@router.get("/onboarding/{program_id}")
async def get_onboarding_status(program_id: str):
    """
    Get onboarding implementation status for a program.

    Queries conversation logs from Neon PostgreSQL and analyzes
    the messages to derive which onboarding steps are completed.
    """
    try:
        program_id_column = await _get_program_id_column()

        if neon_db.is_postgrest:
            select_cols = "session_id,user_message,response,company_name,created_at"
            filters = (
                {
                    "or": f"(session_id.eq.{program_id},{program_id_column}.eq.{program_id})"
                }
                if program_id_column
                else {"session_id": f"eq.{program_id}"}
            )
            rows = await neon_db.select_postgrest(
                table="conversation_logs_v2",
                select=select_cols,
                filters=filters,
                order="created_at.asc",
            )
        else:
            program_id_sql = f"\"{program_id_column}\"" if program_id_column == "ProgramID" else program_id_column
            where_clause = (
                f"WHERE {program_id_sql} = $1 OR session_id = $1 "
                if program_id_column
                else "WHERE session_id = $1 "
            )

            # Query all conversation rows for this program ID
            rows = await neon_db.query(
                "SELECT session_id, user_message, response, company_name, created_at "
                "FROM conversation_logs_v2 "
                f"{where_clause}"
                "ORDER BY created_at ASC",
                [program_id],
            )

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"No onboarding data found for program ID: {program_id}",
            )

        # Analyze messages to derive onboarding status
        status = analyze_onboarding(rows)
        status["programId"] = program_id

        return status

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching onboarding data: {str(e)}",
        )


@router.get("/onboarding/search/{search_term}")
async def search_onboarding(search_term: str):
    """
    Search for programs by company name or session ID.
    Returns a list of matching programs with basic info.
    """
    try:
        program_id_column = await _get_program_id_column()

        if neon_db.is_postgrest:
            wild = f"*{search_term}*"
            or_parts = [
                f"company_name.ilike.{wild}",
                f"session_id.ilike.{wild}",
            ]
            if program_id_column:
                or_parts.append(f"{program_id_column}.ilike.{wild}")

            select_cols = "session_id,company_name,created_at"
            if program_id_column:
                select_cols = f"{select_cols},{program_id_column}"

            rows = await neon_db.select_postgrest(
                table="conversation_logs_v2",
                select=select_cols,
                filters={"or": f"({','.join(or_parts)})"},
                order="created_at.desc",
                limit=200,
            )

            grouped: dict[str, dict] = {}
            for row in rows:
                key = row.get(program_id_column) or row.get("session_id")
                if not key:
                    continue
                entry = grouped.get(key)
                created_at = row.get("created_at")
                if not entry:
                    grouped[key] = {
                        "programId": key,
                        "companyName": row.get("company_name") or "Unknown",
                        "startedAt": created_at,
                        "lastActivity": created_at,
                        "messageCount": 1,
                    }
                    continue
                entry["messageCount"] += 1
                if created_at and (entry["startedAt"] is None or created_at < entry["startedAt"]):
                    entry["startedAt"] = created_at
                if created_at and (entry["lastActivity"] is None or created_at > entry["lastActivity"]):
                    entry["lastActivity"] = created_at

            results = sorted(
                grouped.values(),
                key=lambda r: r.get("lastActivity") or "",
                reverse=True,
            )[:20]

            return {"results": results}

        if program_id_column:
            program_id_sql = f"\"{program_id_column}\"" if program_id_column == "ProgramID" else program_id_column
            select_id = f"COALESCE({program_id_sql}, session_id) AS program_id"
            where_clause = (
                "WHERE LOWER(company_name) LIKE LOWER($1) "
                f"OR {program_id_sql} LIKE $1 "
                "OR session_id LIKE $1 "
            )
            group_by = f"GROUP BY COALESCE({program_id_sql}, session_id), company_name "
        else:
            select_id = "session_id"
            where_clause = (
                "WHERE LOWER(company_name) LIKE LOWER($1) "
                "OR session_id LIKE $1 "
            )
            group_by = "GROUP BY session_id, company_name "

        rows = await neon_db.query(
            f"SELECT DISTINCT {select_id}, company_name, "
            "MIN(created_at) as started_at, MAX(created_at) as last_activity, "
            "COUNT(*) as message_count "
            "FROM conversation_logs_v2 "
            f"{where_clause}"
            f"{group_by}"
            "ORDER BY MAX(created_at) DESC "
            "LIMIT 20",
            [f"%{search_term}%"],
        )

        return {
            "results": [
                {
                    "programId": row.get("program_id") or row.get("session_id"),
                    "companyName": row.get("company_name") or "Unknown",
                    "startedAt": row.get("started_at"),
                    "lastActivity": row.get("last_activity"),
                    "messageCount": row.get("message_count"),
                }
                for row in rows
            ]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error searching programs: {str(e)}",
        )
