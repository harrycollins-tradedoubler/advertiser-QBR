from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter()
settings = get_settings()


class Agent(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    webhook_url: str
    is_active: bool = True


# In-memory agent registry - replace with database later.
AGENTS: dict[str, Agent] = {
    "qbr-agent": Agent(
        id="qbr-agent",
        name="QBR Agent",
        description=(
            "Quarterly Business Review assistant that helps analyze performance metrics, "
            "identify trends, and prepare executive summaries."
        ),
        icon="chart",
        webhook_url=settings.qbr_agent_webhook_url,
        is_active=True,
    ),
}


@router.get("/agents")
async def list_agents() -> list[Agent]:
    """List all available agents."""
    return [agent for agent in AGENTS.values() if agent.is_active]


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str) -> Agent | None:
    """Get a specific agent by ID."""
    return AGENTS.get(agent_id)
