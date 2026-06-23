from fastapi import APIRouter, HTTPException

from app.services.batch_runs import create_batch_run, get_batch_run, list_batch_runs, record_batch_run_item

router = APIRouter()


@router.get("/batch-runs")
async def get_batch_runs(limit: int = 25) -> dict[str, list[dict]]:
    try:
        return {"batches": await list_batch_runs(limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching batch runs: {exc}") from exc


@router.post("/batch-runs")
async def post_batch_run(payload: dict) -> dict[str, dict]:
    try:
        return {"batch": await create_batch_run(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error creating batch run: {exc}") from exc


@router.get("/batch-runs/{batch_id}")
async def get_batch_run_by_id(batch_id: str) -> dict[str, dict]:
    try:
        batch = await get_batch_run(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching batch run: {exc}") from exc
    if not batch:
        raise HTTPException(status_code=404, detail="Batch run not found.")
    return {"batch": batch}


@router.post("/batch-runs/{batch_id}/items")
async def post_batch_run_item(batch_id: str, payload: dict) -> dict[str, dict]:
    try:
        return {"batch": await record_batch_run_item(batch_id, payload)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error recording batch run item: {exc}") from exc
