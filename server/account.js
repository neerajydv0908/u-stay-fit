import QRCode from 'qrcode';
import {
  accountDetailsSchema,
  changePasswordSchema,
  totpCodeSchema,
  passwordOnlySchema,
  deleteAccountSchema,
  deleteByEmailSchema,
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
    authLimit,
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
  // Google/Facebook accounts have no password, so deletion is confirmed through their mailbox.
  // The emailed link used to work only in the exact browser session that asked for it; opened
  // anywhere else (a phone's mail app, another browser) it showed the sign-in page and could never
  // succeed. The link now opens a public page that deletes the account once DELETE is typed.
  app.post(
    '/api/account/deletion-confirmation',
    requireUser,
    secured(async (tx, user) => {
      if (user.password_hash) return fail(400, 'Confirm using your current password instead.');
      if (!user.email)
        return fail(400, 'Contact the operator to verify ownership of this legacy account.');
      if (!(await mail.allowed(tx, user.email)))
        return fail(429, 'Wait a minute before requesting another deletion email.');
      const value = await state.issueToken(tx, user, 'delete', 900000);
      const url = `${origin}/delete-account?token=${value}`;
      await mail.queue(tx, { to: user.email, ...messages.deletionLink(url) }, user.id);
      await state.audit(tx, 'deletion_link_sent', user.id);
      return {
        body: {
          ok: true,
          email: user.email,
          devLink: !production && mailer.mode.startsWith('console') ? url : undefined,
        },
      };
    }),
  );
  // Public on purpose: the emailed token is the proof of ownership. It is single-use, expires in
  // 15 minutes, dies with any credential change (auth_version), and only covers password-less
  // accounts. Opening the page is harmless; nothing happens until DELETE is typed and submitted.
  app.post('/api/account/delete-by-email', authLimit, async (req, res) => {
    const { token } = deleteByEmailSchema.parse(req.body);
    const cookie = req.cookies[SESSION_COOKIE];
    const result = await db.transaction(async (tx) => {
      const user = await state.tokenUser(tx, token, 'delete');
      if (!user || user.password_hash)
        return fail(
          400,
          'This deletion link is invalid or has expired. Request a new one from the Account page.',
        );
      // Sign this browser out only if it was signed in to the account being deleted.
      const signedInHere =
        typeof cookie === 'string' &&
        (
          await tx.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2', [
            digest(cookie),
            user.id,
          ])
        ).rows.length > 0;
      await state.audit(tx, 'account_deleted', user.id);
      await tx.query('DELETE FROM users WHERE id=$1', [user.id]);
      await mail.queue(tx, { to: user.email, ...messages.accountDeleted(user.name, `${origin}/`) });
      return { deleted: signedInHere, body: { ok: true } };
    });
    await mail.finish();
    if (result.deleted) res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(result.status || 200).json(result.body);
  });
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
          'Accounts without a password are deleted through the link we email you. Use “Email me a deletion link” on the Account page.',
        );
      }
      await state.audit(tx, 'account_deleted', user.id);
      await tx.query('DELETE FROM users WHERE id=$1', [user.id]);
      await mail.queue(tx, { to: user.email, ...messages.accountDeleted(user.name, `${origin}/`) });
      return { deleted: true, body: { ok: true } };
    }),
  );
}
