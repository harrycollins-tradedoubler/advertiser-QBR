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
http://localhost:3011
```

## Docker
The container listens on port `8080`.

```powershell
docker build -f qbr-pptx-service/Dockerfile qbr-pptx-service -t qbr-pptx-service:local
docker run --rm -p 8080:8080 -e QBR_PPTX_API_KEY=your-secret qbr-pptx-service:local
```

Container URL:

```text
http://localhost:8080
```

## n8n node
When n8n runs in the same Docker or cluster network, use the internal service URL:

```text
POST http://qbr-pptx-service:8080/generate
```

Cloudflare temporary tunnel URLs are not needed for in-cluster n8n calls. Use a public route only if people outside the cluster need to open generated file links directly.

Headers:
- `Content-Type: application/json`
- `Accept: application/json`
- `x-api-key: td-qbr-pptx-local-2026-secret`

Body:

```text
={{ JSON.stringify($json) }}
```
