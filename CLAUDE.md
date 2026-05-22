# TD QBR Agent Hub - Agent Instructions

## Current Project Reality

This repository is now centered on a Tradedoubler QBR workflow, not the original Agentic RAG masterclass plan.

The active system is:
- Frontend: React + TypeScript + Vite in `frontend/`
- Backend: Python + FastAPI in `backend/`
- QBR automation: backend calls a remote n8n webhook for the QBR agent
- TD integration: backend validates TD user tokens, impersonates an organisation owner/admin, fetches programs, and forwards TD tokens into QBR jobs
- PPTX rendering: standalone Node service in `qbr-pptx-service/` generates editable PowerPoint decks with `pptxgenjs`
- Optional/reference app: `td-app/` contains a separate TD app codebase and is not the primary local service path

Do not treat the old RAG module plan as the source of truth. Use this file, `progress.md`, source code, and recent git history before making changes.

## Primary Local Services

- Backend API: `http://localhost:8008`
- Frontend: `http://localhost:5173`
- PPTX service: `http://localhost:3010`

Startup helpers:
- Start frontend and backend: `scripts/start-services.ps1`
- Stop frontend and backend: `scripts/stop-services.ps1`
- Restart frontend and backend: `scripts/restart-services.ps1`
- Root wrappers may also exist as `start-services.cmd` and `stop-services.cmd`

The startup scripts currently launch:
- `backend/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008`
- `npm run dev` from `frontend/`

The PPTX service is started separately from `qbr-pptx-service/` with:

```powershell
npm run start
```

## Main Runtime Flow

1. User opens the frontend and selects the QBR Agent.
2. User enters a TD access token and Organisation ID.
3. Frontend calls `GET /api/td/programs`.
4. Backend finds an organisation user, impersonates that user, fetches up to 100 TD programs, and returns the programs plus TD token data.
5. User selects one or more programs, language, currency, and reporting period.
6. Frontend sends a `QBR_REQUEST` message to `POST /api/chat`.
7. Backend queues an in-memory QBR job and calls the configured n8n webhook asynchronously.
8. Backend exposes job status at `GET /api/qbr/{job_id}`.
9. If n8n returns a PPTX URL, backend proxies downloads through `GET /api/qbr/{job_id}/download`.

Important implementation details:
- QBR jobs and chat threads are currently in-memory dictionaries in `backend/app/routers/chat.py`.
- TD tokens are stored in-process in `backend/app/routers/td_auth.py` and are also passed in the QBR payload as a fallback.
- TD and n8n HTTP clients use `trust_env=False` to avoid broken local proxy inheritance.
- Successful non-JSON n8n responses are accepted and converted into a normal response object.

## Key Files

- `backend/app/main.py`: FastAPI app setup and router registration
- `backend/app/config.py`: environment-backed settings
- `backend/app/routers/agents.py`: active agent registry
- `backend/app/routers/chat.py`: chat endpoint, QBR job queue, status, and download proxy
- `backend/app/routers/td_auth.py`: TD token, impersonation, organisation, and program routes
- `backend/app/services/n8n_client.py`: n8n webhook client
- `frontend/src/components/QbrRequestForm.tsx`: TD auth and QBR request UI
- `frontend/src/lib/api.ts`: frontend API client
- `qbr-pptx-service/server.js`: PPTX service HTTP API
- `qbr-pptx-service/lib/generator.js`: deck generation and slide logic
- `qbr-pptx-service/test/`: Node test suite
- `qbr-pptx-service/sample-payload.json`: local render sample payload

## Environment

Backend `.env` / `.env.example`:
- `DEBUG`
- `CORS_ORIGINS`
- `DATABASE_URL`
- `NEON_API_URL`
- `QBR_AGENT_WEBHOOK_URL`

Backend defaults include:
- `TD_USER_URL=https://connect.tradedoubler.com/usermanagement`
- `TD_MANAGE_URL=https://connect.tradedoubler.com/advertiser`
- `TD_IMPERSONATE_URL=https://connect.tradedoubler.com/uaa/admin/impersonate`

Frontend `.env.example` currently shows `VITE_API_URL=http://localhost:8000`; local code defaults to `http://localhost:8008`. Prefer `8008` unless intentionally changing the backend port.

PPTX service:
- `QBR_PPTX_API_KEY` overrides the local default key
- Local default key: `td-qbr-pptx-local-2026-secret`

## Validation Defaults

For frontend changes:
- Run `npm run build` from `frontend/`
- Run `npm run lint` if the lint setup is relevant to the touched files

For backend changes:
- Prefer focused Python checks or API smoke tests
- If tests are added later, run the relevant pytest target

For PPTX service changes:
- Run `npm test` from `qbr-pptx-service/`
- For rendering behavior, generate a deck from `sample-payload.json` and inspect the output when layout risk is meaningful

Do not skip available checks unless the user explicitly asks or the repo lacks a practical way to run them.

## Agent Behavior Guidelines

These project rules incorporate the useful parts of the Karpathy-inspired coding guidelines.

Think before coding:
- State assumptions when the request is ambiguous.
- Ask only when a reasonable assumption would be risky.
- Surface tradeoffs when there are multiple plausible implementation paths.

Simplicity first:
- Implement the smallest useful vertical slice.
- Do not add speculative features, abstractions, providers, or configuration.
- Before adding a new production dependency, explain why existing code cannot reasonably do the job.

Surgical changes:
- Touch only files needed for the request.
- Match the local style even when another style would be preferred.
- Do not refactor adjacent code or reformat unrelated files.
- Remove only dead code created by your own change unless the user asks for cleanup.

Goal-driven execution:
- Convert feature and bug work into verifiable outcomes.
- Prefer a focused test or reproduction first when changing behavior.
- Loop until the relevant checks pass or clearly report why a check could not be run.

## Git And Workspace Safety

- The worktree may already contain user or generated changes. Never revert changes you did not make unless explicitly asked.
- If root docs appear deleted and replacement files exist under `Files/`, treat that as existing workspace state and do not "fix" it without being asked.
- Do not commit generated outputs, `node_modules`, virtualenvs, or temporary files unless explicitly requested.
- Avoid changing webhook URLs, TD API base URLs, credentials, or ports without calling out the reason.

## Deprecated Context

- The original Agentic RAG module roadmap is historical context only.
