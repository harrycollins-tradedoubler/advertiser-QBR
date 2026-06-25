# Advertiser QBR Local Deck Generator - Progress Tracker

Last updated: 2026-06-25

## Current Phase

The active workstream is the local Advertiser QBR workflow:

```text
Chrome extension / TD app -> local Node.js runner -> PowerPoint service
```

n8n workflow execution is retired for the current local path.

## System Status

| Area | Status | Notes |
| --- | --- | --- |
| Chrome extension | active | Handles TD login, impersonation, program loading, single requests, batch requests, and result links |
| Local runner | active | Accepts extension QBR requests, fetches TD data, builds the PPTX payload, and calls the generator |
| PPTX service | active | Generates editable TD-branded Advertiser QBR decks and signed download URLs |
| Auxiliary backend | optional | Supports program-request run logs and duplicate checks when running |
| Legacy React frontend | legacy | Not the primary QBR interface |
| n8n workflows | retired | Archived under `workflows/archive/` for reference only |
| Original RAG modules | retired | Historical context only |

## Recent Completed Work

- Switched the active QBR path from n8n to the local Node.js runner.
- Set the extension default QBR endpoint to `http://127.0.0.1:3021/webhook-local/advertiser-qbr`.
- Added local-runner orchestration for TD statistics, publisher data, narrative payloads, and PPTX generation.
- Kept the backend available for auxiliary program-request run logging.
- Standardized the advertiser PPTX service on port `3011`.
- Archived retired n8n workflow exports in the repo.
- Renamed root agent instructions to `AGENTS.md`.
- Updated root and service docs to describe the current local flow.

## Known Issues

- The extension depends on valid TD credentials or tokens for real end-to-end runs.
- The optional backend must be running for duplicate checks and run-log listing.
- Debug artifacts can become large if `ADVERTISER_QBR_DEBUG_DIR` is enabled.
- Generated decks and temporary PowerPoint inspection files should stay out of commits.
- The old React frontend remains in the repo but is not the main operator UI.

## Backlog

- Add a one-command local startup helper for the active runner plus PPTX service.
- Add a concise extension installation screenshot or checklist if onboarding remains error-prone.
- Review whether the optional backend run-log API should be folded into the local runner.
- Add more local-runner tests for multi-program batches, duplicate handling, and TD error responses.
- Expand PPTX tests for language/currency variants and supporting workbook outputs.
- Periodically prune ignored temp folders and generated local dependencies.
