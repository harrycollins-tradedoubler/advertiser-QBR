CREATE TABLE IF NOT EXISTS batch_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    row_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_run_items (
    batch_id TEXT NOT NULL REFERENCES batch_runs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    client_username TEXT NOT NULL DEFAULT '',
    program_ids TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    duplicate BOOLEAN NOT NULL DEFAULT false,
    result_url TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    request_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS batch_run_items_batch_id_idx
ON batch_run_items (batch_id, row_number);
