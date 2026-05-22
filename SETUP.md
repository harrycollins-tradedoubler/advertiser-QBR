# TD QBR Agent Hub - Setup Guide

## Prerequisites

- Windows PowerShell
- Python 3.10+
- Node.js 18+
- Access to a TD user token with permission to inspect the target organisation
- Access to the configured n8n QBR webhook

## Install Dependencies

### Backend

The backend uses a Python virtual environment under `backend/.venv`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Frontend

```powershell
cd frontend
npm install
```

### PPTX Service

```powershell
cd qbr-pptx-service
npm install
```

## Environment Configuration

Create or update `backend/.env`:

```env
DEBUG=false
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
DATABASE_URL=
NEON_API_URL=
QBR_AGENT_WEBHOOK_URL=https://coe-n8n.coe-untrust-eu-de.prod.tddrift.net/webhook/qbr-v4-presenton-1e2f9f4d
```

Optional TD API overrides:

```env
TD_USER_URL=https://connect.tradedoubler.com/usermanagement
TD_MANAGE_URL=https://connect.tradedoubler.com/advertiser
TD_IMPERSONATE_URL=https://connect.tradedoubler.com/uaa/admin/impersonate
```

Create or update `frontend/.env` if you need to override the default backend URL:

```env
VITE_API_URL=http://localhost:8008
```

For the PPTX service, set an API key only if you do not want to use the local default:

```env
QBR_PPTX_API_KEY=your-local-secret
```

## Start Services

Frontend and backend:

```powershell
.\scripts\start-services.ps1
```

Manual backend start:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

Manual frontend start:

```powershell
cd frontend
npm run dev
```

PPTX service:

```powershell
cd qbr-pptx-service
npm run start
```

## Local URLs

- Backend health: `http://localhost:8008/health`
- Frontend: `http://localhost:5173`
- PPTX service health: `http://localhost:3010/health`

## Smoke Test

1. Start backend and frontend.
2. Open `http://localhost:5173`.
3. Select the QBR Agent.
4. Paste a TD user access token and enter an Organisation ID.
5. Click Load Programs.
6. Select one or more programs.
7. Choose language, currency, and reporting period.
8. Submit the QBR request.
9. Confirm the job status progresses to completed or shows a useful error.
10. Download the PPTX if a report URL is returned.

## Validation Commands

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
```

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

Then check:

```powershell
curl.exe http://localhost:8008/health
```

## Troubleshooting

- If TD calls fail with proxy-related errors, verify backend code still uses `httpx.AsyncClient(trust_env=False)` for TD requests.
- If QBR jobs queue but n8n is not reached, confirm `QBR_AGENT_WEBHOOK_URL` in `backend/.env`.
- If the frontend cannot reach the backend, confirm `VITE_API_URL` is `http://localhost:8008`.
- If downloads fail, check the QBR job response contains a valid `.pptx` URL.
- If PPTX generation fails in n8n, confirm the PPTX service is running and accepts `x-api-key`.
