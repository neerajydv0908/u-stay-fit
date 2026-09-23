// Encrypt queued mail because verification/reset messages contain bearer credentials.
// Sending happens after the HTTP response in production, avoiding provider-timing leaks.
import { randomUUID } from 'node:crypto';
import { encryptSecret, decryptSecret } from './totp.js';
export function createMailQueue(db, { mailer, secret, previousSecret, state, production }) {
  async function allowed(tx, email) {
    const key = email.toLowerCase();
    const minute = await state.limit(tx, `mail:minute:${key}`, production ? 1 : 1000, 60000);
    const day = await state.limit(tx, `mail:day:${key}`, production ? 8 : 10000, 86400000);
    const global = await state.limit(tx, 'mail:global', production ? 1000 : 100000, 3600000);
    return minute.allowed && day.allowed && global.allowed;
  }
  async function queue(tx, message, userId = null) {
    if (!message.to) return;
    await tx.query('INSERT INTO email_jobs(id, payload, user_id) VALUES ($1,$2,$3)', [
      randomUUID(),
      encryptSecret(JSON.stringify(message), secret),
      userId,
    ]);
  }
  let running = false;
  async function flush() {
    if (running) return;
    running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const { rows } =
          await db.query(`UPDATE email_jobs SET available_at = NOW() + INTERVAL '60 seconds', attempts = attempts + 1
          WHERE id = (SELECT id FROM email_jobs WHERE available_at <= NOW() AND expires_at > NOW() AND attempts < 5
          ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
        if (!rows[0]) break;
        const job = rows[0];
        try {
          await mailer.send(JSON.parse(decryptSecret(job.payload, secret, previousSecret)));
          await db.query('DELETE FROM email_jobs WHERE id = $1', [job.id]);
        } catch {
          console.error(JSON.stringify({ event: 'email_delivery_failed', attempt: job.attempts }));
          await db.query('UPDATE email_jobs SET available_at = $2 WHERE id = $1', [
            job.id,
            new Date(Date.now() + 60000 * 2 ** job.attempts),
          ]);
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    allowed,
    queue,
    flush,
    finish: async () => {
      if (!production) await flush();
    },
  };
}
