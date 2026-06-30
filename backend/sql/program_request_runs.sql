CREATE TABLE IF NOT EXISTS program_request_runs (
    program_id TEXT NOT NULL,
    client_username TEXT NOT NULL DEFAULT '',
    program_ids TEXT NOT NULL DEFAULT '',
    program_names TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    language_code TEXT NOT NULL DEFAULT '',
    currency_code TEXT NOT NULL DEFAULT '',
    analysis_level TEXT NOT NULL DEFAULT '',
    build_duration_ms BIGINT,
    request_key TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE program_request_runs
    ADD COLUMN IF NOT EXISTS client_username TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS program_ids TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS program_names TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS start_date TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS analysis_level TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS build_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS request_key TEXT NOT NULL DEFAULT '';

UPDATE program_request_runs
SET request_key = lower(trim(client_username)) || '|' || (
    SELECT string_agg(program_id_value, ',' ORDER BY lower(program_id_value))
    FROM (
        SELECT DISTINCT trim(raw_program_id) AS program_id_value
        FROM regexp_split_to_table(program_ids, ',') AS raw_program_id
        WHERE trim(raw_program_id) <> ''
    ) AS canonical_program_ids
) || '|' || trim(start_date) || '|' || trim(end_date)
WHERE request_key = ''
    AND trim(client_username) <> ''
    AND trim(program_ids) <> ''
    AND trim(start_date) <> ''
    AND trim(end_date) <> '';
CREATE INDEX IF NOT EXISTS program_request_runs_request_key_idx
ON program_request_runs (request_key)
WHERE request_key <> '';


