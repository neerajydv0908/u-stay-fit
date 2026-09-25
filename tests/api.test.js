import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createDatabase } from '../server/db.js';
import { createApp, parseTrustProxy } from '../server/app.js';
import { cleanup, createSecurityWatch } from '../server/maintenance.js';
import { digest } from '../server/security.js';
import { createBreachCheck } from '../server/passwords.js';
import { totpCode, timeStep } from '../server/totp.js';
import { localDate } from '../shared/calculations.js';

let db, server, base;
const origin = 'http://localhost:5173';
// Every email the app tries to send lands here instead of a mailbox.
const outbox = [];
const lastEmail = (to) => outbox.filter((m) => m.to === to).at(-1);
const linkToken = (text) => text.match(/token=([A-Za-z0-9_-]+)/)[1];
const BREACHED = 'correct-horse-battery-staple';
before(async () => {
  db = await createDatabase({
    url: process.env.TEST_DATABASE_URL || '',
    path: 'memory://',
    runMigrations: process.env.TEST_SKIP_MIGRATIONS !== 'true',
  });
  server = createApp(db, {
    origin,
    production: false,
    rateLimitMax: 1000,
    apiLimit: 5000,
    appSecret: 'test-only-application-secret-with-32-chars',
    mailer: { mode: 'console (test)', send: async (message) => void outbox.push(message) },
    isBreached: async (password) => password === BREACHED,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});
async function request(path, { method = 'GET', body, cookie, requestOrigin = origin } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    headers: response.headers,
  };
}
const post = (path, body, cookie) => request(path, { method: 'POST', body, cookie });
const unique = Date.now().toString(36);
const account = {
  name: 'Test Learner',
  username: `learner_${unique}`,
  email: `learner_${unique}@example.com`,
  password: 'A-local-testing-passphrase-2026',
  consent: true,
};
const profile = {
  gender: 'male',
  equationSex: 'male',
  journey: 'loss',
  height: 180,
  weight: 80,
  age: 30,
  activity: 'light',
  targetWeight: 76,
  days: 90,
  eligible: true,
  healthConsent: true,
};
// Registers and verifies a throwaway account, returning a signed-in cookie.
async function signUp(suffix) {
  const details = {
    ...account,
    username: `${suffix}_${unique}`,
    email: `${suffix}_${unique}@example.com`,
  };
  const registered = await post('/auth/register', details);
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const verified = await post('/auth/verify', { token: linkToken(registered.data.devLink) });
  assert.equal(verified.status, 200);
  return { ...details, cookie: verified.cookie, id: verified.data.user.id };
}

test('sign-up requires consent, a safe password, and a confirmed email before it works', async () => {
  assert.equal((await request('/me')).status, 401);
  assert.equal(
    (
      await request('/auth/register', {
        method: 'POST',
        body: account,
        requestOrigin: 'https://malicious.example',
      })
    ).status,
    403,
  );
  assert.equal((await post('/auth/register', { ...account, password: 'weak' })).status, 400);
  assert.equal((await post('/auth/register', { ...account, consent: false })).status, 400);
  const breached = await post('/auth/register', { ...account, password: BREACHED });
  assert.equal(breached.status, 400);
  assert.match(breached.data.error, /data breaches/);
  const personal = await post('/auth/register', {
    ...account,
    password: `${account.username}-is-my-password`,
  });
  assert.equal(personal.status, 400);
  assert.match(personal.data.error, /name, username, or email/);

  const registered = await post('/auth/register', account);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.pending, true);
  assert.equal(registered.cookie, undefined, 'no session before the email is confirmed');
  const mail = lastEmail(account.email);
  assert.match(mail.subject, /Confirm your U Stay Fit email/);
  const token = linkToken(mail.text);
  assert.equal(linkToken(registered.data.devLink), token, 'dev link matches the emailed link');

  const early = await post('/auth/login', {
    identifier: account.username,
    password: account.password,
  });
  assert.equal(early.status, 403);
  assert.equal(early.data.unverified, true);
  assert.equal((await post('/auth/verify', { token: 'not-a-real-token-value-here' })).status, 400);
  const verified = await post('/auth/verify', { token });
  assert.equal(verified.status, 200);
  assert.ok(verified.cookie);
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/);
  assert.match(verified.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(verified.data.user.emailVerified, true);
  assert.equal(verified.data.user.password_hash, undefined);
  assert.equal((await post('/auth/verify', { token })).status, 400, 'links are single-use');

  const stored = (
    await db.query('SELECT password_hash, consented_at FROM users WHERE id=$1', [
      verified.data.user.id,
    ])
  ).rows[0];
  assert.match(stored.password_hash, /^scrypt:/);
  assert.ok(stored.consented_at);
  const storedToken = (
    await db.query('SELECT token_hash FROM sessions WHERE user_id=$1', [verified.data.user.id])
  ).rows[0].token_hash;
  assert.notEqual(storedToken, verified.cookie.split('=')[1]);
  await db.query('DELETE FROM users WHERE id = $1', [verified.data.user.id]);
});

test('registration never reveals whether an email address is already in use', async () => {
  const owner = await signUp('owner');
  const size = (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  const sameEmail = await post('/auth/register', {
    ...account,
    username: `intruder_${unique}`,
    email: owner.email,
  });
  assert.equal(sameEmail.status, 201, 'looks exactly like a fresh sign-up');
  assert.equal(sameEmail.data.devLink, undefined);
  assert.match(lastEmail(owner.email).subject, /already have a U Stay Fit account/);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,
    size,
    'no account was created',
  );
  const sameUsername = await post('/auth/register', {
    ...account,
    username: owner.username,
    email: `other_${unique}@example.com`,
  });
  assert.equal(sameUsername.status, 409, 'usernames are public handles and must be unique');
  // An unconfirmed sign-up does not block the real owner of the address.
  const squat = await post('/auth/register', {
    ...account,
    username: `squat_${unique}`,
    email: `victim_${unique}@example.com`,
  });
  assert.equal(squat.status, 201);
  const real = await post('/auth/register', {
    ...account,
    username: `real_${unique}`,
    email: `victim_${unique}@example.com`,
  });
  assert.equal(real.status, 201);
  assert.ok(real.data.devLink, 'the newer sign-up gets a confirmation link');
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM users WHERE username = $1', [
        `squat_${unique}`,
      ])
    ).rows[0].n,
    0,
  );
  const verified = await post('/auth/verify', { token: linkToken(real.data.devLink) });
  assert.equal(verified.status, 200);
  await db.query('DELETE FROM users WHERE id = $1 OR id = $2', [owner.id, verified.data.user.id]);
});

