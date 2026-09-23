# Security fixes and the path to launch

**Latest validation:** [the seven-area predeployment report](predeployment-validation.md) records the follow-up header, HTTPS, route, dependency, secret, and rate-limit checks, plus the command to verify your deployed hostname. The initial test counts below describe the earlier hardening pass.

Updated September 22, 2026. Read this before the older security review. That review recorded the **previous** implementation; this document records the fixes and the remaining checks on your future hosting accounts.

The application is ready for **private staging and real-provider integration testing**. The reported application flaws have been corrected. A public launch still requires your actual domain, provider credentials, production database, working email delivery, backups, and monitoring to be configured and tested. No code review can certify a hosting environment that does not yet exist.

## 1. What changed, in ordinary language

A session cookie is like an admission wristband: it lets the website remember that you signed in. Someone who steals that wristband must not automatically gain permission to replace your password, replace your authenticator, or destroy your account.

A database transaction is a group of changes that succeeds together or is rolled back together. A row lock makes competing requests wait their turn. We now use both when issuing credentials and changing security settings. Each account also has an `auth_version`: changing security settings advances this number. Old sessions and pending tokens cannot become valid again just because two requests arrive close together.

| Original finding | Implemented correction | Evidence |
| --- | --- | --- |
| F1: reset bypassed MFA | Reset changes the password, revokes sessions and pending credentials, and requires ordinary sign-in, including MFA. It never grants a new session. | API regression on PGlite and native PostgreSQL. |
| F2: cookie could replace MFA | Setup requires the password and the existing factor when enabled; expires in five minutes and is bound to the initiating session. Disable, recovery-code replacement, password change, and deletion also check the existing factor. | Refusal, replacement, expiry, session-binding, and revocation tests. |
| F3: app used database superuser | Separate administration, migration, runtime, and limited reader roles. Production startup does not run migrations and rejects administrative/owner roles. | Native PostgreSQL runtime could not CREATE/DROP tables or modify migration history; reader could not read health records; unsafe roles were rejected. |
| F4: stale reset/MFA tokens survived changes | Credential changes and sign-out-everywhere revoke pending tokens and sessions together, advance the auth version, clear pending MFA setup, and remove queued credential emails. | Combined reset/change/logout/MFA regressions. |
| F5: social account could be deleted with cookie alone | Single-use email confirmation is bound to the existing account, session, auth version, and five-minute expiry. The person then explicitly confirms deletion. | Refusal before confirmation, expiry, successful confirmation and replay rejection tests. |
| F6: weak scrypt cost | New hashes use N=32768, r=8, p=3 and encode the version/parameters; old hashes still verify and upgrade at successful login. | Password compatibility and parameter tests. Benchmark under your hosting load before launch. |
| F7: URL could override TLS | TLS-related URL parameters are rejected. Explicit TLS verifies certificates, optionally with the provider's CA file. Plaintext production connections require an explicit isolated-network exception. | Configuration rejection/acceptance tests. Live hosted TLS still needs testing. |
| F8: backup passphrase visible in process arguments | Backup/restore use a protected passphrase file through file descriptor 3. Owner-only output directories, restrictive creation permissions, pipeline error handling, and isolated restore container. | Shell syntax and mocked pipeline/FD/permission tests; a real Docker/GPG backup and restore must still run on staging. |

Additional changes:

- Rate limits live in PostgreSQL, so replicas and restarts share limits. IP addresses and account identifiers in limiter keys are HMAC-hashed. IPv6 addresses are grouped by subnet. Account-security routes have their own account-wide attempt limit.
- MFA verification consumes the token, authenticator step or recovery code, and issues the session inside one transaction. Concurrent use of one challenge creates one session.
- Registration checks an existing email account under a lock. A signup cannot delete an account that becomes verified while it is waiting. Provider sign-in never automatically merges accounts based on matching email.
- Google ID tokens are checked for signature, issuer, audience, expiry, nonce, verified email, and authorized-party/access-token claims when supplied. The authorization flow uses PKCE and state bound to a cookie. Facebook identity is fetched server-side with an app-secret proof. Provider access tokens are not sent to the browser or saved in the database.
- Production verification/reset messages are queued in encrypted form, with recipient cooldowns and daily/global limits. Requests do not wait for the remote mail provider. Known and unknown email requests use the same minimum response-time window. This reduces enumeration through timing; it is not a claim of mathematically constant network latency.
- Email jobs have bounded retries and a one-day expiry. Failures emit structured events. Password/MFA/account changes create security events without passwords, tokens, emails, or measurements in the event record. Events use pseudonymous account identifiers and expire after 30 days. Housekeeping runs hourly and reports failures instead of silently ignoring them.
- Email verification requires a button click; merely opening the page does not consume the link.
- Signing in with an email address that has no confirmed account creates one (same password rules, breach check, confirmation email, mail cooldowns, and per-identifier attempt limit as sign-up; the unconfirmed placeholder is taken over under the same advisory lock registration uses). This is a product decision: the sign-in form therefore tells a visitor whether an email is already registered, which the sign-up and resend forms still hide. Unknown usernames never create accounts.
- The operator export command can produce clean JSON with `node server/admin.js export ADDRESS`; production manual email verification is disabled.

