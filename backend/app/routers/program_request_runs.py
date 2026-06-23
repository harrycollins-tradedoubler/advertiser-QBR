from fastapi import APIRouter, HTTPException

from app.services.program_request_runs import list_program_request_runs, record_program_request_result

router = APIRouter()


@router.get("/program-request-runs")
async def get_program_request_runs(limit: int = 100) -> dict[str, list[dict[str, str]]]:
    try:
        return {"runs": await list_program_request_runs(limit=limit)}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching program request runs: {exc}",
        ) from exc


@router.post("/program-request-runs")
async def create_program_request_run(payload: dict) -> dict[str, bool | str]:
    try:
        request_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
        return await record_program_request_result(request_payload)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error recording program request run: {exc}",
        ) from exc
