# Advertiser QBR Local Runner

Local Node.js runner for Advertiser QBR generation.

The runner is the active target for the Chrome extension. It replaces the old n8n execution path for local QBR generation.

## Local URLs

- Health check: `GET http://127.0.0.1:3021/health`
- QBR endpoint: `POST http://127.0.0.1:3021/webhook-local/advertiser-qbr`
- PPTX generator target: `POST http://127.0.0.1:3011/generate`

If port `3021` is already in use, `server.js` tries the next local port and prints the selected URL.

## Environment

```powershell
$env:PORT = "3021"
$env:HOST = "127.0.0.1"
$env:ADVERTISER_QBR_GENERATOR_URL = "http://127.0.0.1:3011/generate"
$env:QBR_PPTX_API_KEY = "td-qbr-pptx-local-2026-secret"
$env:ADVERTISER_QBR_AGENT_MODE = "deterministic"
$env:ADVERTISER_QBR_DEBUG_DIR = "C:\tmp\advertiser-qbr-debug"
$env:OPENAI_API_KEY = "<optional>"
$env:ADVERTISER_QBR_OPENAI_MODEL = "gpt-5-mini"
```

`ADVERTISER_QBR_AGENT_MODE=deterministic` avoids model calls and produces table-driven fallback narrative content. If `OPENAI_API_KEY` is absent, deterministic mode is used automatically.

## Run

```powershell
cd advertiser-qbr-local-runner
npm install
npm test
npm run start
```

The PPTX service must already be listening on `http://127.0.0.1:3011`.

## Request Shape

The Chrome extension sends a `QBR_REQUEST` payload containing selected program IDs, date range, language, currency, client username, and TD tokens.

The runner accepts payloads in extension-compatible wrapper shapes, normalizes the request, fetches TD data, and forwards the final PowerPoint payload to the generator.

## Output Shape

The response preserves the extension-compatible fields used by the UI:

- `success`
- `provider`
- `message`
- `generation_status`
- `generation_id`
- `presentation_id`
- `presentation_url`
- `edit_url`
- `pptx_url`
- `gap_analysis_report_url`
- `gap_analysis_report_file_name`
- `publisher_performance_excel_url`
- `publisher_performance_excel_file_name`
- `file_name`
- `theme`
- `slide_count`
- `error`

## Debug Payloads

Set `ADVERTISER_QBR_DEBUG_DIR` to write one redacted JSON artifact per run. Each artifact includes:

- normalized input
- fetched TD row counts
- final table row counts
- final PPTX payload
- program and publisher agent output previews

Sensitive fields such as authorization headers, access tokens, API keys, cookies, passwords, and client secrets are redacted.

## Notes

- TD statistics pagination uses `limit=100` and keeps fetching until the API reports completion.
- Analytical tables are kept in full upstream payloads; display limits are handled by the PPTX service.
- The runner accepts localhost requests by default. Docker bridge requests are allowed only when `ALLOW_DOCKER_BRIDGE_REQUESTS=true`.