Google's optional provider reauthentication route additionally checks a signed, recent `auth_time`. Facebook's browser reauthentication parameter alone is **not accepted as proof** for destructive actions: the account page uses the independent, session-bound email confirmation instead. Social signup requires the provider to supply an email address. An old provider account without an email needs operator-assisted ownership verification; it cannot delete itself with a cookie alone.

## 2. What was actually verified

The following are different kinds of checks:

```sh
npm test
npm run test:postgres
npm run build
npm audit
```

- `npm test`: 43 checks at the initial completion of the hardening work. They cover calculations, API ownership boundaries, CSRF, authentication combinations, signed Google token validation, rate limits, and encrypted email jobs.
- `npm run test:postgres`: starts a **real PostgreSQL 17** process on a random loopback port with a temporary directory and random test password. It tests the restricted roles and locking with separate connections, then runs the 23 API/security tests as the restricted runtime user. The process and temporary database are cleaned up afterward. It does not open your real `.data` folder.
- `npm run build`: compiles the frontend. This catches syntax/build problems, not every security problem.
- `npm audit`: the final run reported **0 known vulnerabilities**. This checks published dependency advisories, not all possible attacks.
- Browser checks use a separate local in-memory preview, not your saved account. The browser regression specification has been updated for the new confirmation and MFA requirements.

The PostgreSQL runner is a development dependency. It does not ship in the production image. If your machine blocks listening on localhost, grant permission for the test command. It does not need a system PostgreSQL installation, Docker, or permission to create macOS users. Do not run it as root.

The full browser regression specification was updated but was not executed end-to-end in this session. A browser smoke check verified sign-in, the revised account form, and the deletion confirmation dialog. The Docker deployment and real encrypted backup round-trip were not executed on this Mac because Docker/GPG are not installed. Your real Google/Meta/email credentials were not present. No real provider login, public HTTPS connection, cloud IAM permission, or remote backup was represented as tested.

## 3. Restart local development to use the fixes

An already running `node server/index.js` process keeps the old server code in memory. Saving files does not restart it.

1. In the terminal currently running **this project's** `npm run dev`, press **Control+C** once.
2. From the project folder, run `npm ci` if dependencies have changed.
3. Run `npm run dev` again. Development startup applies migration 003 to your local database. Your plan and tracking rows are not deleted.
4. Reload the browser and sign in again. Migration 003 deliberately revokes old sessions and pending authentication links, because they may have been issued by the earlier vulnerable flows.

Do not start a second development command while the first is still listening on port 5173. The temporary security preview, if used during development, uses a different port and a disposable database.

The optional `fsevents` install-script warning is separate from these fixes; it is not evidence that the application security regressions failed. The native PostgreSQL test runner creates validated local library aliases itself, so its tests can run even when package lifecycle scripts were disabled.

## 4. Where production data lives

```text
Person's browser --HTTPS--> Caddy/host proxy --> Node/Express --> PostgreSQL
                              |                   |                  |
                         HTTPS certificate   runtime role       persistent volume
                                                 |
                                            mail provider
```

For the supplied Compose deployment, all account/profile/tracking rows live in the PostgreSQL service's named volume `production_postgres` (Compose prefixes its project name). They do not live on GitHub or in the visitor's browser. Only ports 80/443 are published. The database network is internal; the website container has both that private network and an outbound/web network.

For managed PostgreSQL, rows live in the database project/region you choose with the hosting provider. You access it through that provider's authenticated console, an approved private connection, or a secured tunnel. Do not expose a PostgreSQL port to everyone for convenience.

There are four database roles:

| Role | Purpose |
| --- | --- |
| `usf_admin` | Initial database administration and full backups. Never used by the website. |
| `usf_migrator` | Owns app tables; creates/changes the schema during deployment. Never mounted into the long-running website container. |
| `usf_app` | Reads/writes the rows needed by the website. Cannot create/drop tables or administer database roles. |
| `usf_reader` | Reads only `operator_accounts`: username, email, account creation date, email/MFA status. It cannot read password hashes, MFA secrets, sessions, or health records. |

Use `usf_reader` for routine account listings. Within the private deployment host:

```sh
docker compose -f compose.deploy.yml exec db psql -h 127.0.0.1 -U usf_reader -d u_stay_fit -W
```

