# Advertiser QBR Local Deck Generator

This repository supports the current local Tradedoubler Advertiser QBR flow:

```text
Chrome extension / TD app -> local Node.js runner -> PowerPoint service
```

n8n is no longer part of the active runtime. Historical workflow exports are archived under `workflows/archive/` for reference only.

## Active Applications

| Area | Path | Purpose |
| --- | --- | --- |
| Chrome extension | `advertiser-agent-extension/` | TD login, client impersonation, program selection, batch input, and QBR submission UI |
| Local runner | `advertiser-qbr-local-runner/` | Accepts extension requests, fetches TD data, prepares analysis payloads, and calls the PPTX service |
| PPTX service | `qbr-pptx-service/` | Generates editable PowerPoint decks and signed download links |
| Auxiliary backend | `backend/` | Optional run-log/API support for program request tracking |
| Legacy frontend | `frontend/` | Older React UI; not the primary QBR interface |
| TD reference app | `td-app/` | Nested reference repository, not the primary local runtime |

## Local URLs

- Extension QBR endpoint: `http://127.0.0.1:3021/webhook-local/advertiser-qbr`
- Local runner health: `http://127.0.0.1:3021/health`
- PPTX service: `http://127.0.0.1:3011`
- PPTX service health: `http://127.0.0.1:3011/health`
- Optional backend API: `http://127.0.0.1:8008/api`

## Run Locally

Install dependencies:

```powershell
cd qbr-pptx-service
npm install

cd ..\advertiser-qbr-local-runner
npm install
```

Start the PPTX service:

```powershell
cd qbr-pptx-service
npm run start
```

Start the local runner in another terminal:

```powershell
cd advertiser-qbr-local-runner
npm run start
```

Load the Chrome extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `advertiser-agent-extension/`.
5. Open the extension and confirm the QBR webhook URL is `http://127.0.0.1:3021/webhook-local/advertiser-qbr`.

Optional run-log backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

## QBR Flow

1. The extension authenticates with TD admin credentials or a supplied admin token.
2. The extension impersonates the advertiser client and loads programs from TD.
3. The user selects programs, language, currency, and date range.
4. The extension sends the QBR request to the local runner.
5. The runner fetches TD statistics and publisher data, builds the QBR payload, and calls the PPTX service.
6. The PPTX service creates an editable `.pptx` file and returns signed download URLs.
7. The extension shows the generated deck link and related output links.

## Useful Commands

Local runner:

```powershell
cd advertiser-qbr-local-runner
npm test
npm run start
```

PPTX service:

```powershell
cd qbr-pptx-service
npm test
npm run start
```

Optional backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

## Documentation Map

- `AGENTS.md`: repo-level instructions for coding agents
- `SETUP.md`: local setup and smoke test guide
- `PRD.md`: current product requirements
- `progress.md`: current state, known issues, and backlog
- `advertiser-qbr-local-runner/README.md`: local runner details
- `qbr-pptx-service/README.md`: PowerPoint generation service details
- `workflows/archive/`: retired n8n workflow exports

## Notes

- Keep generated decks, debug payloads, `node_modules`, virtualenvs, and temp folders out of commits.
- Keep TD credentials and tokens out of docs and logs.
- Treat n8n exports as historical reference only unless the user explicitly asks to inspect or restore that path.
