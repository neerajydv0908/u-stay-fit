import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ipKeyGenerator } from 'express-rate-limit';
import { createAuthState, SESSION_IDLE_MS, SESSION_MAX_MS } from './auth-state.js';
import { createMailQueue } from './mail-queue.js';
import { createOAuthClient } from './oauth.js';
import { secretValue } from './config.js';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { profileSchema, entrySchema, dateSchema } from '../shared/schemas.js';
import { calculatePlan } from '../shared/calculations.js';
import { digest, publicUser } from './security.js';
import { createMailer } from './email.js';
import { createBreachCheck } from './passwords.js';
import { registerAuthRoutes } from './auth.js';
import { registerAccountRoutes } from './account.js';
import { buildRecordsPdf } from './export.js';

// TRUST_PROXY tells Express how many reverse proxies sit in front of the app, so the
// rate limiter sees the visitor's address instead of the proxy's (or a spoofed header).
export function parseTrustProxy(value, production) {
  if (value == null || value === '') return production ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback" or a comma-separated list of proxy addresses
}
// Photos are served from this app once `npm run photos:fetch` has stored them locally;
// until then the content-security policy still allows the original image host.
const photosSelfHosted = () =>
  existsSync(resolve('dist/photos/food.jpg')) ||
  existsSync(resolve('client/public/photos/food.jpg'));

