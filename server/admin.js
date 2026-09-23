// Operator command line for data-subject requests. Runs against the configured database
// (DATABASE_URL, or the local PGlite folder) and never goes through the web server.
//
//   npm run account -- list
//   umask 077; node server/admin.js export someone@example.com > their-records.json
//   npm run account -- delete someone@example.com
//   npm run account -- verify someone@example.com     (development only)
//
// Stop `npm run dev` first when using the local PGlite database: one process at a time.
import dotenv from 'dotenv';
process.env.DOTENV_CONFIG_QUIET = 'true';
dotenv.config({ quiet: true });
const { createDatabase } = await import('./db.js');
import { createAuthState } from './auth-state.js';
import { secretValue } from './config.js';
import { publicUser } from './security.js';

const [command, email] = process.argv.slice(2);
const usage = () => {
  console.error('Usage: npm run account -- <list | export EMAIL | delete EMAIL | verify EMAIL>');
  process.exit(1);
};
if (!command || (command !== 'list' && !email)) usage();
if (command === 'verify' && process.env.NODE_ENV === 'production')
  throw new Error(
    'Production email ownership must be confirmed through the emailed link. Manual verification is disabled.',
  );
const db = await createDatabase();
const audit = createAuthState(
  db,
  secretValue('APP_SECRET') || 'development-only-secret-do-not-use-in-production',
).audit;
try {
  if (command === 'list') {
    const { rows } = await db.query(
      `SELECT u.username, u.email, u.created_at, u.email_verified_at IS NOT NULL AS verified,
              u.totp_enabled_at IS NOT NULL AS two_factor,
              (SELECT count(*)::int FROM entries e WHERE e.user_id = u.id) AS entries
       FROM users u ORDER BY u.created_at`,
    );
    await audit(db, 'operator_list', null);
    console.table(rows);
  } else {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) {
      console.error(`No account uses ${email}.`);
      process.exit(2);
    }
    if (command === 'export') {
      await audit(db, 'operator_export', user.id);
      const profile = await db.query('SELECT data FROM profiles WHERE user_id = $1', [user.id]);
      const entries = await db.query(
        "SELECT kind, to_char(logged_on, 'YYYY-MM-DD') AS date, data FROM entries WHERE user_id = $1 ORDER BY logged_on",
        [user.id],
      );
      const identities = await db.query(
        'SELECT provider FROM oauth_identities WHERE user_id = $1',
        [user.id],
      );
      console.log(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            user: publicUser(user),
            signInProviders: identities.rows.map((r) => r.provider),
            profile: profile.rows[0]?.data || null,
            entries: entries.rows,
          },
          null,
          2,
        ),
      );
    } else if (command === 'delete') {
      await db.transaction(async (tx) => {
        await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
        await audit(tx, 'operator_delete', user.id);
        await tx.query('DELETE FROM users WHERE id = $1', [user.id]);
      });
      console.log(`Deleted ${user.username} <${user.email}> and every related record.`);
    } else if (command === 'verify') {
      await db.query(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
        [user.id],
      );
      console.log(`${user.email} is marked as confirmed.`);
    } else usage();
  }
} finally {
  await db.close();
}
