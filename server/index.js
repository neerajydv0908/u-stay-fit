import 'dotenv/config';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { cleanup, createSecurityWatch } from './maintenance.js';
const db = await createDatabase();
const port = Number(process.env.PORT || 3001);
// AUTH_RATE_LIMIT raises the per-address sign-in allowance for development and the browser test
// suite only; production always keeps the default.
const app = createApp(
  db,
  process.env.NODE_ENV !== 'production' && /^\d+$/.test(process.env.AUTH_RATE_LIMIT || '')
    ? { rateLimitMax: Number(process.env.AUTH_RATE_LIMIT) }
    : {},
);
const server = app.listen(
  port,
  process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  () => {
    console.log(`U Stay Fit server: http://localhost:${port}`);
    console.log(`Storage: ${db.mode}`);
    console.log(`Email: ${app.get('mailer mode')}`);
    console.log(`Trusted proxies: ${JSON.stringify(app.get('trust proxy'))}`);
  },
);
// Bound slow/incomplete HTTP requests; the edge also needs traffic/concurrency limits.
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
const maintenanceError = () => console.error(JSON.stringify({ event: 'maintenance_failed' }));
await cleanup(db).catch(maintenanceError);
const timer = setInterval(() => cleanup(db).catch(maintenanceError), 3600000);
// Reviews the security log every ten minutes; see docs/security-checklist.md for the thresholds.
const watch = createSecurityWatch(db, { mailer: app.get('mailer') });
const watchTimer = setInterval(
  () => watch().catch(() => console.error(JSON.stringify({ event: 'security_watch_failed' }))),
  600000,
);
watchTimer.unref();
const mailTimer = setInterval(
  () =>
    app
      .get('flush mail')()
      .catch(() => console.error(JSON.stringify({ event: 'mail_worker_failed' }))),
  5000,
);
mailTimer.unref();
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      clearInterval(timer);
      clearInterval(mailTimer);
      clearInterval(watchTimer);
      await db.close();
      process.exit(0);
    }),
  );
