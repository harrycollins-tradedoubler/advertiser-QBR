# Advertiser QBR Local Runner

Side-by-side localhost Node.js runner for the Advertiser QBR n8n workflow `EDIApI22XKSU9moB` (`Advertiser QBR Recommendations Test`).

This service does not change the existing n8n webhook route or the browser extension defaults. n8n remains the fallback path while this runner is validated.

## Local URLs

- Local runner webhook: `POST http://127.0.0.1:3021/webhook-local/advertiser-qbr`
- Health check: `GET http://127.0.0.1:3021/health`
- PPTX generator target: `POST http://127.0.0.1:3011/generate`

If port `3021` is already in use, `server.js` tries the next local port and prints the selected URL.

## Environment

```powershell
$env:PORT = "3021"
$env:HOST = "127.0.0.1"
$env:ADVERTISER_QBR_GENERATOR_URL = "http://127.0.0.1:3011/generate"
$env:QBR_PPTX_API_KEY = "td-qbr-pptx-local-2026-secret"
$env:OPENAI_API_KEY = "<optional>"
$env:ADVERTISER_QBR_AGENT_MODE = "deterministic"
$env:ADVERTISER_QBR_DEBUG_DIR = "C:\tmp\advertiser-qbr-debug"
$env:ADVERTISER_QBR_OPENAI_MODEL = "gpt-5-mini"
```

`ADVERTISER_QBR_AGENT_MODE=deterministic` avoids model calls and produces table-driven fallback markdown. If `OPENAI_API_KEY` is absent, deterministic mode is used automatically.

## Start And Restart

```powershell
cd advertiser-qbr-local-runner
npm test
npm run start
```

Restart by stopping the Node process and running `npm run start` again. The PPTX generator must already be listening on `http://127.0.0.1:3011`.

## Switch Back To n8n

The extension defaults still point at the n8n webhook:

`http://127.0.0.1:5678/webhook/agency-agent-qbr-backend-auth-20260610`

To use n8n again, keep that default value in the extension UI or restore it in the QBR webhook URL field. To test the local runner, temporarily set the extension QBR webhook URL to:

`http://127.0.0.1:3021/webhook-local/advertiser-qbr`

## Debug Payloads

Set `ADVERTISER_QBR_DEBUG_DIR` to write one sanitized JSON artifact per run. Each artifact includes:

- normalized input
- fetched TD row counts
- final table row counts
- final PPTX payload
- program and publisher agent output previews

Sensitive fields such as authorization headers, access tokens, API keys, cookies, passwords, and client secrets are redacted.

## Notes

- TD statistics pagination uses `limit=100` and keeps fetching until the API reports completion.
- Analytical tables are kept in full upstream payloads; display limits are handled by the PPTX service.
- The final runner response preserves the extension/n8n-compatible shape: `success`, `provider`, `message`, `generation_status`, `generation_id`, `presentation_id`, `presentation_url`, `edit_url`, `pptx_url`, `gap_analysis_report_url`, `gap_analysis_report_file_name`, `file_name`, `theme`, `slide_count`, and `error`.