test('profile consent, private records, isolation between accounts, and export', async () => {
  const me = await signUp('records');
  const cookie = me.cookie;
  assert.equal(
    (await request('/profile', { method: 'PUT', cookie, body: { ...profile, age: 12 } })).status,
    400,
  );
  assert.equal(
    (
      await request('/profile', {
        method: 'PUT',
        cookie,
        body: { ...profile, healthConsent: false },
      })
    ).status,
    400,
  );
  const saved = await request('/profile', { method: 'PUT', cookie, body: profile });
  assert.equal(saved.status, 200);
  assert.ok(saved.data.plan.target >= 1500);
  assert.ok(saved.data.profile.consentedAt);
  const current = await request('/me', { cookie });
  assert.equal(current.data.profile.weight, 80);
  assert.ok(current.data.user.consentedAt);
  assert.equal(current.data.user.hasPassword, true);
  assert.equal(current.data.user.twoFactorEnabled, false);
  const date = localDate();
  assert.equal((await post('/entries', { kind: 'water', date, amount: -1 }, cookie)).status, 400);
  const food = await post(
    '/entries',
    {
      kind: 'food',
      date,
      name: '<script>alert(1)</script>',
      meal: 'Lunch',
      calories: 450,
      protein: 20,
      carbs: 55,
      fat: 12,
    },
    cookie,
  );
  assert.equal(food.status, 201);
  assert.equal((await post('/entries', { kind: 'water', date, amount: 250 }, cookie)).status, 201);
  assert.equal(
    (
      await post(
        '/entries',
        { kind: 'exercise', date, name: 'Walk', minutes: 30, calories: 100 },
        cookie,
      )
    ).status,
    201,
  );
  const w1 = await post('/entries', { kind: 'weight', date, weight: 79.7 }, cookie);
  const w2 = await post(
    '/entries',
    { kind: 'weight', date, weight: 79.5, bodyFat: 20, muscle: 40 },
    cookie,
  );
  assert.equal(w1.data.entry.id, w2.data.entry.id, 'the second check-in replaces the first');
  // A third check-in on the same day is refused and the second one stays.
  const w3 = await post('/entries', { kind: 'weight', date, weight: 79.1 }, cookie);
  assert.equal(w3.status, 409);
  assert.match(w3.data.error, /recorded twice/);
  const logs = await request('/entries', { cookie });
  assert.equal(logs.data.entries.length, 4);
  assert.equal(logs.data.entries.filter((e) => e.kind === 'weight')[0].weight, 79.5);
  assert.equal(logs.data.entries.filter((e) => e.kind === 'weight')[0].revision, 2);
  const exported = await request('/export', { cookie });
  assert.equal(exported.data.entries.length, 4);
  assert.equal(exported.data.user.password_hash, undefined);
  // The readable copy is a PDF built on the server from the same records.
  assert.equal((await request('/export/pdf')).status, 401);
  const pdf = await fetch(`${base}/api/export/pdf`, { headers: { Cookie: cookie } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(
    pdf.headers.get('content-disposition'),
    /attachment; filename="u-stay-fit-records\.pdf"/,
  );
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.toString('latin1'), /%%EOF\s*$/, 'the document is complete');
  assert.ok(bytes.length > 2000);
  const stranger = await signUp('stranger');
  assert.equal((await request('/entries', { cookie: stranger.cookie })).data.entries.length, 0);
  assert.equal(
    (
      await request(`/entries/${food.data.entry.id}`, {
        method: 'DELETE',
        cookie: stranger.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/entries/${food.data.entry.id}`, { method: 'DELETE', cookie, body: {} }))
      .status,
    200,
  );
  assert.equal((await request('/entries', { cookie })).data.entries.length, 3);
  assert.equal((await post('/auth/logout', {}, cookie)).status, 200);
  assert.equal((await request('/me', { cookie })).status, 401);
  const login = await post('/auth/login', { identifier: me.email, password: me.password });
  assert.equal(login.status, 200);
  assert.equal(login.data.profile.targetWeight, 76);
  await db.query('DELETE FROM users WHERE id = $1 OR id = $2', [me.id, stranger.id]);
});

test('signing in with an unknown email creates the account; unknown usernames do not', async () => {
  const email = `first.last.${unique}@example.com`;
  const password = 'A-brand-new-sign-in-passphrase-2026';
  const ghost = await post('/auth/login', { identifier: `nobody_${unique}`, password });
  assert.equal(ghost.status, 404);
  assert.match(ghost.data.error, /sign in with your email address/);
  const weak = await post('/auth/login', { identifier: email, password: 'short' });
  assert.equal(weak.status, 400);
  assert.match(weak.data.error, /at least 12 characters/);
  const breached = await post('/auth/login', { identifier: email, password: BREACHED });
  assert.equal(breached.status, 400);
  assert.match(breached.data.error, /data breaches/);
  const personal = await post('/auth/login', {
    identifier: email,
    password: `${email.split('@')[0]}-and-more`,
  });
  assert.equal(personal.status, 400);
  assert.match(personal.data.error, /name, username, or email/);
  const count = async () =>
    (await db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [email])).rows[0].n;
  assert.equal(await count(), 0, 'nothing is created until the password is acceptable');

  const created = await post('/auth/login', { identifier: email, password });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.pending, true);
  assert.equal(created.data.created, true);
  assert.equal(created.data.email, email);
  assert.equal(created.cookie, undefined, 'still no session before the email is confirmed');
  assert.match(lastEmail(email).subject, /Confirm your U Stay Fit email/);
  const row = (
    await db.query(
      'SELECT id, name, username, consented_at, email_verified_at FROM users WHERE email = $1',
      [email],
    )
  ).rows[0];
  assert.match(row.name, /^First Last/, 'name is derived from the address');
  assert.match(row.username, /^first_last_/, 'so is the username');
  assert.ok(row.consented_at);
  assert.equal(row.email_verified_at, null);
  // Until the link is opened the account behaves like any other unconfirmed sign-up.
  const again = await post('/auth/login', { identifier: email, password });
  assert.equal(again.status, 403);
  assert.equal(again.data.unverified, true);
  assert.equal(await count(), 1, 'signing in again does not create a second account');
  // A different password before confirmation takes the unconfirmed address over, exactly as
  // registering again would: same account row, chosen name kept, older link revoked.
  const retried = await post('/auth/login', { identifier: email, password: `${password}-2` });
  assert.equal(retried.status, 201, JSON.stringify(retried.data));
  assert.equal(retried.data.created, true);
  assert.equal(await count(), 1);
  assert.equal(
    (await post('/auth/verify', { token: linkToken(created.data.devLink) })).status,
    400,
  );
  const verified = await post('/auth/verify', { token: linkToken(retried.data.devLink) });
  assert.equal(verified.status, 200);
  assert.ok(verified.cookie);
  assert.equal(verified.data.user.id, row.id);
  assert.equal(verified.data.user.name, row.name);
  assert.equal(verified.data.user.username, row.username);
  const cookie = verified.cookie;

  // The generated name and username can be changed afterwards; handles stay unique.
  const other = await signUp('other');
  const clash = await post(
    '/account/details',
    { name: 'Chosen Name', username: other.username },
    cookie,
  );
  assert.equal(clash.status, 409);
  assert.equal(
    (await post('/account/details', { name: 'C', username: 'fine_name' }, cookie)).status,
    400,
  );
  assert.equal(
    (await post('/account/details', { name: 'Chosen Name', username: 'no spaces' }, cookie)).status,
    400,
  );
  const renamed = await post(
    '/account/details',
    { name: 'Chosen Name', username: `Chosen_${unique}` },
    cookie,
  );
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.user.name, 'Chosen Name');
  assert.equal(renamed.data.user.username, `chosen_${unique}`);
  assert.equal(renamed.data.user.password_hash, undefined);
  assert.equal((await request('/me', { cookie })).data.user.username, `chosen_${unique}`);
  assert.equal(
    (await request('/account/details', { method: 'POST', body: { name: 'X Y', username: 'x_y' } }))
      .status,
    401,
  );

  // Existing accounts keep every check: a wrong password is refused, never replaced.
  const wrong = await post('/auth/login', {
    identifier: email,
    password: 'Some-other-passphrase-2026',
  });
  assert.equal(wrong.status, 401);
  assert.match(wrong.data.error, /incorrect/);
  assert.equal(await count(), 1);
  const login = await post('/auth/login', {
    identifier: `chosen_${unique}`,
    password: `${password}-2`,
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.name, 'Chosen Name');
  // Social-only accounts have no password to check and are pointed at their button.
  await db.query('UPDATE users SET password_hash = NULL WHERE id = $1', [other.id]);
  const social = await post('/auth/login', { identifier: other.email, password: other.password });
  assert.equal(social.status, 400);
  assert.match(social.data.error, /Google or Facebook/);
  await db.query('DELETE FROM users WHERE id = $1 OR id = $2', [row.id, other.id]);
});

test('sessions end after three idle days or seven days in total; activity extends the idle deadline', async () => {
  const me = await signUp('idle');
  const hash = digest(me.cookie.split('=')[1]);
  const session = async () =>
    (await db.query('SELECT expires_at, created_at FROM sessions WHERE token_hash=$1', [hash]))
      .rows[0];
  const daysFromNow = (value) => (new Date(value) - Date.now()) / 86400000;
  assert.ok(Math.abs(daysFromNow((await session()).expires_at) - 3) < 0.01, 'idle deadline');
  // Activity renews the idle deadline...
  await db.query("UPDATE sessions SET expires_at = NOW() + INTERVAL '1 day' WHERE token_hash=$1", [
    hash,
  ]);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 200);
  assert.ok(Math.abs(daysFromNow((await session()).expires_at) - 3) < 0.01, 'renewed');
  // ...but never past seven days after the session was created.
  await db.query(
    "UPDATE sessions SET created_at = NOW() - INTERVAL '6 days', expires_at = NOW() + INTERVAL '1 hour' WHERE token_hash=$1",
    [hash],
  );
  assert.equal((await request('/me', { cookie: me.cookie })).status, 200);
  assert.ok(Math.abs(daysFromNow((await session()).expires_at) - 1) < 0.01, 'absolute limit');
  // An expired session is refused and later removed by maintenance.
  await db.query(
    "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash=$1",
    [hash],
  );
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
  await cleanup(db);
  assert.equal(await session(), undefined);
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('a browser-declared cross-site request is refused even when its Origin header matches', async () => {
  const send = (site) =>
    fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(site ? { 'Sec-Fetch-Site': site } : {}),
      },
      body: '{}',
    });
  assert.equal((await send('cross-site')).status, 403);
  assert.equal((await send('same-site')).status, 403);
  assert.equal((await send('same-origin')).status, 200);
  assert.equal((await send()).status, 200, 'clients without the header rely on the Origin check');
});

test('the security watch alerts once per hour on unusual event volumes and emails the operator', async () => {
  const sent = [],
    logged = [];
  const watch = createSecurityWatch(db, {
    mailer: { send: async (message) => void sent.push(message) },
    to: 'operator@example.com',
    thresholds: { test_probe: 3 },
    log: (line) => logged.push(JSON.parse(line)),
  });
  assert.deepEqual(await watch(), []);
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO security_events(id,event,subject_hash) VALUES($1,'test_probe',NULL)",
      [randomUUID()],
    );
  const alerts = await watch();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].event, 'test_probe');
  assert.deepEqual(logged[0], {
    event: 'security_alert',
    window: '1 hour',
    counts: { test_probe: 3 },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'operator@example.com');
  assert.match(sent[0].text, /test_probe: 3 \(threshold 3\)/);
  assert.deepEqual(await watch(), [], 'the same condition is not reported again within the hour');
  assert.equal((await watch(Date.now() + 3600001)).length, 1, 'but is reported again later');
  await db.query("DELETE FROM security_events WHERE event = 'test_probe'");
});

test('APP_SECRET can be rotated: the previous key still reads two-factor secrets, which move to the new key on use', async () => {
  const me = await signUp('rotate');
  const setup = await post('/account/totp/setup', { password: me.password }, me.cookie);
  const secret = setup.data.secret;
  assert.equal(
    (await post('/account/totp/enable', { code: totpCode(secret, timeStep()) }, me.cookie)).status,
    200,
  );
  const stored = async () =>
    (await db.query('SELECT totp_secret FROM users WHERE id = $1', [me.id])).rows[0].totp_secret;
  const before = await stored();
  // A second server with a new APP_SECRET and the old one as APP_SECRET_PREVIOUS.
  const rotated = createApp(db, {
    origin,
    production: false,
    rateLimitMax: 1000,
    apiLimit: 5000,
    appSecret: 'rotated-application-secret-with-32-chars!',
    appSecretPrevious: 'test-only-application-secret-with-32-chars',
    mailer: { mode: 'console (test)', send: async () => {} },
    isBreached: async () => false,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => rotated.once('listening', resolve));
  const url = `http://127.0.0.1:${rotated.address().port}/api`;
  try {
    assert.throws(
      () =>
        createApp(db, {
          origin,
          appSecret: 'same-secret-twice-is-not-a-rotation-1234',
          appSecretPrevious: 'same-secret-twice-is-not-a-rotation-1234',
          mailer: { mode: 'console (test)', send: async () => {} },
        }),
      /must differ/,
    );
    const call = (path, body) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, data: await r.json() }));
    const challenge = await call('/auth/login', { identifier: me.username, password: me.password });
    assert.equal(challenge.data.mfaRequired, true);
    const passed = await call('/auth/mfa', {
      mfaToken: challenge.data.mfaToken,
      code: totpCode(secret, timeStep() + 1),
    });
    assert.equal(passed.status, 200, JSON.stringify(passed.data));
    const after = await stored();
    assert.notEqual(after, before, 'the secret was re-encrypted with the new key');
    // The rotated server keeps working with the re-encrypted secret (codes are single-use, so
    // the replay guard is reset to reuse the same time step).
    await db.query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [me.id]);
    const again = await call('/auth/login', { identifier: me.username, password: me.password });
    assert.equal(
      (
        await call('/auth/mfa', {
          mfaToken: again.data.mfaToken,
          code: totpCode(secret, timeStep() + 1),
        })
      ).status,
      200,
    );
    assert.equal(await stored(), after, 'no further re-encryption once on the new key');
  } finally {
    await new Promise((resolve) => rotated.close(resolve));
  }
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('ten failed sign-ins lock the account for fifteen minutes, even with the right password', async () => {
  const me = await signUp('locked');
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await post('/auth/login', { identifier: me.username, password: 'wrong-password-attempt' }))
        .status,
      401,
    );
  const blocked = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Try again in 15 minutes/);
  const row = (
    await db.query('SELECT expires_at FROM request_limits WHERE key = $1', [
      createHmac('sha256', 'test-only-application-secret-with-32-chars')
        .update(`login:${me.id}`)
        .digest('hex'),
    ])
  ).rows[0];
  assert.ok(new Date(row.expires_at) > new Date());
  // Unknown identifiers are throttled the same way, so lockouts cannot be used to find accounts.
  for (let i = 0; i < 10; i++)
    await post('/auth/login', { identifier: `ghost_${unique}`, password: 'x' });
  assert.equal(
    (await post('/auth/login', { identifier: `ghost_${unique}`, password: 'x' })).status,
    429,
  );
  // Simulate the lock expiring.
  await db.query(
    "UPDATE request_limits SET expires_at = NOW() - INTERVAL '1 minute' WHERE key = $1",
    [
      createHmac('sha256', 'test-only-application-secret-with-32-chars')
        .update(`login:${me.id}`)
        .digest('hex'),
    ],
  );
  const login = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(login.status, 200);
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM request_limits WHERE key = $1', [
        createHmac('sha256', 'test-only-application-secret-with-32-chars')
          .update(`login:${me.id}`)
          .digest('hex'),
      ])
    ).rows[0].n,
    0,
    'success clears the counter',
  );
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('password change signs out other devices; sign out everywhere revokes all sessions', async () => {
  const me = await signUp('changer');
  const phone = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal((await request('/account', { cookie: phone.cookie })).data.activeSessions, 2);
  assert.equal(
    (
      await post(
        '/account/password',
        { currentPassword: 'not-it-at-all-really', newPassword: 'Another-fine-passphrase-2026' },
        me.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await post(
        '/account/password',
        { currentPassword: me.password, newPassword: BREACHED },
        me.cookie,
      )
    ).status,
    400,
  );
  const changed = await post(
    '/account/password',
    { currentPassword: me.password, newPassword: 'Another-fine-passphrase-2026' },
    me.cookie,
  );
  assert.equal(changed.status, 200);
  assert.match(lastEmail(me.email).subject, /password was changed/);
  assert.equal(
    (await request('/me', { cookie: me.cookie })).status,
    200,
    'the device that changed it stays signed in',
  );
  assert.equal(
    (await request('/me', { cookie: phone.cookie })).status,
    401,
    'other devices are signed out',
  );
  assert.equal(
    (await post('/auth/login', { identifier: me.username, password: me.password })).status,
    401,
  );
  const again = await post('/auth/login', {
    identifier: me.username,
    password: 'Another-fine-passphrase-2026',
  });
  assert.equal(again.status, 200);
  assert.equal((await post('/auth/logout-all', {}, again.cookie)).status, 200);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
  assert.equal((await request('/me', { cookie: again.cookie })).status, 401);
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('forgotten passwords are reset through a single-use emailed link', async () => {
  const me = await signUp('forgetful');
  const unknown = await post('/auth/forgot-password', { email: `nobody_${unique}@example.com` });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.devLink, undefined);
  const known = await post('/auth/forgot-password', { email: me.email });
  assert.equal(known.status, 200);
  const token = linkToken(lastEmail(me.email).text);
  assert.equal(linkToken(known.data.devLink), token);
  assert.equal(
    (await post('/auth/reset-password', { token, password: BREACHED })).status,
    400,
    'rejected before the link is used up',
  );
  assert.equal(
    (
      await post('/auth/reset-password', {
        token: 'x'.repeat(40),
        password: 'Brand-new-passphrase-2026',
      })
    ).status,
    400,
  );
  const reset = await post('/auth/reset-password', {
    token,
    password: 'Brand-new-passphrase-2026',
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.cookie, 'usf_session=', 'reset clears the cookie instead of signing in');
  assert.equal(reset.data.signInRequired, true);
  assert.equal((await request('/me', { cookie: reset.cookie })).status, 401);
  assert.equal(
    (await post('/auth/reset-password', { token, password: 'Brand-new-passphrase-2026' })).status,
    400,
    'single use',
  );
  assert.equal(
    (await request('/me', { cookie: me.cookie })).status,
    401,
    'earlier sessions are revoked',
  );
  assert.equal(
    (await post('/auth/login', { identifier: me.email, password: me.password })).status,
    401,
  );
  assert.equal(
    (await post('/auth/login', { identifier: me.email, password: 'Brand-new-passphrase-2026' }))
      .status,
    200,
  );
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('two-factor authentication: setup, sign-in challenge, replay protection, recovery codes, disable', async () => {
  const me = await signUp('twofactor');
  assert.equal(
    (await post('/account/totp/enable', { code: '123456' }, me.cookie)).status,
    400,
    'setup first',
  );
  const setup = await post('/account/totp/setup', { password: me.password }, me.cookie);
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\//);
  assert.match(setup.data.qr, /^data:image\/png;base64,/);
  const secret = setup.data.secret;
  assert.equal((await post('/account/totp/enable', { code: '000000' }, me.cookie)).status, 400);
  const enabled = await post(
    '/account/totp/enable',
    { code: totpCode(secret, timeStep()) },
    me.cookie,
  );
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.recoveryCodes.length, 8);
  const storedSecret = (await db.query('SELECT totp_secret FROM users WHERE id = $1', [me.id]))
    .rows[0].totp_secret;
  assert.ok(storedSecret && !storedSecret.includes(secret), 'the secret is encrypted at rest');
  assert.equal((await request('/me', { cookie: me.cookie })).data.user.twoFactorEnabled, true);

  const challenge = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.data.mfaRequired, true);
  assert.equal(challenge.cookie, undefined, 'no session until the code is accepted');
  assert.equal(
    (await post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code: '000000' })).status,
    401,
  );
  const step = timeStep() + 1; // a code the enable step has not consumed yet
  const code = totpCode(secret, step);
  const passed = await post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code });
  assert.equal(passed.status, 200);
  assert.ok(passed.cookie);
  assert.equal(
    (await post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code })).status,
    401,
    'challenge tokens are single-use',
  );
  const replay = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(
    (await post('/auth/mfa', { mfaToken: replay.data.mfaToken, code })).status,
    401,
    'a used code cannot be replayed',
  );
  const recovery = await post('/auth/mfa', {
    mfaToken: replay.data.mfaToken,
    code: enabled.data.recoveryCodes[0],
  });
  assert.equal(recovery.status, 200);
  assert.equal((await request('/account', { cookie: recovery.cookie })).data.recoveryCodesLeft, 7);
  const reuse = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(
    (
      await post('/auth/mfa', {
        mfaToken: reuse.data.mfaToken,
        code: enabled.data.recoveryCodes[0],
      })
    ).status,
    401,
    'recovery codes are single-use',
  );
  assert.equal(
    (await post('/account/totp/disable', { password: 'wrong-password-value' }, me.cookie)).status,
    401,
  );
  assert.equal(
    (
      await post(
        '/account/totp/disable',
        { password: me.password, code: enabled.data.recoveryCodes[1] },
        me.cookie,
      )
    ).status,
    200,
  );
  assert.ok(
    (await post('/auth/login', { identifier: me.username, password: me.password })).cookie,
    'plain sign-in again',
  );
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});

