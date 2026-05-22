# TD QBR Agent Hub - Progress Tracker

Last updated: 2026-05-12

## Current Phase

The active workstream is the TD QBR Agent Hub: frontend QBR request flow, FastAPI orchestration, TD API integration, n8n QBR webhook execution, and editable PPTX generation.

The old Agentic RAG module tracker is retired as current planning material.

## System Status

| Area | Status | Notes |
|------|--------|-------|
| Frontend QBR request UI | in progress | Supports TD token entry, Organisation ID, program loading, multi-program selection, language, currency, date range, submission, polling, and download |
| Backend QBR orchestration | in progress | Queues in-memory QBR jobs, calls n8n asynchronously, handles non-JSON webhook success, and proxies PPTX downloads |
| TD auth/program integration | in progress | Fetches users, impersonates eligible user, fetches programs, returns token fallback data, and avoids environment proxy inheritance |
| n8n QBR webhook | in progress | Configured through `QBR_AGENT_WEBHOOK_URL`; backend default points at the migrated host |
| PPTX renderer | in progress | Standalone Node service generates editable TD-branded QBR decks with program-level breakdown support |
| Original RAG modules | retired | Historical context only |

## Recent Completed Work

- Updated QBR n8n webhook configuration to the migrated host: `coe-n8n.coe-untrust-eu-de.prod.tddrift.net`.
- Moved QBR webhook target into backend config/env as `QBR_AGENT_WEBHOOK_URL`.
- Fixed root startup script path resolution for the current repo location.
- Added one-click wrappers for local frontend/backend service control.
- Aligned backend local port to `http://localhost:8008`.
- Fixed backend launcher to use `python -m uvicorn`.
- Restored the standalone `qbr-pptx-service` source files and `pptxgenjs` dependency.
- Added `programScopeTable` support to the PPTX renderer.
- Refreshed `qbr-pptx-service/sample-payload.json` with per-program rows.
- Validated end-to-end PPTX generation into `qbr-pptx-service/outputs/`.
- Restored TD auth flow in frontend and backend.
- Re-added backend TD auth/program routes.
- Updated QBR jobs to pass `td_tokens` through to n8n.
- Fixed service stop script PowerShell variable collision with `$PID`.
- Hardened TD auth router error handling for request failures and malformed responses.
- Capped TD program fetches at the API-supported maximum of 100.
- Improved frontend TD error handling so backend `detail` messages are visible.
- Disabled environment proxy inheritance for TD API calls.
- Disabled environment proxy inheritance for n8n webhook calls.
- Fixed malformed `QBR_REQUEST` payload handling so invalid payloads do not fall through to normal chat calls.
- Made n8n webhook handling tolerant of successful plain-text or empty responses.
- Added deterministic TD token forwarding when backend in-memory token state is missing.
- Updated project Markdown docs to reflect the current QBR system and imported concise Karpathy-style agent behavior guidelines.

## Known Issues

- QBR jobs and chat threads are stored in memory, so they are lost on backend restart.
- TD token state is stored in memory; the frontend payload token fallback reduces but does not fully remove restart/session limitations.
- `frontend/.env.example` still points to `http://localhost:8000`; current local backend default is `http://localhost:8008`.
- Startup/stop scripts still use the old "Agentic RAG" naming in console messages.
- The repo contains generated/local artifacts such as virtualenvs, `node_modules`, outputs, and temporary files; avoid committing them unless explicitly requested.
- Git currently sees old root docs as deleted and replacement docs under `Files/`; do not normalize that layout without an explicit cleanup task.

## Backlog

- Decide whether docs should live at repo root, under `Files/`, or both.
- Update frontend env example to `http://localhost:8008`.
- Rename startup script console messages from Agentic RAG to TD QBR Agent Hub.
- Add persistent storage for QBR job status and chat threads if multi-session reliability becomes required.
- Add focused backend tests for TD auth error handling, QBR request parsing, n8n response normalization, and download proxying.
- Add frontend tests around QBR form validation and job polling.
- Expand PPTX renderer tests for multi-program and multi-language output.
- Review which temporary/generated files should be ignored or cleaned before commit.
