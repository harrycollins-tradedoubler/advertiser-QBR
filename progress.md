# Agentic RAG Masterclass - Progress Tracker

## Module Status

| Module | Name | Status |
|--------|------|--------|
| 1 | App Shell (Auth + Chat UI + Managed RAG) | not started |
| 2 | Bring Your Own Retrieval (Ingestion + pgvector) | not started |
| 3 | Record Manager (Deduplication) | not started |
| 4 | Metadata Extraction & Filtering | not started |
| 5 | Multi-format Support (Docling) | not started |
| 6 | Hybrid Search & Reranking | not started |
| 7 | Additional Tools (Web Search + Text-to-SQL) | not started |
| 8 | Sub-Agents (Document Analysis) | not started |

## Current Phase
Ready to begin Module 1

## Recent Changes
- Initial project setup
- Updated QBR n8n webhook configuration to the migrated host (`coe-n8n.coe-untrust-eu-de.prod.tddrift.net`) across backend defaults, env examples, and n8nac host config.
- Added backend Gamma status proxy endpoint and switched frontend Gamma status polling to call backend API instead of direct browser-to-n8n calls.
- Fixed root startup script path resolution so startup works from the current repo location.
- Added root one-click wrappers (`start-services.cmd`, `stop-services.cmd`) for frontend/backend service control.
- Aligned local one-click startup ports so backend now launches on `http://localhost:8008` to match frontend API defaults.
- Fixed backend launcher command to use `python -m uvicorn` (avoids broken `uvicorn.exe` path bindings after folder move).
- Restored the missing standalone `qbr-pptx-service` source files from the prior Codex session log and reinstalled its `pptxgenjs` dependency.
- Added `programScopeTable` support to the PPTX renderer so org-level program breakdown data is rendered as a dedicated `Program-Level Breakdown` table slide.
- Refreshed `qbr-pptx-service/sample-payload.json` with example per-program rows and validated end-to-end PPTX generation into `qbr-pptx-service/outputs/`.
- Restored the lost TD auth flow in the frontend/backend: the QBR form now includes TD access token, Organisation ID, program loading, analysis scope, publisher coverage, language, and currency; backend TD auth/program routes were re-added and QBR jobs again pass `td_tokens` through to n8n.
- Fixed the service stop script PowerShell variable collision (`$PID`) so local restarts no longer fail while cleaning up the frontend process.
- Hardened the TD auth router to convert upstream request failures and malformed TD responses into normal API errors instead of raw 500s, and capped TD program fetches at the API-supported max of 100.
- Improved frontend TD error handling so the QBR form now shows backend `detail` messages for token validation, impersonation, and program loading failures.
- Disabled environment proxy inheritance for TD API calls after discovering the machine was forcing outbound HTTPS traffic through a dead local proxy (`127.0.0.1:9`), which was causing every TD auth request to fail with `502`.
- Disabled environment proxy inheritance for n8n webhook calls as well, because QBR jobs could queue locally but fail before reaching the remote webhook for the same proxy reason.
- Moved the QBR agent webhook target into config/env and updated it to `https://coe-n8n.coe-untrust-eu-de.prod.tddrift.net/webhook/qbr-v4-presenton-1e2f9f4d`.
- Fixed `/api/chat` so malformed `QBR_REQUEST` payloads return immediately instead of falling through to regular chat webhook calls.
- Made n8n webhook handling tolerant of successful non-JSON responses, preventing false `QBR job error` states when the webhook returns plain text or an empty body.
- Added deterministic TD token forwarding to QBR runs: `/api/td/programs` now returns `td_tokens`, the frontend includes them in QBR payloads, and `/api/chat` forwards payload tokens to n8n when in-memory token state is missing.

## Known Issues
None yet

## Backlog
- Items discovered during development that need future attention
