# Advertiser QBR Local Deck Generator - Product Requirements

## Overview

The product is a local workflow for generating editable Tradedoubler Advertiser QBR PowerPoint decks.

The primary user journey is:

```text
Chrome extension / TD app -> local Node.js runner -> PowerPoint service
```

The user goal is to produce reliable, branded, editable QBR decks from TD advertiser and publisher data with minimal manual preparation.

## Users

- Internal TD users preparing QBRs for advertisers or organisations
- Operators running single-program or multi-program QBR batches
- Developers maintaining the Chrome extension, local runner, and PPTX renderer

## Current Scope

### Chrome Extension

Users must be able to:

- Save TD connection settings locally
- Authenticate with TD admin credentials or use a supplied admin bearer token
- Impersonate an advertiser client user
- Load available advertiser programs
- Select one or more programs for analysis
- Choose report language, currency, and date range
- Submit one QBR request or a CSV batch
- View generated deck links and related output links
- Refresh optional run-log data when the backend is available

### Local Runner

The runner must:

- Expose `GET /health`
- Expose `POST /webhook-local/advertiser-qbr`
- Accept only localhost requests by default
- Accept extension-compatible `QBR_REQUEST` payloads
- Normalize selected program IDs, date ranges, language, currency, and TD tokens
- Fetch current and previous-period TD statistics
- Fetch publisher performance, publisher category, and publisher metadata rows where available
- Build the final PPTX payload for the generator
- Support deterministic mode when model calls are unavailable or undesired
- Redact sensitive data in optional debug artifacts
- Return extension-compatible success and failure responses

### PPTX Service

The PPTX service must:

- Expose `GET /health`
- Expose `POST /generate`
- Expose signed `GET /files/:fileName` download URLs
- Require `x-api-key` for generation
- Generate editable `.pptx` files using `pptxgenjs`
- Support TD-branded Advertiser QBR deck structure
- Support multi-program report payloads
- Return deck and supporting file URLs where available

### Auxiliary Backend

The backend is not part of the primary deck-generation path. It may support:

- Program-request run recording
- Duplicate request checks
- Run-log listing for the extension
- Local API utilities needed by the current workflow

### Historical n8n Material

n8n workflows are retired from the active runtime. Archived exports may remain in the repo for reference, but docs and setup should not direct users to run n8n for the current workflow.

## Functional Requirements

### QBR Request Construction

The extension/local runner payload must support:

- `clientUsername`
- `analysisLevel`
- `organizationId`
- `programId`
- `programName`
- `publisherProgramIds` or equivalent selected program IDs
- `languageCode`
- `currencyCode`
- `startDate`
- `endDate`
- `fromDate`
- `toDate`
- `td_tokens`

Date ranges must be valid and remain suitable for TD statistics requests.

### Data Collection

The runner must:

- Use TD impersonation tokens supplied by the extension payload
- Fetch paginated program statistics with TD-supported limits
- Fetch current and previous-period data for variance calculations
- Continue gracefully when optional publisher metadata endpoints are unavailable, except for authentication/authorization failures
- Preserve enough source row detail for the PPTX service to build tables and supporting outputs

### Report Generation

The runner must call:

```text
POST http://127.0.0.1:3011/generate
```

The PPTX service must return a response that the extension can use to show the generated deck link, including `pptx_url` or an equivalent download URL.

### Run Logs

When the optional backend is running, the extension may:

- Record program request runs before submitting QBR generation
- Block duplicate requests when the backend reports a duplicate
- List recent program request runs

If the backend is unavailable, the primary QBR generation path should still be understandable and operable.

## Non-Functional Requirements

- Keep local setup Windows-friendly.
- Keep the active ports explicit: runner `3021`, PPTX service `3011`, optional backend `8008`.
- Keep TD credentials, TD tokens, API keys, cookies, passwords, and client secrets out of committed files and logs.
- Keep generated decks editable, not rasterized.
- Keep errors actionable for non-developer operators.
- Keep retired n8n material clearly labeled as historical.

## Acceptance Criteria

- A user can load the unpacked Chrome extension.
- The extension defaults to `http://127.0.0.1:3021/webhook-local/advertiser-qbr` for QBR requests.
- The local runner can pass `npm test`.
- The PPTX service can pass `npm test`.
- The runner can call the PPTX service at `http://127.0.0.1:3011/generate`.
- A generated `.pptx` URL is returned to the extension for a successful request.
- Docs no longer describe n8n as the active QBR path.
