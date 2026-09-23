import QRCode from 'qrcode';
import {
  accountDetailsSchema,
  tokenOnlySchema,
  changePasswordSchema,
  totpCodeSchema,
  passwordOnlySchema,
  deleteAccountSchema,
} from '../shared/schemas.js';
import { digest, hashPassword, verifyPassword, publicUser } from './security.js';
import { messages } from './email.js';
import {
  generateSecret,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from './totp.js';
import { BREACHED_PASSWORD } from './auth.js';
import { containsPersonalInfo, PERSONAL_PASSWORD } from './passwords.js';
const fail = (status, error) => ({ status, body: { error } });
export function registerAccountRoutes(app, ctx) {
  const {
    db,
    origin,
    production,
    mailer,
    appSecret,
    mail,
    state,
    isBreached,
    cookieOptions,
    SESSION_COOKIE,
    requireUser,
  } = ctx;
  // The user row lock orders these changes with sign-in, reset, and factor consumption.
  function secured(handler) {
    return async (req, res) => {
      const result = await db.transaction(async (tx) => {
        const current = await state.sessionUser(tx, req);
        if (!current) return fail(401, 'Please sign in again.');
        if (!(await state.limit(tx, `account:${current.user.id}`, 20, 900000)).allowed)
          return fail(429, 'Too many security attempts. Wait 15 minutes.');
        return handler(tx, current.user, current.session, req);
      });
      await mail.finish();
      if (result.deleted) res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.status(result.status || 200).json(result.body);
    };
  }
  async function proof(tx, user, password, code) {
    if (!user.password_hash || !password || !(await verifyPassword(password, user.password_hash)))
      return false;
    return (
      !user.totp_enabled_at || (typeof code === 'string' && (await state.factor(tx, user, code)))
    );
  }
  async function notify(tx, user, event, message) {
    await state.audit(tx, event, user.id);
    await mail.queue(
      tx,
      {
        to: user.email,
        ...(message || {
          subject: 'Your U Stay Fit security settings changed',
          text: 'Your two-factor authentication or recovery codes were changed. Other sessions and pending sign-in/reset links were revoked. If this was not you, contact the operator on the privacy page immediately.',
        }),
      },
      user.id,
    );
  }
  async function codes(tx, id) {
    const recoveryCodes = generateRecoveryCodes();
    await tx.query('DELETE FROM recovery_codes WHERE user_id=$1', [id]);
    for (const code of recoveryCodes)
      await tx.query('INSERT INTO recovery_codes(code_hash,user_id) VALUES ($1,$2)', [
        digest(normalizeRecoveryCode(code)),
        id,
      ]);
    return recoveryCodes;
  }
  app.get('/api/account', requireUser, async (req, res) => {
    const sessions = await db.query(
      'SELECT count(*)::int AS count FROM sessions WHERE user_id=$1 AND expires_at>NOW() AND auth_version=$2',
      [req.user.id, req.user.auth_version],
    );
    const codes = await db.query(
      'SELECT count(*)::int AS count FROM recovery_codes WHERE user_id=$1 AND used_at IS NULL',
      [req.user.id],
    );
    const providers = await db.query('SELECT provider FROM oauth_identities WHERE user_id=$1', [
      req.user.id,
    ]);
    const session = await db.query('SELECT reauthenticated_at FROM sessions WHERE token_hash=$1', [
      req.sessionHash,
    ]);
    res.json({
      user: publicUser(req.user),
      activeSessions: sessions.rows[0].count,
      recoveryCodesLeft: codes.rows[0].count,
      passwordChangedAt: req.user.password_changed_at || null,
      providers: providers.rows.map((r) => r.provider),
      recentlyReauthenticated: Boolean(
        session.rows[0]?.reauthenticated_at &&
        new Date(session.rows[0].reauthenticated_at).getTime() > Date.now() - 300000,
      ),
    });
  });
  // Name and username are ordinary profile details (the sign-in-with-a-new-email path picks
  // them from the address); the advisory lock keeps two people from claiming one handle at once.
  app.post(
    '/api/account/details',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { name, username } = accountDetailsSchema.parse(req.body);
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`username:${username}`]);
      const taken = await tx.query('SELECT 1 FROM users WHERE username=$1 AND id<>$2', [
        username,
        user.id,
      ]);
      if (taken.rows.length) return fail(409, 'That username is taken. Please choose another.');
      const { rows } = await tx.query(
        'UPDATE users SET name=$2, username=$3 WHERE id=$1 RETURNING *',
        [user.id, name, username],
      );
      return { body: { user: publicUser(rows[0]) } };
    }),
  );
  app.post(
    '/api/account/password',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { currentPassword, newPassword, code } = changePasswordSchema.parse(req.body);
      if (!(await proof(tx, user, currentPassword, code)))
        return fail(
          401,
          'Enter your current password and, if enabled, an unused authenticator or recovery code.',
        );
      if (containsPersonalInfo(newPassword, user)) return fail(400, PERSONAL_PASSWORD);
      if (await isBreached(newPassword)) return fail(400, BREACHED_PASSWORD);
      await tx.query('UPDATE users SET password_hash=$2,password_changed_at=NOW() WHERE id=$1', [
        user.id,
        await hashPassword(newPassword),
      ]);
      await state.revoke(tx, user, req.sessionHash);
      await notify(tx, user, 'password_changed', messages.passwordChanged());
      return { body: { ok: true } };
    }),
  );
  app.post(
    '/api/account/totp/setup',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { password, code } = passwordOnlySchema.parse(req.body);
      if (!(await proof(tx, user, password, code)))
        return fail(401, 'Confirm your password and your existing two-factor code, if enabled.');
      const secret = generateSecret();
      await tx.query(
        "UPDATE users SET totp_pending=$2,totp_pending_until=NOW()+INTERVAL '5 minutes',totp_pending_session=$3 WHERE id=$1",
        [user.id, encryptSecret(secret, appSecret), req.sessionHash],
      );
      const url = otpauthUrl(secret, user.email || user.username);
      return {
        body: { secret, otpauth: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) },
      };
    }),
  );
  app.post(
    '/api/account/totp/enable',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { code } = totpCodeSchema.parse(req.body);
      if (
        !user.totp_pending ||
        user.totp_pending_session !== req.sessionHash ||
        new Date(user.totp_pending_until).getTime() <= Date.now()
      )
        return fail(
          400,
          'Start the two-factor setup again on this device. Setup expires after five minutes.',
        );
      const encrypted = user.totp_pending,
        step = verifyTotp(decryptSecret(encrypted, appSecret), code);
      if (step == null) return fail(400, 'Enter the current six-digit code for the new QR code.');
      await state.revoke(tx, user, req.sessionHash);
      await tx.query(
        'UPDATE users SET totp_secret=$2,totp_enabled_at=NOW(),totp_last_step=$3 WHERE id=$1',
        [user.id, encrypted, step],
      );
      const recoveryCodes = await codes(tx, user.id);
      await notify(tx, user, 'mfa_enabled');
      return { body: { ok: true, recoveryCodes } };
    }),
  );
  app.post(
    '/api/account/totp/recovery-codes',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { password, code } = passwordOnlySchema.parse(req.body);
      if (!user.totp_enabled_at || !(await proof(tx, user, password, code)))
        return fail(401, 'Confirm your password and an unused authenticator or recovery code.');
      await state.revoke(tx, user, req.sessionHash);
      const recoveryCodes = await codes(tx, user.id);
      await notify(tx, user, 'recovery_codes_changed');
      return { body: { ok: true, recoveryCodes } };
    }),
  );
  app.post(
    '/api/account/totp/disable',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { password, code } = passwordOnlySchema.parse(req.body);
      if (!(await proof(tx, user, password, code)))
        return fail(401, 'Confirm your password and an unused authenticator or recovery code.');
      await state.revoke(tx, user, req.sessionHash);
      await tx.query(
        'UPDATE users SET totp_secret=NULL,totp_enabled_at=NULL,totp_last_step=NULL WHERE id=$1',
        [user.id],
      );
      await tx.query('DELETE FROM recovery_codes WHERE user_id=$1', [user.id]);
      await notify(tx, user, 'mfa_disabled');
      return { body: { ok: true } };
    }),
  );
  app.post(
    '/api/account/deletion-confirmation',
    requireUser,
    secured(async (tx, user, session, req) => {
      if (user.password_hash) return fail(400, 'Confirm using your current password instead.');
      if (!user.email)
        return fail(400, 'Contact the operator to verify ownership of this legacy account.');
      if (!(await mail.allowed(tx, user.email)))
        return fail(429, 'Wait before requesting another confirmation email.');
      const value = await state.issueToken(tx, user, 'delete', 300000);
      await tx.query('UPDATE email_tokens SET session_hash=$2 WHERE token_hash=$1', [
        digest(value),
        req.sessionHash,
      ]);
      const url = `${origin}/account?confirmation=${value}`;
      await mail.queue(
        tx,
        {
          to: user.email,
          subject: 'Confirm your U Stay Fit account deletion request',
          text: `Confirm that you requested account deletion by opening this link in the same browser where you are signed in:\n${url}\n\nIt expires in five minutes. Opening it does not delete anything. You must confirm again on the account page. If you did not request deletion, ignore this message.`,
        },
        user.id,
      );
      return {
        body: {
          ok: true,
          devLink: !production && mailer.mode.startsWith('console') ? url : undefined,
        },
      };
    }),
  );
  app.post(
    '/api/account/confirm-deletion',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { token } = tokenOnlySchema.parse(req.body);
      const consumed = await tx.query(
        "DELETE FROM email_tokens WHERE token_hash=$1 AND user_id=$2 AND purpose='delete' AND auth_version=$3 AND session_hash=$4 AND expires_at>NOW() RETURNING token_hash",
        [digest(token), user.id, user.auth_version, req.sessionHash],
      );
      if (!consumed.rows.length)
        return fail(
          400,
          'This confirmation expired or belongs to another session. Request it again from this browser.',
        );
      await tx.query('UPDATE sessions SET reauthenticated_at=NOW() WHERE token_hash=$1', [
        req.sessionHash,
      ]);
      await state.audit(tx, 'deletion_identity_confirmed', user.id);
      return { body: { ok: true } };
    }),
  );
  app.delete(
    '/api/account',
    requireUser,
    secured(async (tx, user, session, req) => {
      const { password, code } = deleteAccountSchema.parse(req.body);
      if (user.password_hash) {
        if (!(await proof(tx, user, password, code)))
          return fail(
            401,
            'Confirm your password and, if enabled, an unused authenticator or recovery code.',
          );
      } else if (
        !session.reauthenticated_at ||
        new Date(session.reauthenticated_at).getTime() < Date.now() - 300000
      ) {
        return fail(
          403,
          'Confirm your identity using the email confirmation on this page before deleting. Confirmation lasts five minutes.',
        );
      }
      await state.audit(tx, 'account_deleted', user.id);
      await tx.query('DELETE FROM users WHERE id=$1', [user.id]);
      await mail.queue(tx, { to: user.email, ...messages.accountDeleted() });
      return { deleted: true, body: { ok: true } };
    }),
  );
}
