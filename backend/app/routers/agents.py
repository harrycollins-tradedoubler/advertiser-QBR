from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class Agent(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    webhook_url: str
    is_active: bool = True


# In-memory agent registry - replace with database later
AGENTS: dict[str, Agent] = {
    "qbr-agent": Agent(
        id="qbr-agent",
        name="QBR Agent",
        description="Quarterly Business Review assistant that helps analyze performance metrics, identify trends, and prepare executive summaries.",
        icon="📊",
        webhook_url="https://coe-n8n.common-eu-de.services.tddrift.net/webhook/09c4b38c-24b8-4850-9fc2-0196608bdd25",
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
