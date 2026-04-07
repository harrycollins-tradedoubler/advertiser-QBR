from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import agents, chat, onboarding, td_auth

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Agent Hub API - Connect to your AI agents",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(agents.router, prefix="/api", tags=["agents"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(onboarding.router, prefix="/api", tags=["onboarding"])
app.include_router(td_auth.router, prefix="/api", tags=["td-auth"])


@app.get("/")
async def root():
    return {"message": "Agent Hub API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
