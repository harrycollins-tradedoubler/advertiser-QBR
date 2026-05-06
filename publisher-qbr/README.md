# Publisher QBR Service

Standalone editable PowerPoint generator for Publisher QBR workflow runs.

This service is intentionally separate from the advertiser QBR service:

- Advertiser QBR: `https://qbr-pptx-service-production.up.railway.app`
- Publisher QBR: `https://publisher-qbr-service-production.up.railway.app`

## Endpoints

- `GET /health`
- `POST /generate`
- `GET /files/:fileName`

## Request Boundary

`POST /generate` only accepts Publisher QBR payloads with:

```json
{
  "analysisLevel": "publisher_program"
}
```

Advertiser-style payloads are rejected before PowerPoint generation.

## Auth

Send the `x-api-key` header. Default local key:

```text
td-publisher-qbr-local-2026-secret
```

Override with:

```text
PUBLISHER_QBR_API_KEY=your-secret
```

## Run

From this folder:

```powershell
npm install
npm start
```

Local URL:

```text
http://localhost:3020
```

## n8n Node

Use the Publisher QBR Railway service, not the advertiser service:

```text
POST https://publisher-qbr-service-production.up.railway.app/generate
```

Headers:

- `Content-Type: application/json`
- `Accept: application/json`
- `x-api-key: <publisher-service-api-key>`

Body:

```text
={{ JSON.stringify($json) }}
```
