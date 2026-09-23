import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { hashPassword, verifyPassword, needsPasswordUpgrade } from '../server/security.js';
import { databaseConfig } from '../server/config.js';
import { createOAuthClient } from '../server/oauth.js';
import { createDatabase } from '../server/db.js';
import { createAuthState } from '../server/auth-state.js';
import { createMailQueue } from '../server/mail-queue.js';
import { decryptSecret } from '../server/totp.js';

test('F6: new password hashes record OWASP scrypt parameters and legacy hashes still verify', async () => {
  const password = 'A-password-for-upgrading-cost-2026';
  const current = await hashPassword(password);
  assert.match(current, /^scrypt:v2:32768:8:3:/);
  assert.equal(await verifyPassword(password, current), true);
  assert.equal(await verifyPassword('wrong', current), false);
  const salt = '1234567890abcdef1234567890abcdef';
  const old = `scrypt:${salt}:${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 67108864 }).toString('hex')}`;
  assert.equal(await verifyPassword(password, old), true);
  assert.equal(needsPasswordUpgrade(old), true);
  assert.equal(needsPasswordUpgrade(current), false);
  assert.equal(await verifyPassword(password, 'scrypt:invalid:broken'), false);
});
test('F7: URL SSL settings cannot downgrade explicitly configured certificate verification', () => {
  for (const param of [
    'sslmode=no-verify',
    'sslmode=disable',
    'ssl=true',
    'sslrootcert=bad.pem',
    'sslcert=x',
  ]) {
    assert.throws(
      () =>
        databaseConfig(`postgres://app@db/planner?${param}`, {
          env: { DATABASE_SSL: 'true' },
          production: true,
        }),
      /Remove SSL/,
    );
  }
  assert.throws(
    () =>
      databaseConfig('postgres://app@db/planner', {
        env: { DATABASE_SSL: 'false' },
        production: true,
      }),
    /verified TLS/,
  );
  const tls = databaseConfig('postgres://app@db/planner', {
    env: { DATABASE_SSL: 'true' },
    production: true,
  });
  assert.deepEqual(tls.ssl, { rejectUnauthorized: true });
  assert.equal(
    databaseConfig('postgres://app@db/planner', {
      env: { DATABASE_SSL: 'false', DATABASE_ALLOW_INSECURE_PRIVATE: 'true' },
      production: true,
    }).ssl,
    false,
  );
});
test('DATABASE_PASSWORD_FILE is the password pg sends, even though the URL carries none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usf-db-secret-'));
  const file = join(dir, 'db_app_password');
  writeFileSync(file, 'mounted-secret\n', { mode: 0o600 });
  try {
    const config = databaseConfig('postgres://usf_app@db:5432/u_stay_fit', {
      env: {
        DATABASE_SSL: 'false',
        DATABASE_ALLOW_INSECURE_PRIVATE: 'true',
        DATABASE_PASSWORD_FILE: file,
      },
      production: true,
    });
    assert.equal(config.password, 'mounted-secret');
    assert.equal(config.connectionString, undefined);
    // The regression: pg re-parsed the URL over the explicit field, so a URL without a
    // password left the client with none and the first deployment failed to connect.
    const client = new pg.Client(config);
    assert.equal(client.connectionParameters.password, 'mounted-secret');
    assert.equal(client.connectionParameters.user, 'usf_app');
    assert.equal(client.connectionParameters.host, 'db');
    assert.equal(client.connectionParameters.port, 5432);
    assert.equal(client.connectionParameters.database, 'u_stay_fit');
    assert.equal(client.connectionParameters.ssl, false);
    // Local setups keep an inline URL password; both at once are still refused.
    const inline = databaseConfig('postgres://app:inline@db/planner', {
      env: { DATABASE_SSL: 'false' },
      production: false,
    });
    assert.equal(new pg.Client(inline).connectionParameters.password, 'inline');
    assert.throws(
      () =>
        databaseConfig('postgres://app:inline@db/planner', {
          env: { DATABASE_SSL: 'false', DATABASE_PASSWORD_FILE: file },
          production: false,
        }),
      /both a URL password/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const env = {
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  FACEBOOK_CLIENT_ID: 'fb-client',
  FACEBOOK_CLIENT_SECRET: 'fb-secret',
};
test('Google ID tokens require a valid signature, issuer, audience, expiry and nonce; reauth requires fresh auth_time', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test';
  const keys = createLocalJWKSet({ keys: [jwk] });
  let idToken;
  const oauth = createOAuthClient({
    origin: 'https://app.example',
    env,
    keys,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ access_token: 'access', id_token: idToken }),
    }),
  });
  async function sign(overrides = {}) {
    idToken = await new SignJWT({
      sub: '123',
      nonce: 'nonce',
      email: 'person@example.com',
      email_verified: true,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuedAt()
      .setIssuer(overrides.iss || 'https://accounts.google.com')
      .setAudience(overrides.aud || 'test-client')
      .setExpirationTime(overrides.exp || '5m')
      .sign(privateKey);
  }
  const attempt = { nonce: 'nonce', verifier: 'verifier', created_at: new Date() };
  await sign();
  assert.equal((await oauth.exchange('google', 'code', attempt)).subject, '123');
  for (const bad of [
    { nonce: 'wrong' },
    { iss: 'https://evil.example' },
    { aud: 'other-client' },
    { exp: 1 },
    { email_verified: false },
    { azp: 'other-client' },
  ]) {
    await sign(bad);
    await assert.rejects(() => oauth.exchange('google', 'code', attempt));
  }
  await sign();
  await assert.rejects(
    () => oauth.exchange('google', 'code', { ...attempt, user_id: 'bound-user' }),
    /Fresh provider/,
  );
  await sign({ auth_time: Math.floor(Date.now() / 1000) - 600 });
  await assert.rejects(() =>
    oauth.exchange('google', 'code', { ...attempt, user_id: 'bound-user' }),
  );
  await sign({ auth_time: Math.floor(Date.now() / 1000) });
  assert.equal(
    (await oauth.exchange('google', 'code', { ...attempt, user_id: 'bound-user' })).subject,
    '123',
  );
  const other = await generateKeyPair('RS256');
  idToken = await new SignJWT({
    sub: '123',
    nonce: 'nonce',
    email: 'person@example.com',
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuedAt()
    .setIssuer('https://accounts.google.com')
    .setAudience('test-client')
    .setExpirationTime('5m')
    .sign(other.privateKey);
  await assert.rejects(
    () => oauth.exchange('google', 'code', attempt),
    /signature verification failed/,
  );
  const url = new URL(
    oauth.authorization('google', {
      state: 'state',
      nonce: 'nonce',
      verifier: 'verifier',
      reauth: true,
    }),
  );
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('nonce'), 'nonce');
  assert.equal(url.searchParams.get('max_age'), '0');
  const facebook = new URL(oauth.authorization('facebook', { state: 'state', reauth: true }));
  assert.equal(facebook.searchParams.get('auth_type'), 'reauthenticate');
});
test('database-backed rate limits and email cooldowns are shared; outbox payloads are encrypted', async () => {
  const db = await createDatabase({ url: '', path: 'memory://' });
  try {
    const secret = 'only-a-test-key-with-at-least-32-characters',
      state = createAuthState(db, secret),
      second = createAuthState(db, secret);
    assert.equal((await state.limit(db, 'account:test', 1, 60000)).allowed, true);
    assert.equal((await second.limit(db, 'account:test', 1, 60000)).allowed, false);
    const sent = [];
    const mail = createMailQueue(db, {
      secret,
      state,
      production: true,
      mailer: { send: async (m) => sent.push(m) },
    });
    assert.equal(await mail.allowed(db, 'recipient@example.com'), true);
    assert.equal(await mail.allowed(db, 'recipient@example.com'), false);
    await mail.queue(db, {
      to: 'recipient@example.com',
      subject: 'Verify',
      text: 'Secret token: 12345',
    });
    await mail.finish();
    assert.equal(sent.length, 0, 'HTTP request never waits on production mail delivery');
    const row = (await db.query('SELECT payload FROM email_jobs')).rows[0];
    assert.doesNotMatch(row.payload, /recipient|12345/);
    assert.match(decryptSecret(row.payload, secret), /12345/);
    await mail.flush();
    assert.equal(sent.length, 1);
    assert.equal((await db.query('SELECT * FROM email_jobs')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('upgrading an existing database revokes legacy credentials while preserving accounts and records', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const temp = await mkdtemp(join(tmpdir(), 'usf-migration-test-'));
  let old, upgraded;
  try {
    old = new PGlite(join(temp, 'db'));
    await old.waitReady;
    await old.exec(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
    await old.exec(
      await readFile(
        new URL('../server/migrations/002-account-security.sql', import.meta.url),
        'utf8',
      ),
    );
    await old.exec(
      "CREATE TABLE schema_migrations(id integer primary key,name text not null,applied_at timestamptz default NOW()); INSERT INTO schema_migrations(id,name) VALUES(2,'002-account-security.sql')",
    );
    const id = '00000000-0000-4000-8000-000000000002';
    await old.query(
      "INSERT INTO users(id,name,username,email_verified_at) VALUES($1,'Upgrade Test','upgrade_test',NOW())",
      [id],
    );
    await old.query('INSERT INTO profiles(user_id,data) VALUES($1,\'{"testRecord":true}\')', [id]);
    await old.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('old-session',$1,NOW()+INTERVAL '1 day')",
      [id],
    );
    await old.query(
      "INSERT INTO email_tokens(token_hash,user_id,purpose,expires_at) VALUES('old-reset',$1,'reset',NOW()+INTERVAL '1 hour')",
      [id],
    );
    await old.close();
    old = null;
    upgraded = await createDatabase({ url: '', path: join(temp, 'db') });
    assert.equal((await upgraded.query('SELECT * FROM sessions')).rows.length, 0);
    assert.equal((await upgraded.query('SELECT * FROM email_tokens')).rows.length, 0);
    assert.equal(
      (await upgraded.query('SELECT auth_version FROM users WHERE id=$1', [id])).rows[0]
        .auth_version,
      1,
    );
    assert.equal(
      (await upgraded.query('SELECT data FROM profiles WHERE user_id=$1', [id])).rows[0].data
        .testRecord,
      true,
    );
  } finally {
    if (old) await old.close();
    if (upgraded) await upgraded.close();
    await rm(temp, { recursive: true, force: true });
  }
});
