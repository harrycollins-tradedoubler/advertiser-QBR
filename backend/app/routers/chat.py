import asyncio
import json
import os
import re
import uuid
from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.config import get_settings
from app.routers.agents import AGENTS
from app.routers.td_auth import get_current_td_tokens, impersonate_client_username
from app.services.n8n_client import n8n_client
from app.services.program_request_runs import try_record_program_request

router = APIRouter()
settings = get_settings()


# In-memory thread storage
THREADS: dict[str, list[dict]] = {}
QBR_JOBS: dict[str, dict] = {}
QBR_PREFIX = "QBR_REQUEST "
PPTX_URL_REGEX = re.compile(r"(https?://[^\s\"']+?\.pptx(?:\?[^\s\"']*)?)", re.IGNORECASE)
POLLABLE_TERMINAL_STATES = {"completed", "error", "completed_with_errors"}


def _first_non_empty(mapping: dict, keys: list[str]) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_qbr_response(result: object) -> tuple[str, str | None, str | None]:
    if isinstance(result, dict):
        nested = result.get("data")
        nested_dict = nested if isinstance(nested, dict) else {}
        download_url = _first_non_empty(
            result,
            ["pptx_url", "download_url", "file_url", "url"],
        ) or _first_non_empty(nested_dict, ["pptx_url", "download_url", "file_url", "url"])
        file_name = _first_non_empty(result, ["file_name", "filename"]) or _first_non_empty(
            nested_dict, ["file_name", "filename"]
        )
        response_text = (
            _first_non_empty(result, ["response", "message", "output"])
            or _first_non_empty(nested_dict, ["response", "message", "output"])
            or str(result)
        )
        if not file_name and download_url:
            parsed = urlparse(download_url)
            file_name = os.path.basename(parsed.path) or None
        return response_text, download_url, file_name

    if isinstance(result, str):
        matched = PPTX_URL_REGEX.search(result)
        return result, matched.group(1) if matched else None, None

    result_text = str(result)
    matched = PPTX_URL_REGEX.search(result_text)
    return result_text, matched.group(1) if matched else None, None


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _normalize_date(value: object) -> str:
    text = re.sub(r"[^0-9]", "", str(value or ""))
    return text if len(text) == 8 else ""


def _build_agency_payload(body: dict[str, object]) -> dict[str, object]:
    client_username = _clean_text(
        body.get("clientUsername") or body.get("username") or body.get("impersonateUsername")
    )
    agency_name = _clean_text(body.get("agencyName") or body.get("client") or client_username)
    from_date = _normalize_date(body.get("fromDate") or body.get("startDate") or body.get("dateFrom"))
    to_date = _normalize_date(body.get("toDate") or body.get("endDate") or body.get("dateTo"))

    return {
        **body,
        "type": "AGENCY_QBR_REQUEST",
        "analysisLevel": "agency_portfolio",
        "clientUsername": client_username,
        "agencyName": agency_name,
        "client": agency_name,
        "fromDate": from_date,
        "toDate": to_date,
        "currencyCode": _clean_text(body.get("currencyCode") or "EUR") or "EUR",
        "languageCode": _clean_text(body.get("languageCode") or "EN").upper() or "EN",
        "tdSession": {
            "mode": "backend_agency_impersonation",
            "tokensIncluded": False,
        },
        "requestedFrom": _clean_text(body.get("requestedFrom") or "agency-qbr-extension"),
    }


def _agency_result_url(job_id: str, job: dict[str, object]) -> str:
    download_url = _clean_text(job.get("download_url"))
    if download_url:
        return download_url
    if _clean_text(job.get("status")) == "completed":
        return f"/api/agency-agent/download/{job_id}"
    return ""


