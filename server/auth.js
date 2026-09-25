import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  registerSchema,
  loginSchema,
  passwordSchema,
  identifierOnlySchema,
  emailOnlySchema,
  tokenOnlySchema,
  resetPasswordSchema,
  mfaSchema,
} from '../shared/schemas.js';
import {
  token,
  digest,
  hashPassword,
  verifyPassword,
  needsPasswordUpgrade,
  publicUser,
} from './security.js';
import { messages } from './email.js';
import { containsPersonalInfo, PERSONAL_PASSWORD } from './passwords.js';

export const BREACHED_PASSWORD =
  'That password appears in known data breaches, so it is not safe to use. Please choose a different one.';
const invalid = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
export function registerAuthRoutes(app, ctx) {
  const {
    db,
    origin,
    production,
    mailer,
    isBreached,
    authLimit,
    cookieOptions,
    SESSION_COOKIE,
    OAUTH_COOKIE,
    attachSession,
    requireUser,
    getProfile,
    state,
    mail,
    oauth,
  } = ctx;
  const devLinks = !production && mailer.mode.startsWith('console');
  const link = (path, value) => `${origin}${path}?token=${value}`;
  async function reply(res, result) {
    await mail.finish();
    if (result.session) attachSession(res, result.session);
    return res.status(result.status || 200).json(result.body);
  }
  async function signedIn(tx, user, previous) {
    return {
      session: await state.issueSession(tx, user, previous),
      body: { user: publicUser(user), profile: await getProfile(user.id, tx) },
    };
  }
  async function verification(tx, user) {
    const url = link('/verify', await state.issueToken(tx, user, 'verify', 86400000));
    await mail.queue(tx, { to: user.email, ...messages.verify(url) }, user.id);
    return devLinks ? url : undefined;
  }
  // One warm welcome per account, sent when the account becomes real (see messages.welcome).
  const welcome = (tx, user) =>
    mail.queue(
      tx,
      { to: user.email, ...messages.welcome(user.name, `${origin}/dashboard`) },
      user.id,
    );
  // Include the same minimum response time for known and unknown email addresses;
  // remote email delivery runs independently of the request in production.
  const emailDelay = () => {
    const deadline = Date.now() + (production ? 500 + Math.random() * 100 : 0);
    return () => delay(Math.max(0, deadline - Date.now()));
  };
  app.get('/api/auth/providers', (req, res) =>
    res.json({
      google: oauth.configured('google'),
      facebook: oauth.configured('facebook'),
      devLinks,
    }),
  );
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = registerSchema.parse(req.body);
    if (containsPersonalInfo(input.password, input))
      return reply(res, invalid(400, PERSONAL_PASSWORD));
    if (await isBreached(input.password)) return reply(res, invalid(400, BREACHED_PASSWORD));
    const passwordHash = await hashPassword(input.password);
    const finish = emailDelay();
    try {
      const result = await db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.email]);
        const existing = (
          await tx.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [input.email])
        ).rows[0];
        const allowed = await mail.allowed(tx, input.email);
        const generic = { status: 201, body: { pending: true, email: input.email } };
        if (!allowed) return generic;
        if (existing?.email_verified_at) {
          await mail.queue(
            tx,
            { to: existing.email, ...messages.alreadyRegistered(`${origin}/login`) },
            existing.id,
          );
          return generic;
        }
        const taken = await tx.query(
          'SELECT id FROM users WHERE username = $1 AND ($2::uuid IS NULL OR id <> $2)',
          [input.username, existing?.id || null],
        );
        if (taken.rows.length)
          return invalid(409, 'That username is taken. Please choose another.');
        let user;
        if (existing) {
          await state.revoke(tx, existing);
          user = (
            await tx.query(
              'UPDATE users SET name=$2, username=$3, password_hash=$4 WHERE id=$1 RETURNING *',
              [existing.id, input.name, input.username, passwordHash],
            )
          ).rows[0];
        } else {
          user = (
            await tx.query(
              'INSERT INTO users(id,name,username,email,password_hash,consented_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *',
              [randomUUID(), input.name, input.username, input.email, passwordHash],
            )
          ).rows[0];
        }
        generic.body.devLink = await verification(tx, user);
        await state.audit(tx, 'registration_pending', user.id);
        return generic;
      });
      await finish();
      return reply(res, result);
    } catch (error) {
      if (error.code === '23505')
        return reply(res, invalid(409, 'That username is taken. Please choose another.'));
      throw error;
    }
  });
  app.post('/api/auth/verify', authLimit, async (req, res) => {
    const { token: value } = tokenOnlySchema.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const user = await state.tokenUser(tx, value, 'verify');
      if (!user || user.email_verified_at)
        return invalid(400, 'This confirmation link is invalid or expired. Request a new one.');
      await tx.query('DELETE FROM email_tokens WHERE token_hash=$1', [digest(value)]);
      await tx.query('UPDATE users SET email_verified_at=NOW() WHERE id=$1', [user.id]);
      user.email_verified_at = new Date();
      await state.audit(tx, 'email_verified', user.id);
      await welcome(tx, user);
      return signedIn(tx, user, req.cookies[SESSION_COOKIE]);
    });
    return reply(res, result);
  });
  app.post('/api/auth/resend-verification', authLimit, async (req, res) => {
    const { identifier } = identifierOnlySchema.parse(req.body);
    const finish = emailDelay();
    const result = await db.transaction(async (tx) => {
      const user = (
        await tx.query('SELECT * FROM users WHERE username=$1 OR email=$1 FOR UPDATE', [identifier])
      ).rows[0];
      const allowed = await mail.allowed(tx, user?.email || identifier);
      const devLink =
        allowed && user?.email && !user.email_verified_at
          ? await verification(tx, user)
          : undefined;
      return { body: { ok: true, devLink } };
    });
    await finish();
    return reply(res, result);
  });
  // "neeraj.yadav_08@example.com" -> "Neeraj Yadav"; the person can change it on the account page.
  const nameFromEmail = (email) => {
    const words = email
      .split('@')[0]
      .split(/[^a-zA-Z]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    const name = words.join(' ').slice(0, 70);
    return name.length >= 2 ? name : 'Friend';
  };
  // "neeraj.yadav_08@example.com" -> "neeraj_yadav_08", with a random suffix if that is taken.
  async function usernameFromEmail(tx, email) {
    let base = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
    if (base.length < 3) base = `member_${base}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate =
        attempt === 0 ? base : `${base.slice(0, 25)}_${token().slice(0, 4).toLowerCase()}`;
      if (!/^[a-z0-9_]{3,30}$/.test(candidate)) continue;
      const taken = await tx.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
      if (!taken.rows.length) return candidate;
    }
    return `member_${token()
      .slice(0, 16)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '0')}`;
  }
  // Signing in with an email address that has no confirmed account creates one, exactly as
  // the sign-up form would (same password rules, same confirmation email). A username we do
  // not know cannot become an account, because there is no address to confirm.
  async function createBySignIn(input, existingId) {
    const email = emailOnlySchema.safeParse({ email: input.identifier });
    if (!email.success) {
      await state.audit(db, 'login_failed', existingId);
      return invalid(
        404,
        'We could not find an account with that username. Check the spelling, or sign in with your email address to create a new account.',
      );
    }
    if (!passwordSchema.safeParse(input.password).success)
      return invalid(
        400,
        'There is no account for that email yet. To create one, choose a password of at least 12 characters - a memorable passphrase works well.',
      );
    if (containsPersonalInfo(input.password, email.data)) return invalid(400, PERSONAL_PASSWORD);
    if (await isBreached(input.password)) return invalid(400, BREACHED_PASSWORD);
    const passwordHash = await hashPassword(input.password);
    const finish = emailDelay();
    const result = await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email.data.email]);
      const existing = (
        await tx.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [email.data.email])
      ).rows[0];
      if (existing?.email_verified_at)
        return invalid(409, 'That email was just confirmed for an account. Please sign in again.');
      if (!(await mail.allowed(tx, email.data.email)))
        return invalid(
          429,
          'Too many confirmation emails were requested for that address. Please try again later.',
        );
      let user;
      if (existing) {
        // An unconfirmed sign-up never proved it owns the address, so this attempt takes it
        // over (keeping the name and username it chose), just as registering again would.
        await state.revoke(tx, existing);
        user = (
          await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1 RETURNING *', [
            existing.id,
            passwordHash,
          ])
        ).rows[0];
      } else {
        user = (
          await tx.query(
            'INSERT INTO users(id,name,username,email,password_hash,consented_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *',
            [
              randomUUID(),
              nameFromEmail(email.data.email),
              await usernameFromEmail(tx, email.data.email),
              email.data.email,
              passwordHash,
            ],
          )
        ).rows[0];
      }
      const devLink = await verification(tx, user);
      await state.audit(tx, 'registration_pending', user.id);
      return {
        status: 201,
        body: { pending: true, created: true, email: email.data.email, devLink },
      };
    });
    await finish();
    return result;
  }
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const user = (
        await tx.query('SELECT * FROM users WHERE username=$1 OR email=$1 FOR UPDATE', [
          input.identifier,
        ])
      ).rows[0];
      const key = `login:${user?.id || input.identifier}`;
      if (!(await state.limit(tx, key, 10, 900000)).allowed)
        return invalid(429, 'Too many attempts for this account. Try again in 15 minutes.');
      if (user && !user.password_hash) {
        await verifyPassword(input.password); // take as long as a real comparison
        await state.audit(tx, 'login_failed', user.id);
        return invalid(
          400,
          'This account signs in with Google or Facebook and has no password. Use that button instead.',
        );
      }
      const matches = Boolean(user) && (await verifyPassword(input.password, user.password_hash));
      // Nobody has confirmed this identifier with this password: an email address can become
      // a new account (handled after this transaction, outside the row lock).
      if (!user || (!user.email_verified_at && !matches)) return { create: true, id: user?.id };
      if (!matches) {
        await state.audit(tx, 'login_failed', user.id);
        return invalid(
          401,
          'That password is incorrect. Try again, or use “Forgot your password?” to reset it.',
        );
      }
      if (!user.email_verified_at)
        return invalid(403, 'Please confirm your email address first.', { unverified: true });
      if (needsPasswordUpgrade(user.password_hash))
        await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
          user.id,
          await hashPassword(input.password),
        ]);
      await tx.query('DELETE FROM request_limits WHERE key=$1', [state.opaque(key)]);
      if (user.totp_enabled_at)
        return {
          body: { mfaRequired: true, mfaToken: await state.issueToken(tx, user, 'mfa', 300000) },
        };
      await state.audit(tx, 'login_succeeded', user.id);
      return signedIn(tx, user, req.cookies[SESSION_COOKIE]);
    });
    return reply(res, result.create ? await createBySignIn(input, result.id) : result);
  });
  app.post('/api/auth/mfa', authLimit, async (req, res) => {
    const { mfaToken, code } = mfaSchema.parse(req.body);
    return reply(
      res,
      await db.transaction(async (tx) => {
        const user = await state.tokenUser(tx, mfaToken, 'mfa');
        if (!user?.totp_enabled_at)
          return invalid(401, 'Your sign-in attempt expired. Enter your password again.', {
            restart: true,
          });
        if (!(await state.limit(tx, `mfa:${user.id}`, 10, 900000)).allowed)
          return invalid(429, 'Too many code attempts. Try again in 15 minutes.', {
            restart: true,
          });
        if (!(await state.factor(tx, user, code))) {
          await state.audit(tx, 'mfa_failed', user.id);
          return invalid(
            401,
            'That code is not valid. Enter a current authenticator code or an unused recovery code.',
          );
        }
        await tx.query('DELETE FROM email_tokens WHERE token_hash=$1', [digest(mfaToken)]);
        await state.audit(tx, 'mfa_succeeded', user.id);
        return signedIn(tx, user, req.cookies[SESSION_COOKIE]);
      }),
    );
  });
  app.post('/api/auth/forgot-password', authLimit, async (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    const finish = emailDelay();
    const result = await db.transaction(async (tx) => {
      const user = (await tx.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]))
        .rows[0];
      const allowed = await mail.allowed(tx, email);
      let devLink;
      if (allowed && user?.password_hash) {
        const url = link('/reset-password', await state.issueToken(tx, user, 'reset', 3600000));
        await mail.queue(tx, { to: email, ...messages.reset(url) }, user.id);
        devLink = devLinks ? url : undefined;
      } else if (allowed && user)
        await mail.queue(tx, { to: email, ...messages.resetNoPassword() }, user.id);
      return { body: { ok: true, devLink } };
    });
    await finish();
    return reply(res, result);
  });
  app.post('/api/auth/reset-password', authLimit, async (req, res) => {
    const { token: value, password } = resetPasswordSchema.parse(req.body);
    if (await isBreached(password)) return reply(res, invalid(400, BREACHED_PASSWORD));
    const hash = await hashPassword(password);
    const result = await db.transaction(async (tx) => {
      const user = await state.tokenUser(tx, value, 'reset');
      if (!user) return invalid(400, 'This reset link is invalid or expired. Request a new one.');
      if (containsPersonalInfo(password, user)) return invalid(400, PERSONAL_PASSWORD);
      await state.revoke(tx, user);
      await tx.query(
        'UPDATE users SET password_hash=$2, password_changed_at=NOW(), email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=$1',
        [user.id, hash],
      );
      await tx.query('DELETE FROM request_limits WHERE key=$1', [state.opaque(`login:${user.id}`)]);
      await mail.queue(tx, { to: user.email, ...messages.passwordChanged() }, user.id);
      // The reset link also proves the mailbox, so a never-confirmed sign-up becomes real here.
      if (!user.email_verified_at) await welcome(tx, user);
      await state.audit(tx, 'password_reset', user.id);
      // Proving mailbox ownership never bypasses the configured second factor.
      return { body: { ok: true, signInRequired: true } };
    });
    if (result.body.ok) res.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply(res, result);
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (typeof req.cookies[SESSION_COOKIE] === 'string')
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(req.cookies[SESSION_COOKIE]),
      ]);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ ok: true });
  });
  app.post('/api/auth/logout-all', requireUser, async (req, res) => {
    const result = await db.transaction(async (tx) => {
      const current = await state.sessionUser(tx, req);
      if (!current) return invalid(401, 'Please sign in again.');
      await state.revoke(tx, current.user);
      await state.audit(tx, 'all_sessions_revoked', current.user.id);
      return { body: { ok: true } };
    });
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply(res, result);
  });

  app.get('/api/auth/:provider', authLimit, async (req, res) => {
    const provider = req.params.provider;
    if (!['google', 'facebook'].includes(provider))
      return res.status(404).json({ error: 'Unknown provider.' });
    if (!oauth.configured(provider)) return res.redirect('/login?error=provider_not_configured');
    const value = token(),
      verifier = token(),
      nonce = token();
    let binding = null;
    if (req.query.intent === 'reauth') {
      // Facebook provides no signed authentication-time proof in this flow.
      // Use the independent mailbox confirmation on Account instead.
      if (provider === 'facebook')
        return res.redirect('/account?error=email_confirmation_required');
      const raw = req.cookies[SESSION_COOKIE];
      if (typeof raw !== 'string') return res.redirect('/login');
      const row = (
        await db.query(
          'SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND s.auth_version=u.auth_version',
          [digest(raw)],
        )
      ).rows[0];
      if (!row) return res.redirect('/login');
      req.user = { id: row.id };
      req.sessionHash = digest(raw);
      binding = req;
    }
    const ok = await db.transaction(async (tx) => {
      const current = binding ? await state.sessionUser(tx, binding) : null;
      if (binding && !current) return false;
      if (
        current &&
        !(
          await tx.query('SELECT 1 FROM oauth_identities WHERE user_id=$1 AND provider=$2', [
            current.user.id,
            provider,
          ])
        ).rows.length
      )
        return false;
      await tx.query(
        'INSERT INTO oauth_states(state_hash,provider,verifier,nonce,expires_at,user_id,session_hash,auth_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          digest(value),
          provider,
          verifier,
          nonce,
          new Date(Date.now() + 300000),
          current?.user.id || null,
          binding?.sessionHash || null,
          current?.user.auth_version ?? null,
        ],
      );
      return true;
    });
    if (!ok) return res.redirect('/account?error=reauth_failed');
    res.cookie(OAUTH_COOKIE, value, { ...cookieOptions, maxAge: 300000 });
    res.redirect(
      oauth.authorization(provider, { state: value, verifier, nonce, reauth: Boolean(binding) }),
    );
  });
  app.get('/api/auth/:provider/callback', authLimit, async (req, res) => {
    const { provider } = req.params,
      { state: value, code } = req.query;
    if (
      !['google', 'facebook'].includes(provider) ||
      typeof value !== 'string' ||
      typeof code !== 'string' ||
      value !== req.cookies[OAUTH_COOKIE]
    )
      return res.redirect('/login?error=oauth_failed');
    res.clearCookie(OAUTH_COOKIE, cookieOptions);
    const attempt = (
      await db.query(
        'DELETE FROM oauth_states WHERE state_hash=$1 AND provider=$2 AND expires_at>NOW() RETURNING *',
        [digest(value), provider],
      )
    ).rows[0];
    if (!attempt) return res.redirect('/login?error=oauth_failed');
    try {
      const info = await oauth.exchange(provider, code, attempt);
      const result = await db.transaction(async (tx) => {
        // Serialize identity creation and mail-address claims. Never silently link accounts.
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `${provider}:${info.subject}`,
        ]);
        let user = (
          await tx.query(
            'SELECT u.* FROM users u JOIN oauth_identities o ON o.user_id=u.id WHERE o.provider=$1 AND o.subject=$2 FOR UPDATE OF u',
            [provider, info.subject],
          )
        ).rows[0];
        if (attempt.user_id) {
          if (provider !== 'google') throw new Error('Use mailbox confirmation');
          if (
            !user ||
            user.id !== attempt.user_id ||
            user.auth_version !== attempt.auth_version ||
            digest(req.cookies[SESSION_COOKIE] || '') !== attempt.session_hash
          )
            throw new Error('Reauthentication mismatch');
          const changed = await tx.query(
            'UPDATE sessions SET reauthenticated_at=NOW() WHERE token_hash=$1 AND user_id=$2 AND auth_version=$3 AND expires_at>NOW() RETURNING token_hash',
            [attempt.session_hash, user.id, user.auth_version],
          );
          if (!changed.rows.length) throw new Error('Expired session');
          await state.audit(tx, 'provider_reauthenticated', user.id);
          return { redirect: '/account?reauth=ok' };
        }
        if (!user) {
          const email = info.email || null;
          if (!email) return { redirect: '/login?error=provider_email_required' };
          if (email) {
            await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);
            const sameEmail = (
              await tx.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email])
            ).rows[0];
            if (sameEmail) return { redirect: '/login?error=use_original_login' };
          }
          user = (
            await tx.query(
              'INSERT INTO users(id,name,username,email,email_verified_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
              [
                randomUUID(),
                String(info.name || 'Friend').slice(0, 70),
                `member_${token().slice(0, 16)}`,
                email,
                email ? new Date() : null,
              ],
            )
          ).rows[0];
          await tx.query(
            'INSERT INTO oauth_identities(provider,subject,user_id) VALUES ($1,$2,$3)',
            [provider, info.subject, user.id],
          );
          await welcome(tx, user);
        }
        // Local TOTP, if present, cannot be bypassed through an additional provider identity.
        if (user.totp_enabled_at) return { redirect: '/login?error=use_original_login' };
        await state.audit(tx, 'provider_login_succeeded', user.id);
        return {
          session: await state.issueSession(tx, user, req.cookies[SESSION_COOKIE]),
          redirect: (await getProfile(user.id, tx)) ? '/dashboard' : '/onboarding',
        };
      });
      await mail.finish();
      if (result.session) attachSession(res, result.session);
      res.redirect(result.redirect);
    } catch {
      console.warn(JSON.stringify({ event: 'oauth_callback_failed', provider }));
      res.redirect(attempt.user_id ? '/account?error=reauth_failed' : '/login?error=oauth_failed');
    }
  });
}