`-W` prompts for the reader password without placing it in the command. Once inside `psql`, enter:

```sql
SELECT username, email, verified, two_factor FROM operator_accounts ORDER BY created_at DESC LIMIT 50;
```

Enter `\q` to leave `psql`. The email addresses are private information; do not post screenshots of the listing.

For an actual data-access request, the app's Account page offers self-service export/deletion. An authorized operator can run `node server/admin.js export ADDRESS` or `node server/admin.js delete ADDRESS` from the app environment after independently checking the requester's identity. Exports/deletions are recorded in the security log. Keep exported files in a directory with permission 700 and use `umask 077` before redirecting output. The application has no public administrator web page.

Database operators can technically read health records. HTTPS and encrypted disks/backups do not make the data inaccessible to someone with database credentials. Use MFA on hosting accounts, narrowly scoped operator access, and provider disk encryption.

## 5. Safe production setup

### New Compose deployment

Do this on your private staging server first, using a staging subdomain. A staging server is a rehearsal deployment used only by you/testers.

```sh
node scripts/deploy/create-secrets.mjs
```

This creates random secrets in `.secrets/` without displaying or overwriting them. The directory has permission **700**: only its owner can enter it. Container-mounted secret files use **444**, so the different non-root container users can read the specific files mounted into their own containers. The enclosing host directory must stay 700. The backup passphrase file is **600**. Do not copy these files into another broadly readable directory. Do not commit them to Git. Docker secrets are protected file mounts here, not an encrypted secret vault; protect the host and keep an independent recovery copy in your password manager.

Create your server-only `.env` with at least:

```dotenv
SITE_DOMAIN=staging.your-real-domain.example
EMAIL_FROM="U Stay Fit <no-reply@your-real-domain.example>"
RESEND_API_KEY=YOUR_REAL_EMAIL_PROVIDER_KEY
GOOGLE_CLIENT_ID=YOUR_REAL_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_REAL_CLIENT_SECRET
FACEBOOK_CLIENT_ID=YOUR_REAL_CLIENT_ID
FACEBOOK_CLIENT_SECRET=YOUR_REAL_CLIENT_SECRET
FACEBOOK_API_VERSION=v23.0
```

Use **either** Resend or SMTP. Keep `.env` owner-readable only (`chmod 600 .env`). For hosted secret managers, use `_FILE` alternatives where supplied, or inject environment secrets through the host UI. API keys remain server-side; never use `VITE_` for a secret.

Then:

```sh
docker compose -f compose.deploy.yml config --quiet
docker compose -f compose.deploy.yml up -d --build
docker compose -f compose.deploy.yml logs --tail=80 migrate app
```

The database initializer creates separate roles, the one-shot `migrate` service applies the schema and grants permissions, and only then does `app` start as the restricted runtime role. Caddy obtains HTTPS certificates for the domain after DNS and firewall settings are correct. Do not enable access logging with full query strings: confirmation links contain tokens.

**Existing production volume:** initialization scripts run only when a PostgreSQL volume is empty. Editing Compose does not convert old roles automatically. Do not delete the volume. Take a verified backup, have the administrator create the new roles, transfer existing app-object ownership to `usf_migrator`, revoke excess grants, and test the new app role in staging. Keep the old deployment available until the new role is confirmed. This repository has no verified existing public deployment to modify automatically.

Do not import local learning accounts as publicly verified users. Migration 002 was a compatibility migration for old local accounts and marked them verified. A fresh production database avoids inheriting that development shortcut. If real accounts already existed before verification, require a separate re-verification migration after checking their provenance.

### Managed hosting/database

Use equivalent separate migration/runtime/reader roles. Run `npm run db:migrate` **as the migration role** in a release job. Grant the runtime role the needed table CRUD permissions, schema USAGE, and SELECT-only access to `schema_migrations`. Do not grant object ownership, schema CREATE, superuser, CREATEDB, CREATEROLE, replication, or BYPASSRLS.