def _authorization_bearer(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    return token or None


async def _run_qbr_job(
    job_id: str,
    webhook_url: str,
    message: str,
    thread_id: str,
    extra_data: dict | None = None,
) -> None:
    try:
        result = await n8n_client.call_webhook(
            webhook_url=webhook_url,
            message=message,
            thread_id=thread_id,
            extra_data=extra_data,
        )
        response_text, download_url, file_name = _extract_qbr_response(result)
        QBR_JOBS[job_id]["status"] = "completed"
        QBR_JOBS[job_id]["result"] = response_text
        QBR_JOBS[job_id]["download_available"] = bool(download_url)
        QBR_JOBS[job_id]["download_url"] = download_url
        QBR_JOBS[job_id]["file_name"] = file_name
        QBR_JOBS[job_id]["completed_at"] = datetime.utcnow().isoformat()

        THREADS[thread_id].append(
            {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": response_text,
            }
        )
    except Exception as exc:
        QBR_JOBS[job_id]["status"] = "error"
        QBR_JOBS[job_id]["error"] = str(exc)
        QBR_JOBS[job_id]["completed_at"] = datetime.utcnow().isoformat()


async def _enqueue_agency_job(job_id: str, payload: dict[str, object]) -> None:
    td_tokens = get_current_td_tokens()
    if not td_tokens:
        QBR_JOBS[job_id]["status"] = "error"
        QBR_JOBS[job_id]["error"] = "No agency impersonation token available for this request."
        QBR_JOBS[job_id]["completed_at"] = datetime.utcnow().isoformat()
        return

    thread_id = QBR_JOBS[job_id]["thread_id"]
    message = f"{QBR_PREFIX}{json.dumps(payload)}"
    await _run_qbr_job(
        job_id=job_id,
        webhook_url=settings.agency_qbr_agent_webhook_url,
        message=message,
        thread_id=thread_id,
        extra_data={"td_tokens": td_tokens},
    )


@router.post("/agency-agent")
async def submit_agency_agent(payload: dict[str, object]) -> dict[str, object]:
    agency_payload = _build_agency_payload(payload or {})
    if not agency_payload["clientUsername"]:
        raise HTTPException(status_code=400, detail="clientUsername is required.")
    if not agency_payload["fromDate"] or not agency_payload["toDate"]:
        raise HTTPException(status_code=400, detail="startDate/endDate are required.")

    job_id = str(uuid.uuid4())
    thread_id = job_id
    THREADS[thread_id] = []
    QBR_JOBS[job_id] = {
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
        "thread_id": thread_id,
        "request": agency_payload,
    }

    asyncio.create_task(_enqueue_agency_job(job_id, agency_payload))

    return {
        "ok": True,
        "data": {
            "executionId": job_id,
            "status": "queued",
            "request": agency_payload,
        },
    }


@router.get("/agency-agent/status/{job_id}")
async def get_agency_agent_status(job_id: str) -> dict[str, object]:
    job = QBR_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agency QBR job not found.")

    result_url = _agency_result_url(job_id, job)
    return {
        "ok": True,
        "data": {
            **job,
            "id": job_id,
            "executionId": job_id,
            "resultUrl": result_url,
            "terminal": _clean_text(job.get("status")) in POLLABLE_TERMINAL_STATES,
        },
    }


@router.get("/agency-agent/download/{job_id}")
async def download_agency_agent_file(job_id: str) -> Response:
    job = QBR_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agency QBR job not found.")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail="Agency QBR report is not ready yet.")

    download_url = _clean_text(job.get("download_url"))
    if not download_url:
        raise HTTPException(status_code=404, detail="No downloadable report URL available for this job.")

    parsed = urlparse(download_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid download URL.")

    try:
        async with httpx.AsyncClient(trust_env=False) as client:
            upstream = await client.get(download_url, timeout=120)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download report: {exc}") from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to download report from source.")

    file_name = _clean_text(job.get("file_name")) or os.path.basename(parsed.path) or f"agency-qbr-{job_id}.pptx"
    if not file_name.lower().endswith(".pptx"):
        file_name = f"{file_name}.pptx"

    return Response(
        content=upstream.content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.post("/agency-agent/batch")
async def submit_agency_agent_batch(request: Request, payload: dict[str, object]) -> dict[str, object]:
    rows = payload.get("rows") if isinstance(payload, dict) else []
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="rows[] is required.")

    batch_id = str(uuid.uuid4())
    batch = {
        "id": batch_id,
        "status": "queued",
        "createdAt": datetime.utcnow().isoformat(),
        "rows": [
            {
                "rowNumber": index + 1,
                "status": "queued",
                "payload": _build_agency_payload(row if isinstance(row, dict) else {}),
            }
            for index, row in enumerate(rows)
        ],
    }
    QBR_JOBS[batch_id] = batch

    async def _process_batch() -> None:
        batch["status"] = "running"
        bearer_token = _authorization_bearer(request)
        for row in batch["rows"]:
            row_payload = row["payload"]
            try:
                username = _clean_text(row_payload.get("clientUsername"))
                if not username:
                    raise ValueError("clientUsername is required for each batch row.")
                await impersonate_client_username(username, bearer_token)

                job_id = str(uuid.uuid4())
                row["executionId"] = job_id
                row["status"] = "running"
                THREADS[job_id] = []
                QBR_JOBS[job_id] = {
                    "status": "queued",
                    "created_at": datetime.utcnow().isoformat(),
                    "thread_id": job_id,
                    "request": row_payload,
                }
                await _enqueue_agency_job(job_id, row_payload)
                job = QBR_JOBS.get(job_id, {})
                row["status"] = "success" if job.get("status") == "completed" else "error"
                row["result"] = job.get("result")
                row["download_url"] = job.get("download_url")
                row["file_name"] = job.get("file_name")
                row["error"] = job.get("error")
            except Exception as exc:
                row["status"] = "error"
                row["error"] = str(exc)
        batch["status"] = "completed_with_errors" if any(row["status"] == "error" for row in batch["rows"]) else "completed"

    asyncio.create_task(_process_batch())

    return {
        "ok": True,
        "data": {
            "batchId": batch_id,
            "status": "queued",
            "rowCount": len(batch["rows"]),
        },
    }


@router.get("/agency-agent/batch/{batch_id}/status")
async def get_agency_agent_batch_status(batch_id: str) -> dict[str, object]:
    batch = QBR_JOBS.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Agency batch not found.")
    return {"ok": True, "data": {"batch": batch}}


@router.post("/chat")
async def send_message(request: Request):
    """Send a message to an agent and get a response."""
    body = await request.json()

    agent_id = body.get("agentId") or body.get("agent_id") or ""
    message = body.get("message", "")
    thread_id = body.get("threadId") or body.get("thread_id")

    if not agent_id or not message:
        return {"error": "agentId and message are required"}, 400

    agent = AGENTS.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Agent is not active")

    if not thread_id:
        thread_id = str(uuid.uuid4())
    if thread_id not in THREADS:
        THREADS[thread_id] = []

    THREADS[thread_id].append(
        {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": message,
        }
    )

    # QBR request handling: enqueue long-running job and return immediately.
    if message.startswith(QBR_PREFIX) and agent.webhook_url:
        payload_text = message[len(QBR_PREFIX) :].strip()
        try:
            payload_obj = json.loads(payload_text)
        except json.JSONDecodeError:
            response_text = "Invalid QBR request payload."
            THREADS[thread_id].append(
                {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": response_text,
                }
            )
            return {
                "response": response_text,
                "threadId": thread_id,
            }

        await try_record_program_request(payload_obj)

        job_id = str(uuid.uuid4())
        QBR_JOBS[job_id] = {
            "status": "queued",
            "created_at": datetime.utcnow().isoformat(),
            "thread_id": thread_id,
        }
        td_tokens = get_current_td_tokens()
        if not td_tokens and isinstance(payload_obj, dict):
            payload_tokens = payload_obj.get("td_tokens") or payload_obj.get("tdTokens")
            if isinstance(payload_tokens, dict):
                user_token = str(payload_tokens.get("user_access_token") or "").strip()
                impersonate_token = str(payload_tokens.get("impersonate_access_token") or "").strip()
                if user_token and impersonate_token:
                    td_tokens = {
                        "user_access_token": user_token,
                        "impersonate_access_token": impersonate_token,
                    }
        extra_data = {"td_tokens": td_tokens} if td_tokens else None
        asyncio.create_task(
            _run_qbr_job(
                job_id,
                agent.webhook_url,
                message,
                thread_id,
                extra_data=extra_data,
            )
        )
        response_text = "QBR request received. Generating report now..."

        THREADS[thread_id].append(
            {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": response_text,
            }
        )

        return {
            "response": response_text,
            "threadId": thread_id,
            "jobId": job_id,
            "jobStatus": "queued",
        }

    if agent.webhook_url:
        try:
            result = await n8n_client.call_webhook(
                webhook_url=agent.webhook_url,
                message=message,
                thread_id=thread_id,
            )
            response_text = result.get("response", result.get("output", str(result)))
        except Exception as exc:
            response_text = f"Error calling agent: {exc}"
    else:
        response_text = (
            f"Hello! I'm the {agent.name}. "
            "My webhook is not configured yet, but I'll be ready to help soon. "
            "What would you like to discuss?"
        )

    THREADS[thread_id].append(
        {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": response_text,
        }
    )

    return {
        "response": response_text,
        "threadId": thread_id,
    }


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str):
    """Get all messages in a thread."""
    if thread_id not in THREADS:
        raise HTTPException(status_code=404, detail="Thread not found")
    return THREADS[thread_id]


@router.get("/qbr/{job_id}")
async def get_qbr_status(job_id: str):
    job = QBR_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="QBR job not found")
    return job


@router.get("/qbr/{job_id}/download")
async def download_qbr_file(job_id: str):
    job = QBR_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="QBR job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail="QBR report is not ready yet")

    download_url = str(job.get("download_url") or "").strip()
    if not download_url:
        raise HTTPException(status_code=404, detail="No downloadable report URL available for this job")

    parsed = urlparse(download_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid download URL")

    try:
        async with httpx.AsyncClient(trust_env=False) as client:
            upstream = await client.get(download_url, timeout=120)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download report: {exc}") from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to download report from source")

    file_name = str(job.get("file_name") or "").strip()
    if not file_name:
        file_name = os.path.basename(parsed.path) or f"qbr-report-{job_id}.pptx"
    if not file_name.lower().endswith(".pptx"):
        file_name = f"{file_name}.pptx"

    return Response(
        content=upstream.content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )
