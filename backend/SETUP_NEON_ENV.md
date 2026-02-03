# How to set NEON_API_URL in backend/.env

## Step 1: Create or open `backend/.env`

1. Open your project in File Explorer or in Cursor.
2. Go to the **backend** folder: `agentic-rag-masterclass\backend`.
3. If you **don’t** see a file named `.env`:
   - Right‑click → **New** → **Text Document**.
   - Name it exactly: **`.env`** (including the dot).
   - If Windows says “You must type a file name”, name it `env.txt` first, then rename it to `.env`.
4. If you **already** have a `.env` file, open it in Cursor or Notepad.

## Step 2: Get your Neon API URL

Your backend expects a **SQL-over-HTTP** endpoint: one URL that accepts a **POST** with a JSON body like:

- `{ "query": "SELECT ...", "params": [...] }`
- and returns something like `{ "fields": [...], "rows": [...] }`.

Where you get that URL depends on your setup:

### Option A: Neon Console (Data API)

1. Go to [Neon Console](https://console.neon.tech) and sign in.
2. Open your **project** (the one that has `conversation_logs_v2`).
3. In the left sidebar, open **Data API** (or **Connection details**).
4. Find the **API URL** (or **HTTP endpoint**). It often looks like:
   - `https://ep-xxxxx-xxxxx.us-east-1.aws.neon.tech`
   - or `https://...neon.tech/rest/v1/` (PostgREST-style).

**Important:** Neon’s built-in Data API is **PostgREST-style** (e.g. `GET /rest/v1/table_name`). It does **not** accept raw SQL in a single POST. So:

- If you have a **custom** HTTP endpoint (e.g. a serverless function or proxy) that **does** accept raw SQL in the format above, use that URL as `NEON_API_URL`.
- If you **only** have Neon’s standard Data API URL, then `NEON_API_URL` in this project is meant for a **different** endpoint (raw SQL over HTTP). You’ll need either:
  - that custom endpoint’s URL, or  
  - a change to the backend to use Neon’s PostgREST API instead (different code).

### Option B: You already have a SQL-over-HTTP URL

If someone gave you a URL that accepts:

- **POST** with body `{ "query": "SELECT ...", "params": [...] }`
- and returns rows (e.g. `fields` + `rows`),

then that URL is what you should use for `NEON_API_URL`.

## Step 3: Add the line to `backend/.env`

In `backend\.env`, add or edit so you have **exactly** this (with your real URL, no quotes):

```env
NEON_API_URL=https://your-actual-endpoint-url-here
```

Examples (replace with your real URL):

```env
NEON_API_URL=https://ep-cool-darkness-12345.us-east-1.aws.neon.tech
```

or, if your provider uses a path:

```env
NEON_API_URL=https://your-api.example.com/sql
```

- Use **one** line: `NEON_API_URL=` followed by the URL.
- No spaces around `=`.
- No quotes around the URL (unless your app is written to strip them).
- Don’t put a trailing slash unless your endpoint requires it.

You can keep other variables in the same file (e.g. `DEBUG=...`, `CORS_ORIGINS=...`).

## Step 4: Restart the backend

After saving `.env`:

1. Stop the backend (e.g. Ctrl+C in the terminal where it’s running).
2. Start it again from the **backend** folder, for example:

   ```powershell
   cd C:\Users\harcol\agentic-rag-masterclass\backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Step 5: Check that it’s used

- If `NEON_API_URL` is **empty or missing**, calling the onboarding API (e.g. look up a program) will return an error like:  
  `NEON_API_URL is not set. Add it to backend/.env with your Neon SQL-over-HTTP endpoint.`
- If it’s **set** to a valid SQL-over-HTTP endpoint, the onboarding endpoints should run without that error (they may still return 404 or 500 if the table or data don’t exist).

## Summary

| Step | Action |
|------|--------|
| 1 | Create or open `backend\.env` |
| 2 | Get your SQL-over-HTTP API URL (Neon Console or from your team) |
| 3 | Add: `NEON_API_URL=https://your-actual-endpoint-url` |
| 4 | Save the file and restart the backend |

If you paste your Neon “Connection string” or “Data API URL” (with the secret part removed, e.g. `xxxxx` instead of the real password), I can tell you exactly what to put in `NEON_API_URL` or whether the backend needs to be adapted for Neon’s PostgREST API.
