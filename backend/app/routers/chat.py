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

from app.routers.agents import AGENTS
from app.routers.td_auth import get_current_td_tokens
from app.services.n8n_client import n8n_client

router = APIRouter()


# In-memory thread storage
THREADS: dict[str, list[dict]] = {}
QBR_JOBS: dict[str, dict] = {}
QBR_PREFIX = "QBR_REQUEST "
PPTX_URL_REGEX = re.compile(r"(https?://[^\s\"']+?\.pptx(?:\?[^\s\"']*)?)", re.IGNORECASE)


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