test('account deletion needs the password and removes every record', async () => {
  const me = await signUp('leaving');
  await request('/profile', { method: 'PUT', cookie: me.cookie, body: profile });
  await post('/entries', { kind: 'water', date: localDate(), amount: 250 }, me.cookie);
  assert.equal(
    (
      await request('/account', {
        method: 'DELETE',
        cookie: me.cookie,
        body: { confirm: 'DELETE', password: 'wrong' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/account', {
        method: 'DELETE',
        cookie: me.cookie,
        body: { confirm: 'nope', password: me.password },
      })
    ).status,
    400,
  );
  const gone = await request('/account', {
    method: 'DELETE',
    cookie: me.cookie,
    body: { confirm: 'DELETE', password: me.password },
  });
  assert.equal(gone.status, 200);
  assert.match(lastEmail(me.email).subject, /sad to see you go/);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
  for (const table of ['users', 'profiles', 'entries', 'sessions'])
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = $1`,
          [me.id],
        )
      ).rows[0].n,
      0,
      table,
    );
});

test('maintenance drops unconfirmed sign-ups, expired tokens, and stale lockouts', async () => {
  const stale = await post('/auth/register', {
    ...account,
    username: `stale_${unique}`,
    email: `stale_${unique}@example.com`,
  });
  assert.equal(stale.status, 201);
  await db.query("UPDATE users SET created_at = NOW() - INTERVAL '3 days' WHERE username = $1", [
    `stale_${unique}`,
  ]);
  await db.query(
    "UPDATE email_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE user_id = (SELECT id FROM users WHERE username = $1)",
    [`stale_${unique}`],
  );
  const fresh = await post('/auth/register', {
    ...account,
    username: `fresh_${unique}`,
    email: `fresh_${unique}@example.com`,
  });
  assert.equal(fresh.status, 201);
  await cleanup(db);
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM users WHERE username = $1', [
        `stale_${unique}`,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM users WHERE username = $1', [
        `fresh_${unique}`,
      ])
    ).rows[0].n,
    1,
    'recent sign-ups are kept',
  );
  await db.query('DELETE FROM users WHERE username = $1', [`fresh_${unique}`]);
});

test('production mode uses __Host- cookies and sends strict security headers', async () => {
  await db.query('DELETE FROM request_limits');
  const app = createApp(db, {
    origin: 'https://example.test',
    production: true,
    appSecret: 'test-only-application-secret-with-32-chars',
    mailer: { mode: 'console (test)', send: async () => {} },
    isBreached: async () => false,
  });
  const prod = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => prod.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${prod.address().port}/api`;
    const health = await fetch(`${url}/health`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.match(health.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.match(health.headers.get('content-security-policy'), /script-src 'self'/);
    assert.doesNotMatch(health.headers.get('content-security-policy'), /fonts\.googleapis/);
    const registered = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.test',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({
        ...account,
        username: `prod_${unique}`,
        email: `prod_${unique}@example.com`,
      }),
    });
    assert.equal(registered.status, 201);
    const tokenRow = (
      await db.query(
        "SELECT token_hash FROM email_tokens WHERE purpose = 'verify' AND user_id = (SELECT id FROM users WHERE username = $1)",
        [`prod_${unique}`],
      )
    ).rows[0];
    assert.ok(tokenRow, 'verification token stored');
    assert.equal((await registered.json()).devLink, undefined, 'never exposes links in production');
    // Sign the production account in through the database to inspect the cookie it issues.
    await db.query('UPDATE users SET email_verified_at = NOW() WHERE username = $1', [
      `prod_${unique}`,
    ]);
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.test',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ identifier: `prod_${unique}`, password: account.password }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /^__Host-usf_session=/);
    assert.match(login.headers.get('set-cookie'), /Secure/);
  } finally {
    await new Promise((resolve) => prod.close(resolve));
    await db.query('DELETE FROM users WHERE username = $1', [`prod_${unique}`]);
  }
});

