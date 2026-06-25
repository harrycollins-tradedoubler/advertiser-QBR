# Advertiser QBR Agent Instructions

## Current Project Reality

This repository is centered on a local Advertiser QBR deck-generation flow for Tradedoubler.

The active runtime path is:

1. Chrome extension in `advertiser-agent-extension/`
2. Local Node.js runner in `advertiser-qbr-local-runner/`
3. PowerPoint generator in `qbr-pptx-service/`

The old n8n workflows are retired. They are kept only as archived reference material under `workflows/archive/`.

## Primary Modules

- `advertiser-agent-extension/`: Chrome extension UI for TD admin login, client impersonation, program selection, batch runs, and QBR submission.
- `advertiser-qbr-local-runner/`: Local Node.js HTTP runner that accepts extension requests, fetches TD data, prepares analysis payloads, and calls the PPTX service.
- `qbr-pptx-service/`: Node.js service that generates editable `.pptx` decks and signed download URLs.
- `backend/`: Auxiliary FastAPI support for program-request run logs and related local API utilities.
- `frontend/`: Legacy React UI. Do not treat it as the primary QBR interface unless the user explicitly asks for legacy frontend work.
- `td-app/`: Separate nested reference repository. Keep it documented as reference material, not part of the primary local runtime.

## Local URLs

- Extension QBR target: `http://127.0.0.1:3021/webhook-local/advertiser-qbr`
- Local runner health: `http://127.0.0.1:3021/health`
- PPTX service: `http://127.0.0.1:3011`
- PPTX service health: `http://127.0.0.1:3011/health`
- Optional backend API: `http://127.0.0.1:8008/api`

## Runtime Flow

1. The user opens the unpacked Chrome extension.
2. The extension authenticates against TD, impersonates the advertiser client, and lists available programs.
3. The user selects programs, date range, language, and currency.
4. The extension sends a `QBR_REQUEST` payload to the local runner.
5. The runner fetches current and previous-period TD statistics, publisher rows, category rows, and publisher metadata.
6. The runner builds the final PPTX payload and posts it to `qbr-pptx-service`.
7. The PPTX service writes an editable PowerPoint file and returns signed file URLs.
8. The extension displays the resulting download links.

The optional backend can record/list program request runs, but it is not in the main deck-generation path.

## Environment

Local runner:

- `PORT` defaults to `3021`
- `HOST` defaults to `127.0.0.1`
- `ADVERTISER_QBR_GENERATOR_URL` defaults to `http://127.0.0.1:3011/generate`
- `QBR_PPTX_API_KEY` defaults to `td-qbr-pptx-local-2026-secret`
- `ADVERTISER_QBR_AGENT_MODE=deterministic` avoids OpenAI model calls
- `OPENAI_API_KEY` enables model-backed narrative generation when the runner mode requires it
- `ADVERTISER_QBR_DEBUG_DIR` writes redacted debug payloads

PPTX service:

- `PORT` defaults to `3011`
- `QBR_PPTX_API_KEY` or `API_KEY` overrides the local API key
- `PUBLIC_BASE_URL` controls generated file URLs

Backend:

- Use only for auxiliary run-log/API work unless the user explicitly asks for legacy backend orchestration.
- Keep any n8n-related backend settings documented as legacy compatibility only.

## Validation Defaults

For local runner changes:

```powershell
cd advertiser-qbr-local-runner
npm test
```

For PPTX service changes:

```powershell
cd qbr-pptx-service
npm test
```

For extension changes:

- Load the unpacked extension from `advertiser-agent-extension/`.
- Confirm the QBR endpoint is `http://127.0.0.1:3021/webhook-local/advertiser-qbr`.
- Submit a small deterministic request when TD credentials are available.

For auxiliary backend changes:

- Run focused Python checks or API smoke tests for the touched endpoints.

Do not skip practical validation unless the user explicitly asks.

## Workspace Safety

- The worktree may contain user changes. Never revert changes you did not make unless explicitly requested.
- Do not commit generated outputs, `node_modules`, virtualenvs, temp folders, debug payloads, or local `.env` files.
- Keep TD tokens, API keys, cookies, passwords, and client secrets out of docs, logs, and committed fixtures.
- Keep changes scoped to the requested task.
- Before adding a production dependency, explain why existing project patterns are insufficient.

## Retired Context

- n8n workflows under `workflows/archive/` are historical exports only.
- The old React frontend and FastAPI n8n orchestration docs are historical unless the user asks to revive that path.
- The original Agentic RAG masterclass material is not current project scope.
