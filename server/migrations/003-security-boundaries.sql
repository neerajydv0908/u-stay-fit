ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_pending_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN totp_pending_session TEXT;
ALTER TABLE sessions ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN reauthenticated_at TIMESTAMPTZ;
ALTER TABLE email_tokens ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oauth_states ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oauth_states ADD COLUMN session_hash TEXT;
ALTER TABLE oauth_states ADD COLUMN auth_version INTEGER;
ALTER TABLE oauth_states ADD COLUMN nonce TEXT;
ALTER TABLE oauth_states ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE security_events (id UUID PRIMARY KEY, event TEXT NOT NULL, subject_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX security_events_created ON security_events(created_at);
CREATE TABLE request_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE email_jobs (id UUID PRIMARY KEY, payload TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 day');
CREATE VIEW operator_accounts AS SELECT username,email,created_at,email_verified_at IS NOT NULL AS verified,
  totp_enabled_at IS NOT NULL AS two_factor FROM users;
ALTER TABLE email_tokens DROP CONSTRAINT email_tokens_purpose_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify','reset','mfa','delete'));
ALTER TABLE email_tokens ADD COLUMN session_hash TEXT;
-- Deploying this fix invalidates credentials issued by the older, vulnerable flows.
-- Account, profile, and tracking data remain intact; everyone signs in again.
UPDATE users SET auth_version=auth_version+1,totp_pending=NULL,totp_pending_until=NULL,totp_pending_session=NULL;
DELETE FROM sessions;
DELETE FROM email_tokens;
DELETE FROM oauth_states;
