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

## Known Issues
None yet

## Backlog
- Items discovered during development that need future attention
