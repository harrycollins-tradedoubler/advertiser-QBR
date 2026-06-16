# TD QBR Agent Hub

This repo currently supports a Tradedoubler QBR workflow: a React frontend, FastAPI backend, n8n-powered QBR agent, TD program/auth integration, and a standalone editable PPTX renderer.

The original Agentic RAG masterclass docs are no longer the best description of the active product.

## Active n8n Source

- Active workflow source of truth: advertiser workflow `WpsIHbeMDD86vg5y`
- Unless explicitly stated otherwise, use the advertiser workflow as the current implementation reference for backend and presentation behavior.
- Do not assume publisher workflow exports are the active runtime path.

## Active Applications

| Area | Path | Purpose |
|------|------|---------|
| Frontend | `frontend/` | React UI for selecting the QBR agent, authenticating TD access, selecting programs, and requesting QBR reports |
| Backend | `backend/` | FastAPI API for agents, chat, TD auth/program lookup, QBR job status, and report download proxying |
| PPTX service | `qbr-pptx-service/` | Node service that renders editable PowerPoint decks from QBR payloads |
| TD reference app | `td-app/` | Separate TD app/reference codebase, not the main local runtime |
| Plans and docs | `agent-plans/`, `Files/` | Historical plans and current project documentation |

## Local URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8008`
- PPTX service: `http://localhost:3010`

## Run Locally

Start frontend and backend:

```powershell
.\scripts\start-services.ps1
```

Stop frontend and backend:

```powershell
.\scripts\stop-services.ps1
```

Start the PPTX service separately:

```powershell
cd qbr-pptx-service
npm run start
```

## QBR Workflow Summary

1. User enters a TD access token and Organisation ID in the frontend.
2. Backend calls TD APIs to find an eligible organisation user, impersonate them, and fetch programs.
3. Frontend submits selected program IDs, language, currency, date range, and TD tokens as a `QBR_REQUEST`.
4. Backend queues the job in memory and calls the configured n8n webhook.
5. Frontend polls backend job status.
6. If n8n returns a PPTX URL, backend proxies the PowerPoint download.
7. The separate PPTX service can be called by n8n to generate editable decks.

## Useful Commands

Frontend:

```powershell
cd frontend
npm run build
npm run lint
```

PPTX service:

```powershell
cd qbr-pptx-service
npm test
npm run start
```

Backend smoke check:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

## Documentation Map

- `Files/CLAUDE.md`: working agent instructions and project context
- `Files/progress.md`: current status, recent changes, known issues, and backlog
- `Files/PRD.md`: current product requirements for the QBR Agent Hub
- `qbr-pptx-service/README.md`: PPTX service API and auth notes
- `backend/.env.example`: backend configuration shape
- `frontend/.env.example`: frontend API URL configuration

## Notes For Future Work

- Do not treat the old RAG module table as current scope.
- Keep webhook URLs, TD API URLs, and local ports explicit when changing runtime behavior.
- Prefer small, verifiable changes with focused tests or build checks.
