# QBR PPTX Service

Standalone Node.js service that generates editable Advertiser QBR PowerPoint decks.

The active caller is `advertiser-qbr-local-runner`, not n8n.

## Local URL

```text
http://127.0.0.1:3011
```

## Endpoints

- `GET /health`
- `POST /generate`
- `GET /files/:fileName`

## Auth

Send an `x-api-key` header when calling `POST /generate`.

Default local key:

```text
td-qbr-pptx-local-2026-secret
```

Override with:

```text
QBR_PPTX_API_KEY=your-secret
```

`API_KEY` is also accepted as a fallback environment variable.

## Run

```powershell
cd qbr-pptx-service
npm install
npm test
npm run start
```

The service listens on port `3011` by default.

## Generate A Deck

```powershell
curl.exe -X POST http://127.0.0.1:3011/generate `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -H "x-api-key: td-qbr-pptx-local-2026-secret" `
  --data-binary "@sample-payload.json"
```

Successful responses include signed file URLs for generated outputs.

## Docker

The Docker image should be run with the same advertiser QBR port unless a deployment explicitly overrides it:

```powershell
docker build -f qbr-pptx-service/Dockerfile qbr-pptx-service -t qbr-pptx-service:local
docker run --rm -p 3011:3011 -e PORT=3011 -e QBR_PPTX_API_KEY=your-secret qbr-pptx-service:local
```

Container URL:

```text
http://127.0.0.1:3011
```

## Outputs

Generated files are written under `qbr-pptx-service/outputs/`.

Do not commit generated output files.