test('breach check reads the k-anonymity range format and fails open', async () => {
  const sha1Suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'; // "password"
  const stub = async () => ({
    ok: true,
    text: async () => `00000:1\r\n${sha1Suffix}:3861493\r\nABCDE:0\r\n`,
  });
  const check = createBreachCheck({ enabled: true, fetchImpl: stub });
  assert.equal(await check('password'), true);
  assert.equal(await check('a-genuinely-unique-passphrase-9f2k'), false);
  const broken = createBreachCheck({
    enabled: true,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(await broken('password'), false, 'network trouble never blocks sign-up');
  assert.equal(await createBreachCheck({ enabled: false })('password'), false);
});

test('trust proxy setting is parsed safely', () => {
  assert.equal(parseTrustProxy(undefined, true), 1);
  assert.equal(parseTrustProxy(undefined, false), false);
  assert.equal(parseTrustProxy('2', true), 2);
  assert.equal(parseTrustProxy('false', true), false);
  assert.equal(parseTrustProxy('loopback', true), 'loopback');
});

test('OAuth fails closed when state is forged; unknown API routes return JSON', async () => {
  const result = await request('/auth/google/callback?state=forged&code=invalid');
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), '/login?error=oauth_failed');
  assert.equal((await request('/does-not-exist')).status, 404);
});

