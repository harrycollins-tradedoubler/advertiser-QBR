# Advertiser QBR Local Deck Generator - Setup Guide

## Prerequisites

- Windows PowerShell
- Node.js 18+
- Google Chrome
- TD admin credentials or an admin bearer token with permission to impersonate the target advertiser client
- Python 3.10+ only if you want to run the optional backend run-log API

## Install Dependencies

PPTX service:

```powershell
cd qbr-pptx-service
npm install
```

Local runner:

```powershell
cd advertiser-qbr-local-runner
npm install
```

Optional backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The legacy React frontend is not required for the active Chrome extension flow.

## Environment Configuration

The active local defaults are usable without extra files:

- Local runner: `http://127.0.0.1:3021`
- PPTX service: `http://127.0.0.1:3011`
- PPTX API key: `td-qbr-pptx-local-2026-secret`

Optional local-runner overrides:

```powershell
$env:PORT = "3021"
$env:HOST = "127.0.0.1"
$env:ADVERTISER_QBR_GENERATOR_URL = "http://127.0.0.1:3011/generate"
$env:QBR_PPTX_API_KEY = "td-qbr-pptx-local-2026-secret"
$env:ADVERTISER_QBR_AGENT_MODE = "deterministic"
$env:ADVERTISER_QBR_DEBUG_DIR = "C:\tmp\advertiser-qbr-debug"
```

Optional model-backed runner mode:

```powershell
$env:OPENAI_API_KEY = "<your-key>"
$env:ADVERTISER_QBR_OPENAI_MODEL = "gpt-5-mini"
```

Optional backend `.env` is only needed for run-log storage/API work:

```env
DEBUG=false
CORS_ORIGINS=["http://localhost:5173","chrome-extension://*"]
DATABASE_URL=
NEON_API_URL=
```

## Start Services

Start the PPTX service:

```powershell
cd qbr-pptx-service
npm run start
```

Start the local runner in a second terminal:

```powershell
cd advertiser-qbr-local-runner
npm run start
```

Optional backend in a third terminal:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

## Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose `advertiser-agent-extension/`.
5. Open the Advertiser Agent extension.
6. Confirm the QBR webhook URL is:

```text
http://127.0.0.1:3021/webhook-local/advertiser-qbr
```

The backend API URL can remain:

```text
http://127.0.0.1:8008/api
```

Use it only when the optional backend is running for run logs.

## Local URLs

- Local runner health: `http://127.0.0.1:3021/health`
- Local runner QBR endpoint: `http://127.0.0.1:3021/webhook-local/advertiser-qbr`
- PPTX service health: `http://127.0.0.1:3011/health`
- PPTX service generate endpoint: `http://127.0.0.1:3011/generate`
- Optional backend health: `http://127.0.0.1:8008/api/health`

## Smoke Test

1. Start `qbr-pptx-service`.
2. Start `advertiser-qbr-local-runner`.
3. Load or reload the unpacked Chrome extension.
4. Save TD connection settings.
5. Impersonate the target advertiser client.
6. Load programs.
7. Select one or more programs.
8. Choose language, currency, and reporting period.
9. Submit the QBR request.
10. Confirm the extension shows a generated PowerPoint link or a useful error.

## Validation Commands

Local runner:

```powershell
cd advertiser-qbr-local-runner
npm test
```

PPTX service:

```powershell
cd qbr-pptx-service
npm test
```

Optional backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

Then check:

```powershell
curl.exe http://127.0.0.1:8008/api/health
```

## Troubleshooting

- If the extension cannot submit a QBR request, confirm the runner is listening on `3021`.
- If PPTX generation fails, confirm the PPTX service is listening on `3011` and the API keys match.
- If run logs are unavailable, start the optional backend or ignore run-log features for the current QBR run.
- If a real TD request fails, confirm impersonation succeeded and the selected programs belong to the impersonated advertiser client.
- If debug payloads are enabled, periodically clean the debug directory because artifacts can become large.
