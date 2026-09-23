-- Sessions now expire after three days without activity as well as seven days in total.
-- created_at anchors the absolute limit; expires_at is renewed on activity (see requireUser).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE sessions SET expires_at = LEAST(expires_at, NOW() + INTERVAL '3 days');
