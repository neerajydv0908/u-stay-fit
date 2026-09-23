import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApp } from '../server/app.js';
import { createDatabase } from '../server/db.js';
import { hashPassword } from '../server/security.js';
import { createAuthState } from '../server/auth-state.js';
const origin = 'https://production.example.test';
const secret = randomBytes(40).toString('base64url');
let db, server, base, cookie, user;
const settings = {
  origin,
  production: true,
  trustProxy: 'loopback',
  appSecret: secret,
  rateLimitMax: 1000,
  apiLimit: 5000,
  mailer: { mode: 'test outbox', send: async () => {} },
  isBreached: async () => false,
};
async function start(options = {}) {
  const server = createApp(db, { ...settings, ...options }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
before(async () => {
  db = await createDatabase({ url: '', path: 'memory://' });
  ({ server, base } = await start());
  user = (
    await db.query(
      "INSERT INTO users(id,name,username,email,password_hash,email_verified_at) VALUES('00000000-0000-4000-8000-000000000003','Boundary Test','boundary_test','boundary@example.test',$1,NOW()) RETURNING *",
      [await hashPassword('A-test-only-passphrase-2026')],
    )
  ).rows[0];
  const state = createAuthState(db, secret);
  cookie = '__Host-usf_session=' + (await db.transaction((tx) => state.issueSession(tx, user)));
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (db) await db.close();
});
async function request(
  path,
  { method = 'GET', body, raw, cookie: session, headers = {}, secure = true, target = base } = {},
) {
  const response = await fetch(target + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(secure ? { 'X-Forwarded-Proto': 'https' } : {}),
      ...(body || raw ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(session ? { Cookie: session } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) };
}
test('production sends DENY, nosniff, explicit CSP and HSTS on successful and error responses', async () => {
  for (const path of ['/', '/api/health', '/api/me', '/api/not-a-route']) {
    const r = await request(path);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.match(
      r.headers.get('strict-transport-security'),
      /^max-age=31536000; includeSubDomains$/,
    );
    const csp = r.headers.get('content-security-policy');
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      'upgrade-insecure-requests',
    ])
      assert.ok(csp.includes(directive), directive);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(inline|eval)'/);
    assert.equal(r.headers.get('x-powered-by'), null);
    if (path.startsWith('/api')) assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});
test('HTTP reads redirect to the configured HTTPS origin and never trust the Host header', async () => {
  const r = await request('/privacy?from=test', {
    secure: false,
    headers: { Host: 'attacker.example' },
  });
  assert.equal(r.status, 308);
  assert.equal(r.headers.get('location'), origin + '/privacy?from=test');
  const mutation = await request('/api/auth/login', {
    secure: false,
    method: 'POST',
    body: { identifier: 'boundary_test', password: 'A-test-only-passphrase-2026' },
  });
  assert.equal(mutation.status, 400);
  assert.match(mutation.text, /HTTPS is required/);
});
test('forwarded HTTPS is ignored when the caller is not configured as a trusted proxy', async () => {
  const isolated = await start({ trustProxy: false });
  try {
    assert.equal((await request('/api/health', { target: isolated.base })).status, 308);
  } finally {
    await new Promise((r) => isolated.server.close(r));
  }
});
test('debug, staging, admin, source, dotfiles and database files are not served by production', async () => {
  for (const path of [
    '/debug',
    '/debug/status',
    '/staging',
    '/admin',
    '/.env',
    '/.env.example',
    '/.git/config',
    '/.data/u-stay-fit/PG_VERSION',
    '/server/admin.js',
    '/package.json',
    '/api/debug',
    '/api/admin',
    '/api/staging',
  ]) {
    const r = await request(path);
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(r.text, /password_hash|DATABASE_URL|APP_SECRET|<script/);
  }
});
test('all private API operations require a session, including account controls and export', async () => {
  const routes = [
    ['GET', '/api/me'],
    ['PUT', '/api/profile'],
    ['GET', '/api/entries'],
    ['POST', '/api/entries'],
    ['DELETE', '/api/entries/00000000-0000-4000-8000-000000000003'],
    ['GET', '/api/export'],
    ['GET', '/api/export/pdf'],
    ['GET', '/api/account'],
    ['DELETE', '/api/account'],
    ['POST', '/api/account/details'],
    ['POST', '/api/account/password'],
    ['POST', '/api/account/totp/setup'],
    ['POST', '/api/account/totp/enable'],
    ['POST', '/api/account/totp/disable'],
    ['POST', '/api/account/totp/recovery-codes'],
    ['POST', '/api/account/deletion-confirmation'],
    ['POST', '/api/account/confirm-deletion'],
    ['POST', '/api/auth/logout-all'],
  ];
  for (const [method, path] of routes)
    assert.equal(
      (await request(path, { method, ...(method === 'GET' ? {} : { body: {} }) })).status,
      401,
      `${method} ${path}`,
    );
});
test('malformed, oversized, compressed, invalid-type and cross-origin requests are rejected', async () => {
  const post = { method: 'POST', cookie };
  assert.equal((await request('/api/entries', { ...post, raw: '{bad' })).status, 400);
  assert.equal(
    (await request('/api/entries', { ...post, body: { name: 'x'.repeat(25000) } })).status,
    413,
  );
  assert.equal(
    (
      await request('/api/entries', {
        ...post,
        raw: gzipSync(Buffer.from('{}')),
        headers: { 'Content-Encoding': 'gzip' },
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await request('/api/entries', {
        ...post,
        body: { kind: 'water', date: '2026-01-01', amount: -1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/entries', {
        ...post,
        body: {},
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/entries', {
        ...post,
        raw: '{}',
        headers: { 'Content-Type': 'text/plain' },
      })
    ).status,
    415,
  );
});
test('SQL injection strings remain literal data; markup is escaped when rendered as React text', async () => {
  const injection = "x'); DROP TABLE users; -- <img src=x onerror=alert(1)>";
  const input = {
    kind: 'food',
    date: '2026-01-01',
    name: injection,
    meal: 'Snack',
    calories: 100,
    protein: 2,
    carbs: 10,
    fat: 4,
  };
  const saved = await request('/api/entries', { method: 'POST', cookie, body: input });
  assert.equal(saved.status, 201);
  const rows = (await request('/api/entries', { cookie })).json().entries;
  assert.equal(rows.find((x) => x.id === saved.json().entry.id).name, injection);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
  const markup = renderToStaticMarkup(React.createElement('span', null, rows[0].name));
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img/);
  assert.equal(
    (await request("/api/entries/not-a-uuid' OR 1=1 --", { method: 'DELETE', cookie, body: {} }))
      .status,
    400,
  );
});
test('API limits count malformed JSON, survive app recreation, and cannot be bypassed with spoofed forwarding', async () => {
  const rateSecret = randomBytes(40).toString('base64url');
  const one = await start({
    appSecret: rateSecret,
    apiLimit: 2,
    trustProxy: false,
    production: false,
  });
  const two = await start({
    appSecret: rateSecret,
    apiLimit: 2,
    trustProxy: false,
    production: false,
  });
  try {
    assert.equal(
      (await request('/api/auth/login', { target: one.base, method: 'POST', raw: '{invalid' }))
        .status,
      400,
    );
    assert.equal(
      (
        await request('/api/health', {
          target: one.base,
          headers: { 'X-Forwarded-For': '198.51.100.1' },
        })
      ).status,
      200,
    );
    const blocked = await request('/api/health', {
      target: two.base,
      headers: { 'X-Forwarded-For': '198.51.100.2' },
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
  } finally {
    await new Promise((r) => one.server.close(r));
    await new Promise((r) => two.server.close(r));
  }
});
test('authentication has a stricter IP limit than the general API allowance', async () => {
  const limited = await start({
    appSecret: randomBytes(40).toString('base64url'),
    rateLimitMax: 2,
  });
  try {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await request('/api/auth/login', { target: limited.base, method: 'POST', body: {} }))
          .status,
        400,
      );
    assert.equal(
      (await request('/api/auth/login', { target: limited.base, method: 'POST', body: {} })).status,
      429,
    );
    assert.equal((await request('/api/health', { target: limited.base })).status, 200);
  } finally {
    await new Promise((r) => limited.server.close(r));
  }
});
test('production refuses missing, short or known development secrets, HTTP origins and broad trust', () => {
  for (const appSecret of ['', null, 'short', 'development-only-secret-do-not-use-in-production'])
    assert.throws(() => createApp(db, { ...settings, appSecret }), /APP_SECRET|placeholder/);
  assert.throws(() => createApp(db, { ...settings, origin: 'http://public.example' }), /HTTPS/);
  assert.throws(() => createApp(db, { ...settings, trustProxy: true }), /spoofed/);
});
