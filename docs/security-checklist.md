# Security checklist: what the code does, what you do at launch

This maps a standard web-application security checklist to U Stay Fit. Each line says where the
protection lives (file or test) or, when it is an operational step, what you do and when.
Status meanings: **Done** — in the code and covered by `npm test`; **Deploy** — done by the
shipped configuration (`compose.deploy.yml`, `Caddyfile`, `Dockerfile`) when you deploy that
way; **You** — an operator step no code can do for you.

## 1. Authentication and access control

| Item | Status | Where / what |
| --- | --- | --- |
| Least privilege, server-side checks | Done | Every private route runs `requireUser` and scopes SQL by the session's `user_id` (`server/app.js`); nothing trusts an id from the browser. Tests: "isolation between accounts", "all private API operations require a session". |
| Least privilege, database | Deploy | Three roles: `usf_migrator` (schema changes, only in the migration job), `usf_app` (runtime: read/write rows, no DDL), `usf_reader` (one read-only view) — `scripts/deploy/init-roles.sh`, `server/migrate.js`; exercised on real PostgreSQL by `npm run test:postgres`. The app container runs as `node` with a read-only filesystem and all Linux capabilities dropped. |
| MFA for privileged accounts | Done / You | Any account can turn on TOTP two-factor plus recovery codes (`server/totp.js`, Account & security). There is no admin account in the web app: operator actions are the `server/admin.js` command line on the server. **You:** protect what gets you onto that server — SSH keys only (disable password SSH), and two-factor on the hosting, domain, email-provider, and GitHub accounts. Turn on two-factor for your own U Stay Fit account. |
| Session management | Done | 256-bit random tokens (`randomBytes(32)`, `server/security.js`); only their SHA-256 hash is stored. Logout deletes the row; password change/reset and "sign out everywhere" revoke every session (`auth_version`). Sessions end after 3 days idle and 7 days at most (`server/migrations/004-session-activity.sql`, `requireUser`). Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, named `__Host-usf_session` in production. Tests: "sessions end after three idle days…", "production mode uses __Host- cookies…". |
| Password policy | Done | 12–128 characters (`shared/schemas.js`); refused if found in known breaches (Have I Been Pwned k-anonymity, `server/passwords.js`) or if it contains the person's name, username, or email. Composition rules ("one symbol, one capital") are deliberately not used: NIST SP 800-63B recommends length plus breach screening instead, because composition rules push people toward predictable patterns. If your organisation requires them anyway, add a regex to `passwordSchema`. |
| Password storage | Done | scrypt with N=32768, r=8, p=3 and a 16-byte random salt per password (`server/security.js`; OWASP's recommended scrypt setting). Older hashes are upgraded on the next successful sign-in. No MD5/SHA-1 anywhere near passwords (SHA-1 is used only to query the breach corpus, as that API requires). |
| Rate limiting | Done | Database-backed counters shared by every replica and restart (`server/auth-state.js`): auth endpoints 25 per address per 15 min, API 240 per address per minute, 10 wrong passwords per account per 15 min (lockout), 10 code attempts per two-factor challenge, 20 account-security actions per 15 min, email cooldowns (1 per minute and 8 per day per address, 1000 per hour overall). Addresses and identifiers are HMAC-hashed in the keys. |

## 2. Input validation and data handling

| Item | Status | Where / what |
| --- | --- | --- |
| Validate all input with allow-lists | Done | Every body, query string, and path parameter goes through a Zod schema before use — enums, regexes, numeric ranges, UUIDs, dates (`shared/schemas.js`, `server/app.js`). Bodies are capped at 24 KB, must be JSON, and compressed bodies are refused. Test: "malformed, oversized, compressed, invalid-type and cross-origin requests are rejected". |
| XSS | Done | React escapes all rendered text; the content-security policy allows scripts only from the site itself (no inline scripts, no third-party hosts). Test: "SQL injection strings remain literal data; markup is escaped when rendered as React text". |
| SSRF | Done | The server never fetches a URL supplied by a user. Outbound requests go only to fixed hosts: the breach-check API, Google/Facebook token endpoints, and the email provider. |
| SQL / command injection | Done | Every statement is parameterised (`$1`, `$2`…); no query is built by concatenating input. The server never runs shell commands (`child_process` appears only in the CI PostgreSQL test runner). |
| File uploads | N/A | The application has no upload endpoint; photographs are fetched by the operator's script at build time. If you ever add uploads: allow-list types and sizes, store them outside the web root (or in object storage) with execution disabled, and scan them. |

## 3. Data protection and cryptography

| Item | Status | Where / what |
| --- | --- | --- |
| HTTPS everywhere, TLS 1.2+ | Deploy / You | Caddy terminates TLS with `protocols tls1.2 tls1.3` and renews certificates automatically. Production refuses a non-HTTPS `APP_ORIGIN`, redirects HTTP to HTTPS, and sends HSTS for a year (`server/app.js`). Database connections require verified TLS (`DATABASE_SSL=true`) except on the isolated Compose network. **You:** after launch run the site through ssllabs.com (expect an A). |
| Encrypt data at rest | Done / You | Passwords are hashed; two-factor secrets and queued emails are encrypted with AES-256-GCM under a key derived from `APP_SECRET` (`server/totp.js`, `server/mail-queue.js`); backups are AES-256 GPG-encrypted (`scripts/backup.sh`). Plans and daily records are ordinary database rows. **You:** confirm that the disk or managed database holding PostgreSQL is encrypted at rest (managed PostgreSQL and cloud block storage usually are; a bare VPS disk may not be — enable it or pick a host that does). If you want the rows themselves unreadable without the application key, the JSON columns can be encrypted the same way as two-factor secrets — ask for it; the trade-off is that losing `APP_SECRET` would lose the data. |
| Secrets management | Done / You | No secrets in code: CI scans the repository history and the built files with gitleaks; `.env` and `.secrets/` are git- and docker-ignored. Production reads secrets from files (`*_FILE`, Docker secrets created by `scripts/deploy/create-secrets.mjs`) and refuses the development placeholder. **You:** rotate keys per the "Rotating secrets" section of `docs/deployment.md` — provider keys freely, database passwords with `ALTER ROLE`, and `APP_SECRET` through `APP_SECRET_PREVIOUS`, which keeps two-factor working during the changeover. A hosted secret manager (AWS Secrets Manager, Vault) can feed the same `*_FILE` paths if you grow into one. |

## 4. Infrastructure and configuration

| Item | Status | Where / what |
| --- | --- | --- |
| No default credentials, minimal surface | Deploy | Every production password and `APP_SECRET` is generated randomly into `.secrets/`; the server refuses to start with the development secret, an HTTP origin, or `TRUST_PROXY=true`. Only ports 80 and 443 are published; the database sits on an internal Docker network with no host port. `X-Powered-By` is removed and Caddy's `Server` header is stripped. |
| Web application firewall | You | Put Cloudflare (free plan) or an equivalent in front: proxied DNS, "Full (strict)" TLS, managed WAF rules, Bot Fight Mode. Then add Cloudflare's ranges as `trusted_proxies` in the Caddyfile and set `TRUST_PROXY=2` so limits still apply per visitor (details in `docs/deployment.md` §13). |
| No debug features in production | Done | Development-only conveniences (links printed instead of emails, manual `verify`) are disabled when `NODE_ENV=production`. Error responses are generic; the server logs only an error code or name, never stack traces, bodies, or environment values. Unknown `/api` paths return a JSON 404 and only known page routes get the app shell; source maps are not built. Tests: "debug, staging, admin, source, dotfiles and database files are not served by production". |

## 5. Client-side security and headers

| Item | Status | Where / what |
| --- | --- | --- |
| Content-Security-Policy | Done | `default-src 'self'`, scripts and fonts only from the site, images from the site (plus Unsplash until `npm run photos:fetch` has run), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `upgrade-insecure-requests` (`server/app.js`, helmet). |
| HSTS | Done | `max-age=31536000; includeSubDomains` in production. Consider HSTS preload once the domain has run on HTTPS for a while. |
| X-Frame-Options | Done | `DENY` (plus `frame-ancestors 'none'` in the CSP). |
| X-Content-Type-Options | Done | `nosniff`; also `Referrer-Policy: no-referrer` and `Cross-Origin-Opener-Policy: same-origin`. Test: "production sends DENY, nosniff, explicit CSP and HSTS…". |
| CSRF | Done | Every state-changing request must carry an `Origin` header that matches the site exactly, be `application/json` (an HTML form cannot send that), and — from any current browser — declare `Sec-Fetch-Site: same-origin`; the session cookie is `SameSite=Lax` and `__Host-`-prefixed. That is the OWASP-recommended defence for a JSON API used by a same-origin single-page app; a synchroniser token would add nothing a cross-site page could not already be stopped by. Tests: "malformed, oversized, compressed, invalid-type and cross-origin requests are rejected", "a browser-declared cross-site request is refused even when its Origin header matches". |

## 6. Dependency and supply-chain management

| Item | Status | Where / what |
| --- | --- | --- |
| Vulnerability scanning | Done | Dependabot (`.github/dependabot.yml`) opens weekly update pull requests for npm packages and GitHub Actions; CI (`.github/workflows/checks.yml`) runs the test suite, `npm audit --audit-level=low` (fails on any advisory), the build, and gitleaks. `npm audit` reports 0 vulnerabilities at the time of writing. |
| Patch management | You | Merge Dependabot pull requests promptly; rebuild the images monthly with `--pull` for Node, Debian, PostgreSQL, and Caddy fixes; keep the host on automatic security updates. Procedure in `docs/deployment.md` §11. |

## 7. Logging, monitoring, and incident response

| Item | Status | Where / what |
| --- | --- | --- |
| Security logging without secrets | Done | Sign-in successes/failures, code failures, resets, security-setting changes, deletions, and operator commands are recorded in `security_events` with a pseudonymous account hash — never passwords, tokens, addresses, or measurements — and kept for 30 days. Server errors are logged as one-line JSON events (`{"event":"email_delivery_failed"}`, …) without request bodies. Test: "the security log contains event types and pseudonymous subjects, without credentials or health records". |
| Real-time alerts | Done / You | Every ten minutes the server reviews the last hour of the security log (`createSecurityWatch`, `server/maintenance.js`): 100+ failed sign-ins, 30+ failed codes, 50+ sign-ups, 20+ password resets, or 10+ deletions in an hour write a `{"event":"security_alert"}` log line and, when `SECURITY_ALERT_EMAIL` is set, email you — once per hour per condition. **You:** set `SECURITY_ALERT_EMAIL`, and add an uptime monitor (UptimeRobot, Better Stack, or your host's) pointed at `https://your-domain/api/health`. |
| Centralised logs / SIEM | You | Ship container logs off the server so they survive a compromise and can be searched: `docker compose logs` → your host's log product, Grafana Loki, Better Stack, or Datadog (all accept Docker's log drivers). Keep at least 30 days. A full SIEM is more than a single-operator app needs; the alert emails above plus Cloudflare's security analytics cover the "repeated failed logins, unusual API usage" cases. |
| Incident response | You | Write down, before launch: how to take the site offline (stop the `proxy` service), how to revoke everyone's sessions (`UPDATE users SET auth_version = auth_version + 1` — or rotate `APP_SECRET`), how to restore a backup (`scripts/restore-test.sh`), and whom to notify. Keep the operator email in `client/src/data.js` monitored. |

## Verifying this checklist yourself

```sh
npm test               # 58 API and unit tests, including every "Test:" reference above
npm run test:postgres  # the same suite on native PostgreSQL 17 with the restricted roles
npm run test:e2e       # browser flows on desktop and phone
npm audit              # dependency advisories
npm run verify:deployment -- https://your-domain   # after deploying: headers, TLS, redirects
```
