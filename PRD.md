# TD QBR Agent Hub - Product Requirements

## Overview

The product is a local agent hub for generating Tradedoubler Quarterly Business Review reports. It combines a frontend request workflow, FastAPI orchestration layer, remote n8n QBR agent workflow, TD API integration, and an editable PowerPoint renderer.

The user goal is to produce reliable, branded, editable QBR decks from TD program data with minimal manual preparation.

## Users

- Internal TD users preparing QBRs for advertisers or organisations
- Operators testing and improving the QBR n8n workflow
- Developers maintaining the frontend, backend, and PPTX renderer

## Current Scope

### QBR Agent Frontend

Users must be able to:
- Select the active QBR Agent
- Paste a TD user access token
- Enter an Organisation ID
- Load available TD programs for that organisation
- Select one or more programs to include in the report
- Choose report language and currency
- Choose a reporting date range
- Submit the request and see queued/running/completed/error status
- Download the generated `.pptx` when available

### Backend API

The backend must:
- Expose active agents through `/api/agents`
- Accept chat and QBR requests through `/api/chat`
- Treat messages prefixed with `QBR_REQUEST` as long-running jobs
- Return immediately with a job ID for QBR requests
- Store QBR job status in memory for local use
- Call the configured n8n webhook asynchronously
- Accept successful JSON, plain-text, or empty n8n responses
- Extract downloadable PPTX URLs from n8n responses where possible
- Proxy PPTX downloads so the frontend does not need to fetch remote files directly

### TD API Integration

The backend must:
- Accept a TD user access token
- Fetch organisation users with the supplied Organisation ID
- Prefer owner/admin-style users for impersonation when available
- Impersonate the selected TD user
- Fetch programs using the impersonated access token
- Cap program fetches at the TD API-supported maximum of 100
- Return TD tokens to the frontend so QBR jobs can still forward tokens if backend memory is lost
- Convert TD request failures and malformed responses into clear API errors
- Avoid inheriting broken machine proxy settings for outbound TD calls

### PPTX Renderer

The PPTX service must:
- Expose `GET /health`, `POST /generate`, and `GET /files/:fileName`
- Require `x-api-key`
- Generate editable `.pptx` files using `pptxgenjs`
- Support the TD-branded QBR deck structure
- Support program-level breakdown data
- Support multiple output languages and currencies where implemented
- Keep generated decks in `qbr-pptx-service/outputs/`

## Out Of Scope

- Production deployment hardening
- Persistent job storage
- Persistent chat thread storage
- Full user authentication for the local hub
- Reintroducing the original RAG masterclass module roadmap

## Functional Requirements

### QBR Request Construction

The frontend must send:
- `type: "QBR_REQUEST"`
- `analysisLevel`
- `organizationId`
- `programId`
- `programName`
- `publisherProgramMode`
- `publisherProgramIds`
- `languageCode`
- `currencyCode`
- `startDate`
- `endDate`
- `fromDate`
- `toDate`
- `td_tokens`

Date ranges must be valid and limited to 366 days.

### QBR Job Status

Backend job states:
- `queued`
- `completed`
- `error`

Completed jobs may include:
- response text
- `download_available`
- `download_url`
- `file_name`
- `completed_at`

Error jobs must include a useful error message where possible.

### Report Download

The frontend downloads reports through:

```text
GET /api/qbr/{job_id}/download
```

The backend must:
- Reject downloads for missing jobs
- Reject downloads for incomplete jobs
- Reject jobs without a downloadable URL
- Fetch the remote PPTX with `trust_env=False`
- Return the file with the PowerPoint MIME type and a useful filename

## Non-Functional Requirements

- Keep local setup simple and Windows-friendly.
- Prefer explicit ports and scripts over hidden assumptions.
- Keep TD tokens out of logs and docs.
- Keep QBR errors actionable for non-developer operators.
- Keep the PPTX output editable, not rasterized.
- Keep docs current with the actual source code.

## Acceptance Criteria

- A user can load TD programs from a valid access token and Organisation ID.
- A user can submit a QBR request for one or more selected programs.
- The backend returns a job ID immediately instead of blocking the frontend.
- The frontend can poll the job until completed or errored.
- A generated PPTX can be downloaded from the frontend when n8n returns a PPTX URL.
- `npm test` passes in `qbr-pptx-service/` after renderer changes.
- `npm run build` passes in `frontend/` after frontend changes.
- Backend changes are verified with focused smoke checks or tests.
