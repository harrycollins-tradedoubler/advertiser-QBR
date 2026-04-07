# QBR PPTX Service

Standalone editable PowerPoint generator for the QBR workflow.

## Endpoints
- `GET /health`
- `POST /generate`
- `GET /files/:fileName`

## Auth
Send `x-api-key` header. Default local key:

```text
td-qbr-pptx-local-2026-secret
```

Override with:

```text
QBR_PPTX_API_KEY=your-secret
```

## Run
From this folder:

```powershell
node server.js
```

Service URL:

```text
http://localhost:3010
```

## n8n node
Use:

```text
POST http://host.docker.internal:3010/generate
```

Headers:
- `Content-Type: application/json`
- `Accept: application/json`
- `x-api-key: td-qbr-pptx-local-2026-secret`

Body:

```text
={{ JSON.stringify($json) }}
```