export function createApp(
  db,
  {
    origin = process.env.APP_ORIGIN || 'http://localhost:5173',
    production = process.env.NODE_ENV === 'production',
    rateLimitMax = 25,
    apiLimit = 240,
    trustProxy = parseTrustProxy(process.env.TRUST_PROXY, production),
    appSecret = secretValue('APP_SECRET'),
    appSecretPrevious = secretValue('APP_SECRET_PREVIOUS'),
    mailer = createMailer({ production }),
    isBreached = createBreachCheck(),
    oauthClient,
  } = {},
) {
  if (production && (!origin.startsWith('https://') || new URL(origin).origin !== origin))
    throw new Error('APP_ORIGIN must use HTTPS in production.');
  if (production && (!appSecret || appSecret.length < 32))
    throw new Error('Production requires APP_SECRET with at least 32 characters.');
  if (production && appSecret === 'development-only-secret-do-not-use-in-production')
    throw new Error('The development placeholder cannot be used as APP_SECRET in production.');
  if (!appSecret) {
    appSecret = 'development-only-secret-do-not-use-in-production';
    console.warn('APP_SECRET is not set; using a development-only value.');
  }
  if (appSecretPrevious && appSecretPrevious === appSecret)
    throw new Error(
      'APP_SECRET_PREVIOUS must differ from APP_SECRET (remove it once rotation is done).',
    );
  if (production && trustProxy === true)
    throw new Error(
      'TRUST_PROXY=true accepts spoofed forwarding headers. Specify the actual proxy hop count or addresses.',
    );
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.set('mailer mode', mailer.mode);
  app.set('mailer', mailer);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: photosSelfHosted()
            ? ["'self'", 'data:']
            : ["'self'", 'data:', 'https://images.unsplash.com'],
          connectSrc: production
            ? ["'self'"]
            : ["'self'", 'ws://localhost:5173', 'ws://127.0.0.1:5173'],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      xFrameOptions: { action: 'deny' },
      strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  // req.secure honors forwarding only from the configured trusted proxy.
  // The edge redirects HTTP too; this guard also covers a misrouted origin request.
  app.use((req, res, next) => {
    if (!production || req.secure) return next();
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET' || req.method === 'HEAD')
      return res.redirect(308, `${origin}${req.originalUrl}`);
    return res.status(400).json({ error: 'HTTPS is required.' });
  });
  const state = createAuthState(db, appSecret, appSecretPrevious || undefined);
  const mail = createMailQueue(db, {
    mailer,
    secret: appSecret,
    previousSecret: appSecretPrevious || undefined,
    state,
    production,
  });
  app.set('flush mail', mail.flush);
  const ip = (req) => ipKeyGenerator(req.ip);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', state.middleware('api', apiLimit, 60000, ip));
  const authLimit = state.middleware('auth', rateLimitMax, 15 * 60000, ip);
  // The __Host- prefix makes browsers refuse the cookie unless it is Secure, has Path=/ and
  // no Domain attribute, so a subdomain or plain-HTTP page can never plant a session cookie.
  const SESSION_COOKIE = production ? '__Host-usf_session' : 'usf_session';
  const OAUTH_COOKIE = production ? '__Host-usf_oauth_state' : 'usf_oauth_state';
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
  };
  const allowedOrigins = new Set([origin]);
  if (!production) {
    allowedOrigins.add('http://127.0.0.1:5173');
    allowedOrigins.add('http://localhost:3001');
    allowedOrigins.add('http://127.0.0.1:3001');
  }
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // An exact Origin allowlist + JSON-only mutations blocks browser CSRF. Browsers that send
      // Sec-Fetch-Site (all current ones) also state where the request came from.
      const site = req.get('sec-fetch-site');
      if (
        !allowedOrigins.has(req.get('origin')) ||
        (site && !['same-origin', 'none'].includes(site))
      )
        return res.status(403).json({ error: 'Request origin is not allowed.' });
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'Send application/json.' });
    }
    next();
  });
  // Count API attempts before JSON parsing, including malformed or oversized bodies.
  app.use('/api', express.json({ limit: '24kb', inflate: false }), cookieParser());
  function attachSession(res, value) {
    res.cookie(SESSION_COOKIE, value, { ...cookieOptions, maxAge: SESSION_MAX_MS });
  }
  async function requireUser(req, res, next) {
    const value = req.cookies[SESSION_COOKIE];
    if (!value || typeof value !== 'string')
      return res.status(401).json({ error: 'Please sign in to continue.' });
    const { rows } = await db.query(
      'SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW() AND s.auth_version = u.auth_version',
      [digest(value)],
    );
    if (!rows[0])
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = rows[0];
    req.sessionHash = digest(value);
    // Activity pushes the idle deadline forward (at most once every five minutes per session),
    // but never beyond the absolute limit counted from when the session was created.
    await db.query(
      `UPDATE sessions SET expires_at = LEAST(created_at + $3::interval, $2::timestamptz)
       WHERE token_hash = $1 AND expires_at < $2::timestamptz - INTERVAL '5 minutes'`,
      [req.sessionHash, new Date(Date.now() + SESSION_IDLE_MS), `${SESSION_MAX_MS / 1000} seconds`],
    );
    next();
  }
  async function getProfile(id, connection = db) {
    const { rows } = await connection.query('SELECT data FROM profiles WHERE user_id = $1', [id]);
    return rows[0]?.data || null;
  }
  const context = {
    db,
    origin,
    production,
    appSecret,
    mailer,
    isBreached,
    authLimit,
    cookieOptions,
    SESSION_COOKIE,
    OAUTH_COOKIE,
    attachSession,
    state,
    mail,
    oauth: oauthClient || createOAuthClient({ origin }),
    requireUser,
    getProfile,
  };

  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  registerAuthRoutes(app, context);
  registerAccountRoutes(app, context);

  function protectedData(handler) {
    return async (req, res) => {
      // Send success only after COMMIT, so a failed transaction cannot look saved.
      const response = {
        code: 200,
        headers: {},
        body: null,
        status(code) {
          this.code = code;
          return this;
        },
        set(name, value) {
          this.headers[name] = value;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
      await db.transaction(async (tx) => {
        const current = await state.sessionUser(tx, req);
        if (!current) return response.status(401).json({ error: 'Please sign in again.' });
        req.user = current.user;
        return handler(req, response, tx);
      });
      for (const [name, value] of Object.entries(response.headers)) res.set(name, value);
      res.status(response.code).json(response.body);
    };
  }
  app.get(
    '/api/me',
    requireUser,
    protectedData(async (req, res, db) => {
      const profile = await getProfile(req.user.id, db);
      res.json({
        user: publicUser(req.user),
        profile,
        plan: profile ? calculatePlan(profile) : null,
      });
    }),
  );
  app.put(
    '/api/profile',
    requireUser,
    protectedData(async (req, res, db) => {
      const profile = profileSchema.parse(req.body);
      // Health-data consent is recorded once, when the first plan is saved, and kept afterwards.
      const existing = await getProfile(req.user.id, db);
      const stored = {
        ...profile,
        consentedAt: existing?.consentedAt || new Date().toISOString(),
      };
      await db.query(
        'INSERT INTO profiles(user_id, data) VALUES ($1,$2) ON CONFLICT(user_id) DO UPDATE SET data = $2, updated_at = NOW()',
        [req.user.id, JSON.stringify(stored)],
      );
      await db.query(
        'UPDATE users SET consented_at = COALESCE(consented_at, NOW()) WHERE id = $1',
        [req.user.id],
      );
      res.json({ profile: stored, plan: calculatePlan(stored) });
    }),
  );
  app.get(
    '/api/entries',
    requireUser,
    protectedData(async (req, res, db) => {
      const from = dateSchema.parse(req.query.from || '2000-01-01');
      const to = dateSchema.parse(
        req.query.to || new Date(Date.now() + 12 * 3600000).toISOString().slice(0, 10),
      );
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000000)
        .parse(req.query.offset || 0);
      const pageSize = 500;
      const { rows } = await db.query(
        "SELECT id, kind, to_char(logged_on, 'YYYY-MM-DD') AS date, data FROM entries WHERE user_id = $1 AND logged_on BETWEEN $2 AND $3 ORDER BY logged_on DESC, created_at DESC, id DESC LIMIT $4 OFFSET $5",
        [req.user.id, from, to, pageSize + 1, offset],
      );
      res.json({
        entries: rows.slice(0, pageSize).map((row) => ({
          ...row.data,
          id: row.id,
          kind: row.kind,
          date: row.date,
        })),
        nextOffset: rows.length > pageSize ? offset + pageSize : null,
      });
    }),
  );
  app.post(
    '/api/entries',
    requireUser,
    protectedData(async (req, res, db) => {
      const input = entrySchema.parse(req.body);
      const { kind, date, ...data } = input;
      // A weight check-in may be recorded twice per day: the second replaces the first and a
      // third is refused, so each day keeps one considered value. `revision` counts the saves.
      const stored = kind === 'weight' ? { ...data, revision: 1 } : data;
      const values = [randomUUID(), req.user.id, kind, date, JSON.stringify(stored)];
      const upsert =
        kind === 'weight'
          ? `ON CONFLICT(user_id, logged_on) WHERE kind = 'weight' DO UPDATE
             SET data = EXCLUDED.data || jsonb_build_object('revision', COALESCE((entries.data->>'revision')::int, 1) + 1),
                 created_at = NOW()
             WHERE COALESCE((entries.data->>'revision')::int, 1) < 2`
          : '';
      const { rows } = await db.query(
        `INSERT INTO entries(id, user_id, kind, logged_on, data) VALUES ($1,$2,$3,$4,$5) ${upsert} RETURNING id, data`,
        values,
      );
      if (!rows.length)
        return res.status(409).json({
          error:
            'Your weight for this day has already been recorded twice, so it stays as it is. Tomorrow’s check-in is a fresh start.',
        });
      res.status(201).json({ entry: { ...input, ...rows[0].data, id: rows[0].id } });
    }),
  );
  app.delete(
    '/api/entries/:id',
    requireUser,
    protectedData(async (req, res, db) => {
      const id = z.uuid().parse(req.params.id);
      const { rows } = await db.query(
        'DELETE FROM entries WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.id],
      );
      if (!rows.length) return res.status(404).json({ error: 'Entry not found.' });
      res.json({ ok: true });
    }),
  );
  const allEntries = (connection, id) =>
    connection.query(
      "SELECT kind, to_char(logged_on, 'YYYY-MM-DD') AS date, data FROM entries WHERE user_id = $1 ORDER BY logged_on",
      [id],
    );
  // Machine-readable copy of everything stored for the account.
  app.get(
    '/api/export',
    requireUser,
    protectedData(async (req, res, db) => {
      const { rows } = await allEntries(db, req.user.id);
      res.set('Content-Disposition', 'attachment; filename="u-stay-fit-records.json"');
      res.json({
        user: publicUser(req.user),
        profile: await getProfile(req.user.id, db),
        entries: rows,
      });
    }),
  );
  // The same data as a readable PDF report, streamed straight to the browser.
  app.get('/api/export/pdf', requireUser, async (req, res) => {
    const { rows } = await allEntries(db, req.user.id);
    const doc = buildRecordsPdf({
      user: publicUser(req.user),
      profile: await getProfile(req.user.id),
      entries: rows,
    });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="u-stay-fit-records.pdf"');
    doc.pipe(res);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    // Only actual frontend routes get the SPA shell. Unknown/debug/admin paths stay 404.
    app.get(
      [
        '/',
        '/login',
        '/signup',
        '/verify',
        '/forgot-password',
        '/reset-password',
        '/account',
        '/onboarding',
        '/dashboard',
        '/privacy',
        '/special-note',
        '/fat-loss',
        '/muscle-gain',
      ],
      (req, res) => res.sendFile(resolve(dist, 'index.html')),
    );
    app.use((req, res) => res.status(404).json({ error: 'Page not found.' }));
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues[0].message,
        fields: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'The request contains invalid JSON.' });
    if (error.type === 'encoding.unsupported')
      return res.status(415).json({ error: 'Compressed request bodies are not accepted.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'The request is too large.' });
    console.error('Request failed:', error.code || error.name); // Avoid logging health data, passwords, or tokens.
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
