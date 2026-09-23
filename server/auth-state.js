// Lock the user before making credential decisions: sign-in and revocation must have one ordering.
import { createHmac, randomUUID } from 'node:crypto';
import { token, digest } from './security.js';
import {
  encryptSecret,
  decryptSecret,
  encryptedWith,
  verifyTotp,
  normalizeRecoveryCode,
} from './totp.js';
export const lockUser = async (tx, id) =>
  (await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
// A session ends after SESSION_IDLE_MS without activity and after SESSION_MAX_MS regardless;
// requireUser in app.js extends expires_at on activity, never past created_at + SESSION_MAX_MS.
export const SESSION_IDLE_MS = 3 * 86400000;
export const SESSION_MAX_MS = 7 * 86400000;
export function createAuthState(db, secret, previousSecret) {
  const opaque = (value) => createHmac('sha256', secret).update(value).digest('hex');
  async function audit(tx, event, id) {
    await tx.query('INSERT INTO security_events(id,event,subject_hash) VALUES($1,$2,$3)', [
      randomUUID(),
      event,
      id ? opaque(id) : null,
    ]);
  }
  async function sessionUser(tx, req) {
    const user = await lockUser(tx, req.user.id);
    if (!user) return null;
    const session = (
      await tx.query(
        'SELECT * FROM sessions WHERE token_hash=$1 AND user_id=$2 AND auth_version=$3 AND expires_at>NOW()',
        [req.sessionHash, user.id, user.auth_version],
      )
    ).rows[0];
    return session ? { user, session } : null;
  }
  async function issueSession(tx, user, previous) {
    const raw = token();
    if (previous) await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(previous)]);
    await tx.query(
      'INSERT INTO sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,$4)',
      [digest(raw), user.id, user.auth_version, new Date(Date.now() + SESSION_IDLE_MS)],
    );
    return raw;
  }
  async function issueToken(tx, user, purpose, ttl) {
    const raw = token();
    await tx.query('DELETE FROM email_tokens WHERE user_id=$1 AND purpose=$2', [user.id, purpose]);
    await tx.query(
      'INSERT INTO email_tokens(token_hash,user_id,purpose,auth_version,expires_at) VALUES($1,$2,$3,$4,$5)',
      [digest(raw), user.id, purpose, user.auth_version, new Date(Date.now() + ttl)],
    );
    return raw;
  }
  async function tokenUser(tx, raw, purpose) {
    const hint = (
      await tx.query('SELECT user_id FROM email_tokens WHERE token_hash=$1 AND purpose=$2', [
        digest(raw),
        purpose,
      ])
    ).rows[0];
    if (!hint) return null;
    const user = await lockUser(tx, hint.user_id);
    if (!user) return null;
    const active = await tx.query(
      'SELECT 1 FROM email_tokens WHERE token_hash=$1 AND purpose=$2 AND auth_version=$3 AND expires_at>NOW()',
      [digest(raw), purpose, user.auth_version],
    );
    return active.rows.length ? user : null;
  }
  async function revoke(tx, user, keepSession) {
    await tx.query(
      'UPDATE users SET auth_version=auth_version+1,totp_pending=NULL,totp_pending_until=NULL,totp_pending_session=NULL WHERE id=$1',
      [user.id],
    );
    user.auth_version += 1;
    await tx.query(
      'DELETE FROM sessions WHERE user_id=$1 AND ($2::text IS NULL OR token_hash<>$2)',
      [user.id, keepSession || null],
    );
    if (keepSession)
      await tx.query(
        'UPDATE sessions SET auth_version=$2,reauthenticated_at=NULL WHERE token_hash=$1',
        [keepSession, user.auth_version],
      );
    await tx.query('DELETE FROM email_tokens WHERE user_id=$1', [user.id]);
    await tx.query('DELETE FROM email_jobs WHERE user_id=$1', [user.id]);
    await tx.query('DELETE FROM oauth_states WHERE user_id=$1', [user.id]);
  }
  async function factor(tx, user, code) {
    if (!user.totp_enabled_at || !user.totp_secret) return false;
    const plain = decryptSecret(user.totp_secret, secret, previousSecret);
    const step = verifyTotp(plain, code, { lastStep: user.totp_last_step });
    if (step != null) {
      const changed = await tx.query(
        'UPDATE users SET totp_last_step=$2 WHERE id=$1 AND (totp_last_step IS NULL OR totp_last_step<$2) RETURNING id',
        [user.id, step],
      );
      // After a key rotation, a successful code moves the secret onto the current key.
      if (changed.rows.length && previousSecret && !encryptedWith(user.totp_secret, secret))
        await tx.query('UPDATE users SET totp_secret=$2 WHERE id=$1', [
          user.id,
          encryptSecret(plain, secret),
        ]);
      return Boolean(changed.rows.length);
    }
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return false;
    const used = await tx.query(
      'UPDATE recovery_codes SET used_at=NOW() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash',
      [user.id, digest(normalized)],
    );
    return Boolean(used.rows.length);
  }
  // Database-backed windows are shared across processes/restarts. No raw IP/email in keys.
  async function limit(tx, key, max, ms) {
    const result = await tx.query(
      `INSERT INTO request_limits(key,hits,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.expires_at<=NOW() THEN 1 ELSE request_limits.hits+1 END,
      expires_at=CASE WHEN request_limits.expires_at<=NOW() THEN $2 ELSE request_limits.expires_at END RETURNING hits,expires_at`,
      [opaque(key), new Date(Date.now() + ms)],
    );
    return { allowed: result.rows[0].hits <= max, reset: new Date(result.rows[0].expires_at) };
  }
  const middleware =
    (scope, max, ms, subject = (req) => req.ip) =>
    async (req, res, next) => {
      const result = await limit(db, `${scope}:${subject(req)}`, max, ms);
      if (!result.allowed) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))));
        return res
          .status(429)
          .json({ error: 'Too many attempts. Please wait before trying again.' });
      }
      next();
    };
  return {
    opaque,
    audit,
    sessionUser,
    issueSession,
    issueToken,
    tokenUser,
    revoke,
    factor,
    limit,
    middleware,
  };
}
