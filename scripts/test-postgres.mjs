// A real PostgreSQL 17 process, temporary directory, random credentials, loopback only.
// No Docker, system accounts, real application database, or administrator privileges needed.
import { mkdtemp, readFile, symlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';
process.umask(0o077);
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.DATABASE_SSL = 'false';
process.env.NODE_ENV = 'development';
// npm installations with disabled scripts need these library aliases. Validate both ends
// against this package directory; do not execute downloaded lifecycle scripts.
const platformPackage = `@embedded-postgres/${process.platform}-${process.arch}`;
const binaryRoot = resolve(dirname(fileURLToPath(import.meta.resolve(platformPackage))), '..');
const aliases = JSON.parse(
  await readFile(join(binaryRoot, 'native/pg-symlinks.json'), 'utf8').catch(() => '[]'),
);
for (const { source, target } of aliases) {
  const src = resolve(binaryRoot, source),
    dst = resolve(binaryRoot, target);
  if (!src.startsWith(binaryRoot + '/native/') || !dst.startsWith(binaryRoot + '/native/'))
    throw new Error('Invalid binary alias');
  await symlink(relative(dirname(dst), src), dst).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const temp = await mkdtemp(join(tmpdir(), 'usf-security-pg-'));
const reserve = createServer();
await new Promise((resolve, reject) => {
  reserve.once('error', reject);
  reserve.listen(0, '127.0.0.1', resolve);
});
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const password = randomBytes(24).toString('hex');
const cluster = new EmbeddedPostgres({
  databaseDir: join(temp, 'data'),
  user: 'usf_admin',
  password,
  port,
  persistent: false,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1', '-k', temp],
  onLog: () => {},
  onError: () => {},
});
const url = (role, db = 'u_stay_fit') => `postgres://${role}:${password}@127.0.0.1:${port}/${db}`;
let admin, appDb;
try {
  console.log('Initializing disposable native PostgreSQL 17 cluster…');
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase('u_stay_fit');
  admin = new pg.Client({ connectionString: url('usf_admin') });
  await admin.connect();
  for (const role of ['usf_migrator', 'usf_app', 'usf_reader']) {
    const sql = (
      await admin.query(
        "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',$1::text,$2::text)",
        [role, password],
      )
    ).rows[0].format;
    await admin.query(sql);
  }
  await admin.query(
    'REVOKE ALL ON DATABASE u_stay_fit FROM PUBLIC; GRANT CONNECT ON DATABASE u_stay_fit TO usf_migrator,usf_app,usf_reader; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO usf_migrator',
  );
  const { createDatabase } = await import('../server/db.js');
  const migrator = await createDatabase({ url: url('usf_migrator'), runMigrations: true });
  await migrator.exec(
    'GRANT USAGE ON SCHEMA public TO usf_app,usf_reader; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO usf_app; REVOKE ALL ON schema_migrations FROM usf_app; GRANT SELECT ON schema_migrations TO usf_app; GRANT SELECT ON operator_accounts TO usf_reader',
  );
  await migrator.close();
  await assert.rejects(
    () => createDatabase({ url: url('usf_admin'), runMigrations: false, verifyRuntimeRole: true }),
    /database role/,
  );
  await assert.rejects(
    () =>
      createDatabase({ url: url('usf_migrator'), runMigrations: false, verifyRuntimeRole: true }),
    /database role/,
  );
  appDb = await createDatabase({
    url: url('usf_app'),
    runMigrations: false,
    verifyRuntimeRole: true,
  });
  await assert.rejects(() => appDb.query('CREATE TABLE forbidden(id int)'), /permission denied/);
  await assert.rejects(() => appDb.query('DROP TABLE users'), /must be owner/);
  await assert.rejects(() => appDb.query('DELETE FROM schema_migrations'), /permission denied/);
  const reader = new pg.Client({ connectionString: url('usf_reader') });
  await reader.connect();
  await reader.query('SELECT * FROM operator_accounts');
  await assert.rejects(() => reader.query('SELECT * FROM users'), /permission denied/);
  await assert.rejects(() => reader.query('SELECT * FROM entries'), /permission denied/);
  await reader.end();
  console.log('PostgreSQL 17: restricted runtime/read-only roles and startup guards passed.');
  // Prove locking under contention with two different client connections.
  const a = await admin.query(
    "INSERT INTO users(id,name,username) VALUES('00000000-0000-4000-8000-000000000001','Test','locktest') RETURNING id",
  );
  const first = new pg.Client({ connectionString: url('usf_app') }),
    second = new pg.Client({ connectionString: url('usf_app') });
  await first.connect();
  await second.connect();
  await first.query('BEGIN');
  await first.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [a.rows[0].id]);
  let finished = false;
  const waiter = second
    .query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [a.rows[0].id])
    .then(() => {
      finished = true;
    });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(finished, false);
  await first.query('COMMIT');
  await waiter;
  await first.end();
  await second.end();
  console.log('PostgreSQL 17: a competing connection waits for the user-row lock.');
  const run = (file, args, env) =>
    new Promise((resolve, reject) => {
      const child = spawn(file, args, { stdio: 'inherit', env });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Tests exited ${code}`)),
      );
    });
  // API fixtures manage their own disposable records/schema. Use the restricted role;
  // migrations have already been applied by the separate migrator above.
  await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/api.test.js'], {
    ...process.env,
    TEST_DATABASE_URL: url('usf_app'),
    TEST_SKIP_MIGRATIONS: 'true',
  });
  console.log('Native PostgreSQL API/security tests passed.');
} catch (error) {
  console.error('PostgreSQL test failed:', error.message);
  process.exitCode = 1;
} finally {
  if (appDb) await appDb.close();
  if (admin) await admin.end();
  await cluster.stop().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
