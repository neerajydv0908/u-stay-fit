import { createDatabase } from './db.js';
const db = await createDatabase({ runMigrations: true, verifyRuntimeRole: false });
try {
  if (process.env.DEPLOY_ROLE_GRANTS === 'true') {
    // Executed only by the migration job; runtime has no DDL privileges.
    await db.exec(`GRANT USAGE ON SCHEMA public TO usf_app,usf_reader;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO usf_app;
      REVOKE ALL ON schema_migrations FROM usf_app; GRANT SELECT ON schema_migrations TO usf_app;
      GRANT SELECT ON operator_accounts TO usf_reader;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO usf_app;`);
  }
  console.log(`Schema is ready: ${db.mode}`);
} finally {
  await db.close();
}
