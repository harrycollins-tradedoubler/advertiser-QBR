from fastapi import APIRouter, HTTPException, Request
import asyncio
import uuid
import json
from datetime import datetime

from app.routers.agents import AGENTS
from app.services.n8n_client import n8n_client

router = APIRouter()


# In-memory thread storage
THREADS: dict[str, list[dict]] = {}
QBR_JOBS: dict[str, dict] = {}
QBR_PREFIX = "QBR_REQUEST "


async def _run_qbr_job(job_id: str, webhook_url: str, message: str, thread_id: str) -> None:
    try:
        result = await n8n_client.call_webhook(
            webhook_url=webhook_url,
            message=message,
            thread_id=thread_id,
        )
        response_text = result.get("response", result.get("output", str(result)))
        QBR_JOBS[job_id]["status"] = "completed"
        QBR_JOBS[job_id]["result"] = response_text
        QBR_JOBS[job_id]["completed_at"] = datetime.utcnow().isoformat()

        THREADS[thread_id].append({
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": response_text,
        })
    except Exception as e:
        QBR_JOBS[job_id]["status"] = "error"
        QBR_JOBS[job_id]["error"] = str(e)
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

    # Get the agent
    agent = AGENTS.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Agent is not active")

    # Create or use existing thread
    if not thread_id:
        thread_id = str(uuid.uuid4())

    if thread_id not in THREADS:
        THREADS[thread_id] = []

    # Store user message
    THREADS[thread_id].append({
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": message,
    })

    # QBR request handling: enqueue long-running job and return immediately
    if message.startswith(QBR_PREFIX) and agent.webhook_url:
        payload_text = message[len(QBR_PREFIX):].strip()
        try:
            json.loads(payload_text)
        except json.JSONDecodeError:
            response_text = "Invalid QBR request payload."
        else:
            job_id = str(uuid.uuid4())
            QBR_JOBS[job_id] = {
                "status": "queued",
                "created_at": datetime.utcnow().isoformat(),
                "thread_id": thread_id,
            }
            asyncio.create_task(_run_qbr_job(job_id, agent.webhook_url, message, thread_id))
            response_text = "QBR request received. Generating report now…"

            THREADS[thread_id].append({
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": response_text,
            })

            return {
                "response": response_text,
                "threadId": thread_id,
                "jobId": job_id,
                "jobStatus": "queued",
            }

    # Call n8n webhook if configured (regular chat)
    if agent.webhook_url:
        try:
            result = await n8n_client.call_webhook(
                webhook_url=agent.webhook_url,
                message=message,
                thread_id=thread_id,
            )
            response_text = result.get("response", result.get("output", str(result)))
        except Exception as e:
            response_text = f"Error calling agent: {str(e)}"
    else:
        response_text = f"Hello! I'm the {agent.name}. My webhook is not configured yet, but I'll be ready to help soon. What would you like to discuss?"

    # Store assistant message
    THREADS[thread_id].append({
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": response_text,
    })

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
