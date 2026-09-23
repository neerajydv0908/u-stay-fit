// Housekeeping that runs hourly in server/index.js and once at startup.
export async function cleanup(db) {
  await db.query('DELETE FROM request_limits WHERE expires_at < NOW()');
  await db.query("DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '30 days'");
  await db.query('DELETE FROM email_jobs WHERE expires_at < NOW()');
  await db.query(
    'UPDATE users SET totp_pending=NULL,totp_pending_until=NULL,totp_pending_session=NULL WHERE totp_pending_until < NOW()',
  );
  await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
  await db.query('DELETE FROM email_tokens WHERE expires_at < NOW()');
  await db.query('DELETE FROM oauth_states WHERE expires_at < NOW()');
  await db.query("DELETE FROM login_attempts WHERE updated_at < NOW() - INTERVAL '1 day'");
  // A sign-up that never confirmed its email holds no records and is dropped after two days,
  // which also frees the address for whoever really owns it.
  await db.query(
    "DELETE FROM users WHERE email_verified_at IS NULL AND password_hash IS NOT NULL AND created_at < NOW() - INTERVAL '2 days'",
  );
}

// Unusual volumes in the security log over the last hour usually mean an attack or abuse
// (credential stuffing, bot sign-ups, code guessing). Each event type alerts at most once per
// hour: a structured `security_alert` log line for the log collector, plus an email when
// SECURITY_ALERT_EMAIL is set. Counts only; the log holds no addresses or names.
export const ALERT_THRESHOLDS = {
  login_failed: 100,
  mfa_failed: 30,
  registration_pending: 50,
  password_reset: 20,
  account_deleted: 10,
};
export function createSecurityWatch(
  db,
  {
    mailer,
    to = process.env.SECURITY_ALERT_EMAIL,
    thresholds = ALERT_THRESHOLDS,
    log = console.warn,
  } = {},
) {
  const lastAlert = new Map();
  return async function watch(now = Date.now()) {
    const { rows } = await db.query(
      "SELECT event, count(*)::int AS n FROM security_events WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY event",
    );
    const alerts = rows.filter(
      (row) =>
        thresholds[row.event] &&
        row.n >= thresholds[row.event] &&
        !(lastAlert.get(row.event) > now - 3600000),
    );
    if (!alerts.length) return [];
    for (const alert of alerts) lastAlert.set(alert.event, now);
    const counts = Object.fromEntries(alerts.map((a) => [a.event, a.n]));
    log(JSON.stringify({ event: 'security_alert', window: '1 hour', counts }));
    if (to && mailer) {
      const lines = alerts.map((a) => `- ${a.event}: ${a.n} (threshold ${thresholds[a.event]})`);
      await mailer
        .send({
          to,
          subject: 'U Stay Fit security alert',
          text: `Unusual activity in the last hour:\n${lines.join('\n')}\n\nCheck the server logs and consider blocking the source at the edge (see docs/security-checklist.md).`,
        })
        .catch(() => log(JSON.stringify({ event: 'security_alert_email_failed' })));
    }
    return alerts;
  };
}
