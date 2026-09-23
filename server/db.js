import 'dotenv/config';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { databaseConfig } from './config.js';

// schema.sql creates the original tables (idempotent). Later changes live in
// server/migrations/NNN-name.sql and are applied exactly once, in order, and recorded
// in schema_migrations so an existing database is upgraded instead of recreated.
const migrationsDir = new URL('./migrations/', import.meta.url);
const migrationFiles = async () =>
  (await readdir(migrationsDir)).filter((f) => /^\d{3}-[\w-]+\.sql$/.test(f)).sort();
// The newest migration number; production startup refuses to run against an older schema.
export const latestMigration = async () => Number((await migrationFiles()).at(-1).slice(0, 3));
async function migrate(db) {
  await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
  );
  const dir = migrationsDir;
  const files = await migrationFiles();
  const applied = new Set(
    (await db.query('SELECT id FROM schema_migrations')).rows.map((r) => Number(r.id)),
  );
  for (const file of files) {
    const id = Number(file.slice(0, 3));
    if (applied.has(id)) continue;
    const sql = await readFile(new URL(file, dir), 'utf8');
    await db.transaction(async (tx) => {
      // Only one server process applies a migration when several start together.
      await tx.query('SELECT pg_advisory_xact_lock(727)');
      const again = await tx.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
      if (again.rows.length) return;
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(id, name) VALUES ($1, $2)', [id, file]);
    });
  }
}

export async function createDatabase({
  url = process.env.DATABASE_URL,
  runMigrations = process.env.NODE_ENV !== 'production',
  verifyRuntimeRole = process.env.NODE_ENV === 'production' && !runMigrations,
  path = process.env.LOCAL_DATABASE_PATH || '.data/u-stay-fit',
} = {}) {
  if (!url && process.env.NODE_ENV === 'production')
    throw new Error('Production requires DATABASE_URL. Embedded development storage is disabled.');
  let db;
  if (url) {
    const pool = new pg.Pool(databaseConfig(url));
    db = {
      mode: 'PostgreSQL',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      transaction: async (fn) => {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await fn({
            query: (sql, params) => connection.query(sql, params),
            exec: (sql) => connection.query(sql),
          });
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK');
          throw error;
        } finally {
          connection.release();
        }
      },
    };
  } else {
    if (path !== 'memory://') await mkdir(path, { recursive: true });
    const embedded = new PGlite(path === 'memory://' ? undefined : path);
    await embedded.waitReady;
    db = {
      mode: 'PGlite (local development)',
      query: (sql, params) => embedded.query(sql, params),
      exec: (sql) => embedded.exec(sql),
      close: () => embedded.close(),
      transaction: (fn) =>
        embedded.transaction((tx) =>
          fn({
            query: (sql, params) => tx.query(sql, params),
            exec: (sql) => tx.exec(sql),
          }),
        ),
    };
  }
  try {
    if (runMigrations) await migrate(db);
    else {
      const version = (await db.query('SELECT max(id) AS id FROM schema_migrations')).rows[0]?.id;
      if (Number(version) !== (await latestMigration()))
        throw new Error('Run the deployment migration job before starting the application.');
    }
    if (verifyRuntimeRole) {
      const unsafe = await db.query(`SELECT 1 FROM pg_roles r WHERE r.rolname=current_user AND
        (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR
         EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(current_user,d.datdba,'MEMBER')) OR
         EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER')) OR
         has_schema_privilege(current_user,'public','CREATE'))`);
      if (unsafe.rows.length)
        throw new Error(
          'The website database role must not own objects or have administrative/CREATE privileges. Use the restricted runtime role.',
        );
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