Set `DATABASE_SSL=true`. Remove `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, and other `ssl...` options from the connection URL: the app intentionally rejects them to avoid the driver's override behavior. If the provider uses a custom CA, set `DATABASE_CA_FILE` to the readable PEM certificate file. A CA certificate is public verification material, not a password. Certificate validation errors must be corrected, not disabled.

`DATABASE_SSL=false` with `DATABASE_ALLOW_INSECURE_PRIVATE=true` is reserved for the isolated, single-host Compose database network. The flag is your explicit assertion about the network; the app cannot prove that an arbitrary remote hostname is private.

## 6. Connect and verify Google, Facebook, and email

The existing [deployment guide](deployment.md) explains the provider-console steps. Configure callbacks exactly:

```text
https://YOUR_DOMAIN/api/auth/google/callback
https://YOUR_DOMAIN/api/auth/facebook/callback
```

Use separate staging/production apps or credentials. The hostname, `https`, path, and port must match the configured callback. Never paste client secrets into frontend files or GitHub.

Before public access, test with a real test account:

1. Provider signup, logout, and repeat login all work.
2. Cancelling the provider flow gives a safe error and creates no session.
3. Signing in with another provider that shares an existing email does **not** silently merge accounts.
4. Facebook returns the requested email permission; otherwise the app asks the person to use another signup method.
5. Changing callback state or replaying a callback is refused.
6. Password signup verification, reset, and security notices arrive from your verified sender. Test spam folders too.
7. Enable local MFA, reset that password, and verify that sign-in still demands the second factor.
8. For social-account deletion, request the confirmation email, open it in the same signed-in browser, confirm identity, then explicitly delete. Another browser/session and a reused/expired link must fail.

Mail delivery and provider dashboard approvals are external services. Passing mocked protocol tests does not prove your particular credentials, app-review status, email DNS, or callback configuration works.

## 7. Backups, recovery, key handling, and monitoring

A persistent disk is not a backup. Make an encrypted backup on staging:

```sh
BACKUP_PASSPHRASE_FILE="$PWD/.secrets/backup_passphrase" scripts/backup.sh /secure/backups
```

The shell sees the **file path**, not the secret value. The script reads the passphrase through file descriptor 3, so it does not appear in GPG's process arguments. Copy the completed encrypted file off the server using your authenticated storage service. Configure a lifecycle policy (for example, 14 days) and publish the retention period you actually operate. The script does not delete older copies before you have verified the remote copy.

Test restoring a particular completed file:

```sh
BACKUP_PASSPHRASE_FILE="$PWD/.secrets/backup_passphrase" scripts/restore-test.sh /secure/backups/ACTUAL_BACKUP_FILENAME.dump.gz.gpg
```

The restore container has no published ports and no networking. `pg_restore --exit-on-error` must succeed. Compare row counts and verify a test account in a separate restored application. This script does not replace your production database.

Schedule nightly backups and remote uploads with your host's job runner; alert on failure, a backup older than 24 hours, or missing remote copies. Repeat a restore drill monthly and after meaningful schema changes. Keep a recovery copy of **APP_SECRET** and the **backup passphrase** outside the server. A backup without its keys may be unusable.

APP_SECRET encrypts authenticator seeds and queued email payloads. Do **not** randomly replace it on an existing database: that makes these values unreadable. Planned rotation requires a maintenance window and a migration that decrypts with the old key and re-encrypts with the new key, tested against a copy first. If compromise is suspected, stop access, revoke all sessions/tokens, remove pending emails, rotate credentials, and require verified authenticator reenrollment through an incident-recovery process. Do not switch to the development fallback.

Before making a restored database live, invalidate all restored sessions, email tokens, OAuth states, pending authenticator setup, queued emails, and provider reauthentication grants. Otherwise a restored backup can revive credentials that were revoked after the backup. Preserve deletion requests received since the backup and reapply them before reconnecting public traffic.

Monitor `/api/health` from outside the server for availability. It deliberately returns no private operational details. Collect structured server error events (`email_delivery_failed`, `mail_worker_failed`, `maintenance_failed`, `oauth_callback_failed`) into your hosting monitor and configure actionable alerts. Through an authorized database connection, monitor exhausted email jobs (`attempts >= 5`) and security event counts; don't put full message payloads or health records into logs. Test that an intentionally failed test email actually reaches the operator's alert channel. A log line that nobody sees is not monitoring.

The database security log is not tamper-proof against a fully compromised application process. For stronger incident evidence, forward selected metadata to your host's restricted log service, with retention/access controls. Avoid logging request bodies, cookies, Authorization headers, or token-bearing URLs.

## 8. The final release decision

Before switching from private staging to public users, record a pass/fail result and date for:

- The actual hostname's HTTPS, secure cookies, trusted proxy/IP behavior, and private database networking.
- Real Google/Meta flows and email delivery, including recovery/deletion edge cases.
- Runtime database privilege checks and production migrations on the chosen host.
- A complete encrypted backup → remote copy → successful restore drill, with failure alerts and retention configured.
- Operator contact, the actual hosting/data region and privacy/retention disclosures; appropriate review for the intended audience.
- A dependency audit, build, API regressions, browser smoke tests, and a rollback/recovery plan for that release.

These are concrete deployment checks, not more unresolved instances of the original reset/MFA bugs. The repository now provides the corrected implementation and repeatable tests; your hosting/provider accounts supply the remaining evidence.

Primary references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [Google OIDC claims](https://developers.google.com/identity/openid-connect/reference), [node-postgres TLS precedence](https://node-postgres.com/features/ssl), [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html).
