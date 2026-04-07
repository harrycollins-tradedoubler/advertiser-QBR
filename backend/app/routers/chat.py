import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from app.routers.agents import AGENTS
from app.routers.td_auth import get_current_td_tokens
from app.services.n8n_client import n8n_client

router = APIRouter()


# In-memory thread storage
THREADS: dict[str, list[dict]] = {}
QBR_JOBS: dict[str, dict] = {}
QBR_PREFIX = "QBR_REQUEST "


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
        response_text = result.get("response", result.get("output", str(result)))
        QBR_JOBS[job_id]["status"] = "completed"
        QBR_JOBS[job_id]["result"] = response_text
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