test('history pagination keeps every record and rejects invalid offsets', async () => {
  const me = await signUp('history');
  try {
    const ids = Array.from({ length: 503 }, () => randomUUID());
    // Insert a realistic long history without making 503 rate-limited HTTP requests.
    await db.query(
      `INSERT INTO entries (id, user_id, kind, logged_on, data)
       SELECT unnest($1::uuid[]), $2, 'water', $3, '{"amount":250}'::jsonb`,
      [ids, me.id, localDate()],
    );
    const first = await request('/entries', { cookie: me.cookie });
    assert.equal(first.data.entries.length, 500);
    assert.equal(first.data.nextOffset, 500);
    const second = await request('/entries?offset=500', { cookie: me.cookie });
    assert.equal(second.data.entries.length, 3);
    assert.equal(second.data.nextOffset, null);
    assert.equal(
      new Set([...first.data.entries, ...second.data.entries].map((e) => e.id)).size,
      503,
    );
    assert.equal((await request('/entries?offset=-1', { cookie: me.cookie })).status, 400);
    assert.equal((await request('/entries?offset=nope', { cookie: me.cookie })).status, 400);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [me.id]);
  }
});

async function withMfa(suffix) {
  const me = await signUp(suffix);
  const setup = await post('/account/totp/setup', { password: me.password }, me.cookie);
  assert.equal(setup.status, 200);
  const enabled = await post(
    '/account/totp/enable',
    { code: totpCode(setup.data.secret, timeStep()) },
    me.cookie,
  );
  assert.equal(enabled.status, 200);
  return { ...me, secret: setup.data.secret, codes: enabled.data.recoveryCodes };
}
test('regression F1: password reset preserves MFA and grants no authenticated session', async () => {
  const me = await withMfa('resetmfa');
  const challenge = await post('/auth/login', { identifier: me.username, password: me.password });
  const forgot = await post('/auth/forgot-password', { email: me.email });
  const reset = await post('/auth/reset-password', {
    token: linkToken(forgot.data.devLink),
    password: 'New-password-with-two-factors-2026',
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.signInRequired, true);
  assert.equal((await request('/me', { cookie: reset.cookie })).status, 401);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
  assert.equal(
    (await post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code: me.codes[0] })).status,
    401,
  );
  const login = await post('/auth/login', {
    identifier: me.username,
    password: 'New-password-with-two-factors-2026',
  });
  assert.equal(login.data.mfaRequired, true);
  assert.equal(login.cookie, undefined);
  assert.equal(
    (await post('/auth/mfa', { mfaToken: login.data.mfaToken, code: me.codes[0] })).status,
    200,
  );
});
test('regression F2: a cookie cannot replace or disable MFA or regenerate recovery codes', async () => {
  const me = await withMfa('factorproof');
  assert.equal((await post('/account/totp/setup', {}, me.cookie)).status, 400);
  assert.equal(
    (await post('/account/totp/setup', { password: me.password }, me.cookie)).status,
    401,
  );
  assert.equal(
    (await post('/account/totp/disable', { password: me.password }, me.cookie)).status,
    401,
  );
  assert.equal(
    (await post('/account/totp/recovery-codes', { password: me.password }, me.cookie)).status,
    401,
  );
  assert.equal(
    (
      await post(
        '/account/password',
        { currentPassword: me.password, newPassword: 'Another-strong-password-2026' },
        me.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/account', {
        method: 'DELETE',
        cookie: me.cookie,
        body: { confirm: 'DELETE', password: me.password },
      })
    ).status,
    401,
  );
  const replacement = await post(
    '/account/totp/setup',
    { password: me.password, code: me.codes[0] },
    me.cookie,
  );
  assert.equal(replacement.status, 200);
  const enabled = await post(
    '/account/totp/enable',
    { code: totpCode(replacement.data.secret, timeStep()) },
    me.cookie,
  );
  assert.equal(enabled.status, 200);
  const attempt = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(
    (await post('/auth/mfa', { mfaToken: attempt.data.mfaToken, code: me.codes[1] })).status,
    401,
    'old recovery codes were removed',
  );
  assert.equal(
    (
      await post('/auth/mfa', {
        mfaToken: attempt.data.mfaToken,
        code: enabled.data.recoveryCodes[0],
      })
    ).status,
    200,
  );
});
test('MFA setup expires, is bound to its initiating session, and revokes other sessions on enable', async () => {
  const me = await signUp('setupbinding');
  const phone = await post('/auth/login', { identifier: me.username, password: me.password });
  let setup = await post('/account/totp/setup', { password: me.password }, me.cookie);
  assert.equal(
    (
      await post(
        '/account/totp/enable',
        { code: totpCode(setup.data.secret, timeStep()) },
        phone.cookie,
      )
    ).status,
    400,
  );
  await db.query("UPDATE users SET totp_pending_until=NOW()-INTERVAL '1 minute' WHERE id=$1", [
    me.id,
  ]);
  assert.equal(
    (
      await post(
        '/account/totp/enable',
        { code: totpCode(setup.data.secret, timeStep()) },
        me.cookie,
      )
    ).status,
    400,
  );
  setup = await post('/account/totp/setup', { password: me.password }, me.cookie);
  assert.equal(
    (
      await post(
        '/account/totp/enable',
        { code: totpCode(setup.data.secret, timeStep()) },
        me.cookie,
      )
    ).status,
    200,
  );
  assert.equal((await request('/me', { cookie: phone.cookie })).status, 401);
});
test('regression F4: password change invalidates an outstanding reset link', async () => {
  const me = await signUp('stalereset');
  const forgot = await post('/auth/forgot-password', { email: me.email });
  assert.equal(
    (
      await post(
        '/account/password',
        { currentPassword: me.password, newPassword: 'Changed-password-before-link-2026' },
        me.cookie,
      )
    ).status,
    200,
  );
  const stale = await post('/auth/reset-password', {
    token: linkToken(forgot.data.devLink),
    password: 'Unwanted-password-through-link-2026',
  });
  assert.equal(stale.status, 400);
});
test('regression F4: sign out everywhere cancels pending MFA challenges and pending setup', async () => {
  const me = await withMfa('logoutpending');
  const challenge = await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal((await post('/auth/logout-all', {}, me.cookie)).status, 200);
  assert.equal(
    (await post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code: me.codes[0] })).status,
    401,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [me.id])).rows[0].n,
    0,
  );
});
test('concurrent submissions of the same MFA challenge can create only one session', async () => {
  const me = await withMfa('mfaconcurrency');
  const challenge = await post('/auth/login', { identifier: me.username, password: me.password });
  const results = await Promise.all(
    [0, 1].map(() => post('/auth/mfa', { mfaToken: challenge.data.mfaToken, code: me.codes[0] })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  assert.equal(results.filter((r) => r.cookie).length, 1);
});
test('regression F5: provider-only accounts are deleted through an emailed link that works on any device', async () => {
  const me = await signUp('socialdelete');
  await db.query('UPDATE users SET password_hash=NULL WHERE id=$1', [me.id]);
  const remove = () =>
    request('/account', { method: 'DELETE', cookie: me.cookie, body: { confirm: 'DELETE' } });
  // Without a password there is nothing to type, so the session alone can never delete.
  assert.equal((await remove()).status, 403);
  await db.query(
    "UPDATE sessions SET reauthenticated_at=NOW()-INTERVAL '6 minutes' WHERE user_id=$1",
    [me.id],
  );
  assert.equal((await remove()).status, 403);
  assert.equal(
    (await post('/account/deletion-confirmation', {})).status,
    401,
    'only a signed-in account can ask for the link',
  );
  const sent = await post('/account/deletion-confirmation', {}, me.cookie);
  assert.equal(sent.status, 200);
  assert.equal(sent.data.email, me.email);
  const mail = lastEmail(me.email);
  assert.match(mail.subject, /Delete your U Stay Fit account/);
  assert.match(mail.text, /any phone or computer/);
  const token = linkToken(mail.text);
  assert.equal(new URL(sent.data.devLink).pathname, '/delete-account');
  assert.equal(linkToken(sent.data.devLink), token, 'dev link matches the emailed link');
  // Opened with no session at all (a phone's mail app, another browser): it still works,
  // but only with DELETE typed, only with the real token, and only once.
  assert.equal((await post('/account/delete-by-email', { token })).status, 400);
  assert.equal((await post('/account/delete-by-email', { token, confirm: 'delete' })).status, 400);
  assert.equal(
    (
      await post('/account/delete-by-email', {
        token: 'not-a-real-token-value-here',
        confirm: 'DELETE',
      })
    ).status,
    400,
  );
  const other = await signUp('bystander');
  const done = await post('/account/delete-by-email', { token, confirm: 'DELETE' }, other.cookie);
  assert.equal(done.status, 200);
  assert.equal(
    done.headers.get('set-cookie'),
    null,
    'a different signed-in account stays signed in',
  );
  assert.equal((await request('/me', { cookie: other.cookie })).status, 200);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
  assert.match(lastEmail(me.email).subject, /sad to see you go/);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM users WHERE id=$1', [me.id])).rows[0].n,
    0,
  );
  assert.equal(
    (await post('/account/delete-by-email', { token, confirm: 'DELETE' })).status,
    400,
    'the link is single-use',
  );
});
test('a deletion link expires, dies with a credential change, and never covers password accounts', async () => {
  const me = await signUp('linkexpiry');
  await db.query('UPDATE users SET password_hash=NULL WHERE id=$1', [me.id]);
  const token = linkToken(
    (await post('/account/deletion-confirmation', {}, me.cookie)).data.devLink,
  );
  await db.query("UPDATE email_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1", [
    me.id,
  ]);
  assert.equal((await post('/account/delete-by-email', { token, confirm: 'DELETE' })).status, 400);
  const fresh = linkToken(
    (await post('/account/deletion-confirmation', {}, me.cookie)).data.devLink,
  );
  // "Sign out everywhere" (any credential change) cancels outstanding links.
  await post('/auth/logout-all', {}, me.cookie);
  assert.equal(
    (await post('/account/delete-by-email', { token: fresh, confirm: 'DELETE' })).status,
    400,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM users WHERE id=$1', [me.id])).rows[0].n,
    1,
  );
  // Password accounts confirm with their password instead and are never sent a link.
  const withPassword = await signUp('haspassword');
  assert.equal((await post('/account/deletion-confirmation', {}, withPassword.cookie)).status, 400);
  await db.query('DELETE FROM users WHERE id = ANY($1)', [[me.id, withPassword.id]]);
});
test('a provider-only account with a fresh provider re-authentication can still delete directly', async () => {
  const me = await signUp('reauthdelete');
  await db.query('UPDATE users SET password_hash=NULL WHERE id=$1', [me.id]);
  // What the Google "?reauth=ok" callback records for this session.
  await db.query('UPDATE sessions SET reauthenticated_at=NOW() WHERE user_id=$1', [me.id]);
  const gone = await request('/account', {
    method: 'DELETE',
    cookie: me.cookie,
    body: { confirm: 'DELETE' },
  });
  assert.equal(gone.status, 200);
  assert.equal((await request('/me', { cookie: me.cookie })).status, 401);
});
test('the welcome email greets by name only when the name looks like a name', async () => {
  const { messages } = await import('../server/email.js');
  assert.equal(
    messages.welcome('Neeraj Yadav', 'x').subject,
    'Welcome to U Stay Fit, Neeraj Yadav!',
  );
  for (const name of ['Claim your prize at evil.example', 'Visit http://x.y', 'Bob 123', ''])
    assert.equal(messages.welcome(name, 'x').subject, 'Welcome to U Stay Fit!', name);
  assert.match(messages.welcome('Line\nBreak', 'x').text, /^Hey, Line Break!!!/);
});
test('the goodbye email greets by name, confirms the deletion, and invites people back', async () => {
  const { messages } = await import('../server/email.js');
  const goodbye = messages.accountDeleted('Neeraj Yadav', 'https://ustay-fit.com/');
  assert.equal(goodbye.subject, "We're sad to see you go, Neeraj Yadav!");
  assert.match(goodbye.text, /^Dear Neeraj Yadav,\n\nWe are so sad to see you go!!/);
  assert.match(goodbye.text, /permanently deleted/);
  assert.match(goodbye.text, /whenever you are ready to start your health journey again/i);
  assert.match(goodbye.text, /https:\/\/ustay-fit\.com\//);
  assert.match(goodbye.text, /ustayfit0916@gmail\.com/);
  const odd = messages.accountDeleted('Visit http://x.y', 'x');
  assert.equal(odd.subject, "We're sad to see you go!");
  assert.match(odd.text, /^Dear friend,/);
});
test('a confirmed sign-up gets one warm welcome email by name', async () => {
  const me = await signUp('welcomed');
  const welcomes = outbox.filter(
    (m) => m.to === me.email && /^Welcome to U Stay Fit/.test(m.subject),
  );
  assert.equal(welcomes.length, 1);
  assert.equal(welcomes[0].subject, `Welcome to U Stay Fit, ${me.name}!`);
  assert.match(welcomes[0].text, new RegExp(`^Hey, ${me.name}!!!`));
  assert.match(welcomes[0].text, /glad you trusted us to be a part of your health journey/);
  assert.match(welcomes[0].text, /\/dashboard/);
  // Signing in again later does not send another one.
  await post('/auth/login', { identifier: me.username, password: me.password });
  assert.equal(
    outbox.filter((m) => m.to === me.email && /^Welcome to U Stay Fit/.test(m.subject)).length,
    1,
  );
  await db.query('DELETE FROM users WHERE id = $1', [me.id]);
});
test('the security log contains event types and pseudonymous subjects, without credentials or health records', async () => {
  const events = (await db.query('SELECT * FROM security_events')).rows;
  assert.ok(events.some((row) => row.event === 'password_reset'));
  assert.ok(events.some((row) => row.event === 'mfa_enabled'));
  assert.ok(
    events.every((row) => row.subject_hash === null || /^[a-f0-9]{64}$/.test(row.subject_hash)),
  );
  assert.doesNotMatch(JSON.stringify(events), /@example.com|passphrase|mfaToken/);
});

test('provider callbacks bind state to the browser, are single-use, and never merge by email', async () => {
  const providerMail = [];
  const welcomes = () =>
    providerMail.filter((m) => m.to === identity.email && /^Welcome to U Stay Fit/.test(m.subject));
  let identity = {
    subject: `provider_${unique}`,
    email: `provider_${unique}@example.com`,
    name: 'Provider Test',
  };
  const providerApp = createApp(db, {
    origin,
    production: false,
    rateLimitMax: 1000,
    apiLimit: 5000,
    appSecret: 'provider-routing-test-secret-with-32-characters',
    mailer: { mode: 'console (test)', send: async (message) => void providerMail.push(message) },
    isBreached: async () => false,
    oauthClient: {
      configured: () => true,
      authorization: (provider, args) => `https://provider.example/authorize?state=${args.state}`,
      exchange: async () => identity,
    },
  });
  const running = providerApp.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    running.once('listening', resolve);
    running.once('error', reject);
  });
  const root = `http://127.0.0.1:${running.address().port}`;
  const get = (path, cookie) =>
    fetch(root + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
  async function start() {
    const r = await get('/api/auth/google');
    return {
      state: new URL(r.headers.get('location')).searchParams.get('state'),
      cookie: r.headers.get('set-cookie').split(';')[0],
    };
  }
  try {
    const first = await start();
    assert.equal(
      (await get(`/api/auth/google/callback?state=${first.state}&code=test`)).headers.get(
        'location',
      ),
      '/login?error=oauth_failed',
    );
    const success = await get(
      `/api/auth/google/callback?state=${first.state}&code=test`,
      first.cookie,
    );
    assert.equal(success.headers.get('location'), '/onboarding');
    const session = success.headers
      .getSetCookie()
      .find((c) => c.startsWith('usf_session='))
      .split(';')[0];
    assert.equal((await (await get('/api/me', session)).json()).user.hasPassword, false);
    // The first Google sign-in creates the account, so it is welcomed by name, once.
    assert.equal(welcomes().length, 1);
    assert.match(welcomes()[0].text, /^Hey, Provider Test!!!/);
    const returning = await start();
    assert.equal(
      (
        await get(`/api/auth/google/callback?state=${returning.state}&code=test`, returning.cookie)
      ).headers.get('location'),
      '/onboarding',
    );
    assert.equal(welcomes().length, 1, 'signing in again sends no second welcome');
    assert.equal(
      (
        await get(`/api/auth/google/callback?state=${first.state}&code=test`, first.cookie)
      ).headers.get('location'),
      '/login?error=oauth_failed',
    );
    identity = { ...identity, subject: `different_${unique}` };
    const collision = await start();
    assert.equal(
      (
        await get(`/api/auth/google/callback?state=${collision.state}&code=test`, collision.cookie)
      ).headers.get('location'),
      '/login?error=use_original_login',
    );
    assert.equal(
      (await db.query('SELECT count(*)::int AS n FROM users WHERE email=$1', [identity.email]))
        .rows[0].n,
      1,
    );
    identity = { ...identity, email: null };
    const noEmail = await start();
    assert.equal(
      (
        await get(`/api/auth/google/callback?state=${noEmail.state}&code=test`, noEmail.cookie)
      ).headers.get('location'),
      '/login?error=provider_email_required',
    );
    assert.equal(
      (await get('/api/auth/facebook?intent=reauth', session)).headers.get('location'),
      '/account?error=email_confirmation_required',
    );
  } finally {
    await new Promise((resolve) => running.close(resolve));
  }
});
