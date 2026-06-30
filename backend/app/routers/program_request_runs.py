from fastapi import APIRouter, HTTPException

from app.services.program_request_runs import list_program_request_runs, record_program_request_result

router = APIRouter()


@router.get("/program-request-runs")
async def get_program_request_runs(limit: int = 100) -> dict[str, list[dict]]:
    try:
        return {"runs": await list_program_request_runs(limit=limit)}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching program request runs: {exc}",
        ) from exc


def _first_duration_value(payload: dict, request_payload: dict):
    for source in (payload, request_payload):
        for key in ("buildDurationMs", "build_duration_ms", "durationMs", "duration_ms", "elapsedMs", "elapsed_ms"):
            if isinstance(source, dict) and key in source:
                return source.get(key)
    return None


@router.post("/program-request-runs")
async def create_program_request_run(payload: dict) -> dict[str, object]:
    try:
        request_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
        build_duration_ms = _first_duration_value(payload, request_payload)
        if build_duration_ms is None:
            return await record_program_request_result(request_payload)
        return await record_program_request_result(request_payload, build_duration_ms=build_duration_ms)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error recording program request run: {exc}",
        ) from exc
