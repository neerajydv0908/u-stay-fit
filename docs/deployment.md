# From a local project to your own domain

**Security update:** follow [Security fixes and the path to launch](security-hardening.md) for the current role separation, verification evidence, protected secrets, and staging checklist. The fixes are implemented; live provider/hosting checks still require your accounts.

See [the seven-area predeployment validation](predeployment-validation.md) for the latest checks and the command to test your real HTTPS endpoint once it exists.

This guide separates **running locally**, **testing a production build**, and **operating a public service**. The project includes deployment configuration, but no server has been purchased, no domain has been registered, and no public deployment is claimed.

Do not enter production secrets into a public repository or a browser bundle. Keep them in the hosting provider’s environment settings or a protected server-side environment file.

## 1. What you need for a public application

| Item | What it does |
| --- | --- |
| Source repository | Keeps versioned code and documentation. |
| Node.js host | Runs Express continuously or in a compatible managed runtime. |
| PostgreSQL database | Stores accounts and private records durably. |
| Domain | Gives the website its public name. |
| DNS settings | Point the name to the correct host. |
| HTTPS certificate | Lets browsers verify and encrypt connections. |
| Google/Facebook developer apps | Authorize the optional social sign-in flows. |
| Operational processes | Backups, updates, support, recovery, deletion, and incident handling. |

A domain alone does not run your code. A GitHub repository alone does not run the backend. A static-only host alone cannot provide this app’s authenticated API.

## 2. Run with external PostgreSQL on your Mac

You can continue using PGlite while learning. To practise a separate PostgreSQL service, install Docker Desktop from its official source and start it. Docker runs isolated software environments called **containers**; Compose describes multiple related services.

The included `compose.yml` starts only a local PostgreSQL database. Before starting it for the first time, choose a random **local-only** password, put it in `POSTGRES_PASSWORD` in your private `.env`, and save the file. There is no built-in default password. If you already initialized this database, use its existing password; editing `.env` does not change that database password.

Then run:

```sh
docker compose up -d db
```

`-d` means detached: run the container in the background. The configuration binds port 5432 only to `127.0.0.1`, so it is not intentionally published to every network interface.

Configure the same private `.env`. Replace `YOUR_LOCAL_PASSWORD` below with the password you chose (this label is a placeholder, not a password to use):

```dotenv
NODE_ENV=development
APP_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://u_stay_fit:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/u_stay_fit
DATABASE_SSL=false
```

The username, password, host, port, and database name are components of that connection URL. If you changed `POSTGRES_PASSWORD` before the database was first created, use that password in the URL. Special characters in URL components require percent-encoding.

Then:

```sh
npm run db:migrate
npm run dev
```

The startup message should say `Storage: PostgreSQL`. Changing the connection starts using a different database; it does not transfer the accounts in `.data/u-stay-fit` automatically.

To open the database’s SQL prompt:

```sh
docker compose exec db psql -U u_stay_fit -d u_stay_fit
```

Inside `psql`, `\dt` lists tables and `\q` exits. These commands are typed in the database prompt, not the ordinary shell. Use read-only practice queries first. Avoid displaying private records or password hashes in screenshots or logs.

To stop the local database:

```sh
docker compose stop db
```

Its named volume preserves data. Do not run volume-removal commands unless you intentionally want to delete the stored database. Changing `POSTGRES_PASSWORD` after initialization does not automatically change an existing database role’s password.

Reference: [Docker Compose quickstart](https://docs.docker.com/compose/gettingstarted/).

## 3. Understand the environment settings

| Setting | Meaning |
| --- | --- |
| `NODE_ENV` | `development` locally; `production` on the public server. |
| `PORT` | Express listening port, default 3001. |
| `APP_ORIGIN` | Exact public origin, such as `https://your-domain.example`, without a trailing slash. Emailed links are built from it. |
| `APP_SECRET` | Random string of at least 32 characters; derives the key that encrypts two-factor secrets. Required in production. Do not change it without re-encrypting stored authenticator secrets and queued mail; keep an independent recovery copy. See the key-handling instructions in security-hardening.md. |
| `EMAIL_FROM` | Sender shown on confirmation, reset, and security emails, e.g. `U Stay Fit <no-reply@your-domain.example>`. |
| `RESEND_API_KEY` | API key for [Resend](https://resend.com); one of the two email transports. |
| `SMTP_URL` | Alternative transport for any SMTP provider, e.g. `smtps://user:password@smtp.example.com:465`. |
| `TRUST_PROXY` | How many reverse proxies sit in front of the app (default `1` in production). See below. |
| `PASSWORD_BREACH_CHECK` | `true` (default) checks new passwords against Have I Been Pwned; `false` disables it. |
| `BACKUP_PASSPHRASE_FILE` | Path to a passphrase file protected with permission 600. The secret value is never a command argument. |
| `DATABASE_URL` | Connection string for the database used by Express. |
| `LOCAL_DATABASE_PATH` | PGlite folder for local development only. |
| `DATABASE_SSL` | `true` requests TLS with certificate verification for external PostgreSQL. |
| `GOOGLE_CLIENT_ID` | Google OAuth client identifier. |
| `GOOGLE_CLIENT_SECRET` | Google server-side OAuth secret. |
| `FACEBOOK_CLIENT_ID` | Meta app identifier. |
| `FACEBOOK_CLIENT_SECRET` | Meta app secret. |
| `FACEBOOK_API_VERSION` | Graph API version used by the Facebook flow; sample is `v23.0`. |
| `POSTGRES_PASSWORD` | PostgreSQL container password in the Compose examples. |
| `SITE_DOMAIN` | Domain for the Caddy deployment example, without `https://`. |
| `DATABASE_PASSWORD_FILE` | Protected mounted password file. Compose supplies a restricted `usf_app` URL and a separate migration role. |

The app listens on loopback in development and on all container interfaces in production. Do not expose a development server as your public hosting solution.

### Email

Sign-up confirmation, password reset, and security notices are real emails. Without a transport the server prints them to its terminal (development only) and the pages show a "Development: open the link" shortcut; in production the server refuses to start until `EMAIL_FROM` and either `RESEND_API_KEY` or `SMTP_URL` are set.

Whichever provider you choose, verify your sending domain there (SPF and DKIM records) so the messages are not treated as spam, use a monitored reply address or a clearly marked no-reply one, and send a test message to yourself before launch. Confirmation links expire after 24 hours and reset links after one hour; both work once.

### Trusted proxies

Express must know how many proxies forward requests to it, otherwise the rate limiter and account lockout either see the proxy's address for everyone (locking all visitors out together) or trust a spoofed `X-Forwarded-For` header (letting an attacker dodge limits). `TRUST_PROXY=1` matches the included Caddy setup and most single-proxy hosts. A CDN in front of a load balancer usually means `2`. If the host documents proxy addresses instead, set them as a comma-separated list. The startup log prints the value in use; check it against the host's documentation, then confirm by making eleven bad sign-in attempts from one connection and seeing only that connection locked out.

### Database TLS

For a managed database outside your server’s private network, follow its official TLS instructions. The `pg` adapter verifies certificates when `DATABASE_SSL=true`; it does not silently disable certificate verification to make a connection work.

Some connection-string SSL parameters override separately supplied SSL settings. Review the final configuration and the provider’s CA requirements; do not mix contradictory options blindly. A provider-specific CA may require extending `server/db.js` to read the approved certificate. [node-postgres SSL documentation](https://node-postgres.com/features/ssl).

## 4. Option A: managed Node hosting with managed PostgreSQL

Choose a provider that supports your required Node version, a persistent PostgreSQL database, environment secrets, HTTPS, and custom domains. Review current official plans and limits; this guide does not promise a free tier or quote a price.

The typical configuration is:

```text
Install: npm ci
Build:   npm run build
Start:   npm start
Health:  /api/health
Runtime: Node.js 24
```

Keep development dependencies available during the build, because Vite and Tailwind are build tools. The runtime can omit them after building; the Dockerfile demonstrates that separation.

Run `npm run db:migrate` in a separate release job as the migration role, then start the web service as the restricted runtime role. Set `NODE_ENV=production`, the real `APP_ORIGIN`, `DATABASE_URL`, and any provider credentials through the host’s secret/environment interface. The app refuses production startup without an external database and HTTPS origin.

Use the provider’s domain-linking workflow and prescribed DNS records. The required record type/value depends on that host. Do not guess an A record or CNAME destination from this example.

The app currently trusts one reverse proxy in production. Confirm the host’s proxy topology before launch; an incorrect `trust proxy` configuration can affect client-IP handling and rate limits. If the host needs a different trust policy, configure it deliberately.

## 5. Option B: a Linux server with Docker and Caddy

This option provides explicit deployment files. It also gives you responsibility for server updates, monitoring, backups, and recovery. If you have never administered a server, a managed host may be easier to operate safely.

The included files are:

- `Dockerfile`: builds the frontend in one stage, then packages the backend and built files in a smaller runtime stage. The runtime uses the non-root `node` user.
- `compose.deploy.yml`: PostgreSQL, the app, and Caddy.
- `Caddyfile`: routes your domain to the app and enables compression.
- `.dockerignore`: excludes `.env`, local records, Git history, and generated dependencies from the image context.

### Prepare the server

1. Obtain a Linux server from a provider you choose.
2. Secure its administrative access and install Docker/Compose using official documentation.
3. Permit the intended web traffic on ports 80 and 443. Keep database port 5432 private.
4. Put a reviewed copy of the repository on the server.
5. Create a protected `.env` there, separate from your local file.

Example deployment values, which **must be replaced**:

```dotenv
SITE_DOMAIN=your-owned-domain.example
EMAIL_FROM="U Stay Fit <no-reply@your-owned-domain.example>"
RESEND_API_KEY=
SMTP_URL=
TRUST_PROXY=1
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_API_VERSION=v23.0
```

Create the database and application secret files first:

```sh
node scripts/deploy/create-secrets.mjs
```

The protected `.secrets` directory supplies different credentials to the initializer, migration job, and running website. See [the security guide](security-hardening.md#5-safe-production-setup) for file permissions and upgrading an existing volume. The database initializer only runs on an empty volume; changing this file never migrates old roles automatically.

The internal Compose database network is isolated on one host. Only there does the recipe explicitly permit database TLS to be off. For managed/remote PostgreSQL, use verified TLS and the runtime role; remove conflicting SSL URL parameters. The `migrate` job runs before the application, so the website never needs schema-owner permissions.

### Validate and start

From the server’s project folder:

```sh
docker compose -f compose.deploy.yml config --quiet
docker compose -f compose.deploy.yml up -d --build
```

The first command validates the configuration without printing the resolved secrets. The second builds and starts the services. Run this only on the server you intend to operate; it is not necessary for learning locally.

Check status:

```sh
docker compose -f compose.deploy.yml ps
docker compose -f compose.deploy.yml logs --tail=80 app
```

Do not paste unreviewed logs into public issues. Even though application errors avoid dumping request bodies, infrastructure logs may contain sensitive information.

Caddy needs the domain to resolve correctly and its certificate challenges to reach the server. Its certificate state is preserved in named volumes. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Docker is not installed in the development environment used to create this project, so this deployment configuration requires verification on your chosen host. It has not been described as a completed deployment.

## 6. Buy and connect a domain when ready

Your brand is “U Stay Fit.” A domain such as `ustayfit.com` is only an example: availability, ownership, and trademark suitability have not been established.

When you choose a registrar:

1. Check the exact name and renewal terms.
2. Register it in your own account.
3. Enable account security and renewal reminders or the renewal setting you prefer.
4. Follow your hosting provider’s DNS instructions.
5. Wait for DNS changes to become visible; timing varies.
6. Confirm HTTPS works without bypassing a browser warning.
7. Set `APP_ORIGIN` to the final canonical origin.
8. Register matching Google/Facebook callback URLs.

**DNS records** associate names with destinations. An A record maps to an IPv4 address; an AAAA record maps to IPv6; a CNAME aliases one hostname to another. Use the records your host specifies. Do not add an IPv6 record if your server does not actually support the corresponding route.

Decide whether the canonical site uses the bare domain or `www`. Configure a redirect for the alternate spelling at the proxy/host and keep the app’s origin and OAuth callbacks consistent.

## 7. Configure Google sign-in

Google credentials belong to your developer project. The integration is already coded, but only you can provide those credentials and complete any required provider setup.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select the project for U Stay Fit.
2. Configure the OAuth branding/consent information with accurate app and contact details.
3. Create an OAuth client of type **Web application**.
4. Register the exact development callback:

```text
http://localhost:5173/api/auth/google/callback
```

5. Put the client ID and secret in your local `.env`:

```dotenv
APP_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

6. Restart the server and use the app at `http://localhost:5173`, not a different hostname.
7. If the provider project is in a restricted testing mode, add the appropriate test accounts through its console.
8. For production, register `https://YOUR_ACTUAL_DOMAIN/api/auth/google/callback` and put production credentials in the hosting environment.

The callback must match exactly: protocol, hostname, port, path, and trailing slash. The Vite development proxy forwards `/api` to Express, so the browser-facing callback uses port 5173.

Our flow requests basic OpenID/email/profile identity and validates Google’s verified-email response. It does not request Drive, Gmail, or Calendar data. State is browser-bound and consumed once; Google also uses PKCE.

Provider interfaces and publication requirements change. Use the [official Google web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) as the authority when configuring your project. The code must still be tested against your real developer credentials before you advertise Google login as live.

## 8. Configure Facebook sign-in

1. Open [Meta for Developers](https://developers.facebook.com/) in your account.
2. Create/select the app appropriate for the Facebook Login use case.
3. Configure the web login product, app domain, contact details, and required privacy/data-deletion information.
4. Register the exact production redirect:

```text
https://YOUR_ACTUAL_DOMAIN/api/auth/facebook/callback
```

5. Put the app ID and secret in the corresponding backend environment variables.
6. Verify that `FACEBOOK_API_VERSION` is a currently supported version for your Meta app. The starter’s `v23.0` is configurable, not a promise about all future provider versions.
7. Test with accounts authorized by your app’s current mode. Complete any applicable review and public-mode requirements before general release.

Some provider configurations restrict local HTTP callbacks. Use the allowed development configuration described by Meta; do not bypass security warnings or invent a callback exception. An HTTPS staging deployment may be needed.

The flow requests basic identity and email, verifies the returned provider subject, and uses an app-secret proof for the profile request. An email may be absent; the provider subject remains the identity key. Existing email accounts are not silently linked.

Reference: [Meta’s manual login-flow guide](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/). Its page was not fully retrievable by the research tool during development, so review the current developer-console documentation and test the flow directly. No live Facebook login test has been claimed.

## 9. Test every production boundary

Use synthetic records in staging first:

- Public page navigation and direct refresh of `/fat-loss` and `/dashboard`.
- New account → onboarding → saved plan → dashboard.
- Existing username and email login.
- Wrong password, duplicate registration, and expired session.
- Google/Facebook success, denial, missing email where relevant, and callback errors.
- Another account cannot read or remove your records.
- Food, water, exercise, and weight records persist across process restarts.
- Logout invalidates the session.
- HTTPS and Secure cookies work through the actual reverse proxy.
- Database connections use the intended host and TLS configuration.
- A database backup can actually be restored into an isolated environment.

Use `/api/health` for a basic liveness/database check, but remember it does not test every feature.

Once your hostname works, run this from the project folder on your Mac, substituting your actual HTTPS origin:

```sh
npm run verify:deployment -- https://YOUR_REAL_DOMAIN
```

This sends a small set of read-only requests. It checks HTTP redirects, normal certificate-chain and hostname verification, the negotiated TLS version, certificate expiry, security headers, health, and selected public/private route boundaries. It fails with a nonzero exit code when a check fails; never work around a failed certificate check by disabling TLS verification. It cannot verify certificate renewal, all disabled legacy protocols, provider sign-in, backups, or resistance to a traffic flood. Read [the validation guide](predeployment-validation.md) for the remaining deployment checks.

The production app redirects plain HTTP GET/HEAD requests to `APP_ORIGIN` and rejects plain HTTP mutations. Its private backend port must remain inaccessible from the Internet; only the correctly configured proxy may supply forwarding headers. External health monitors must use HTTPS. An internal monitor must follow your host's documented proxy/health-check setup, not broadly trust arbitrary forwarding headers.

## 10. Backups and restoring

A persistent volume is storage, not a backup. A backup should exist independently of the machine or volume that could fail, and access to it must be controlled because it contains health data.

Two scripts cover the Compose deployment. On the server, from the project folder:

```sh
BACKUP_PASSPHRASE_FILE="$PWD/.secrets/backup_passphrase" ./scripts/backup.sh /secure/backups
```

This runs `pg_dump`, compresses the result, and encrypts it with AES-256 (symmetric GPG) so the file is useless without the passphrase. It creates the backup with restricted file permissions. Configure and test off-host upload and retention; the script does not automatically discard older copies. Copy each new file **off the server** (object storage or another machine); a backup on the same disk as the database disappears with it. Keep independent recovery copies of the passphrase and `APP_SECRET` in a password manager. On the server, use protected secret files; never commit them to Git. The `backups/` folder is ignored by Git.

A backup you have never restored is a hope, not a plan. Test one whenever you change the schema and at least monthly:

```sh
BACKUP_PASSPHRASE_FILE="$PWD/.secrets/backup_passphrase" ./scripts/restore-test.sh /secure/backups/u-stay-fit-20260922T020000Z.dump.gz.gpg
```

It decrypts the file into a throwaway PostgreSQL container, prints the row counts for users, profiles, and entries plus the newest entry date, and removes the container. Compare the counts with what you expect. Schedule the backup with cron (for example nightly at 02:00) and keep a written retention rule, because the privacy notice promises that deleted accounts leave backups on that schedule.

Restoring onto the production database is a recovery operation, not a copied one-line command: stop the app, restore into a fresh database, point the restricted runtime `DATABASE_URL` at it, invalidate restored sessions/tokens/pending emails, reapply deletions since the backup, start the app, and verify sign-in with a test account. For a managed database host, use its own snapshot and point-in-time-recovery features instead, and still run a restore test.

## 11. Updating the application

1. Make and test the change locally.
2. Commit and push it through your normal review process.
3. Review numbered files in `server/migrations/` and run the migration job with its dedicated role. Production runtime startup only checks the applied schema version.
4. Take the appropriate backup before consequential schema changes.
5. Deploy the reviewed version.
6. Verify health, login, a synthetic save, and logs.
7. Keep the previous application version available for rollback where compatible with the database schema.

Do not assume rolling back code reverses a destructive database migration. Code rollback and data recovery are different procedures.

### Patching cadence

Dependabot opens pull requests for npm packages and GitHub Actions weekly, and CI fails on any npm advisory (`npm audit --audit-level=low`). Merge them promptly and redeploy. The runtime image is rebuilt from `node:24-bookworm-slim` and `postgres:17` / `caddy:2` on every deploy, so rebuilding monthly (`docker compose -f compose.deploy.yml build --pull`) also picks up Node, Debian, PostgreSQL, and Caddy security fixes. Keep the host itself on automatic security updates (`unattended-upgrades` on Debian/Ubuntu).

### Rotating secrets

- **Provider API keys** (Resend/SMTP, Google, Facebook): create the new key in the provider console, update the environment or secret file, restart the app, then delete the old key.
- **Database passwords**: `ALTER ROLE usf_app PASSWORD '...'` on the database, update the secret file, restart the app (repeat for `usf_migrator` and `usf_reader`).
- **`APP_SECRET`** encrypts two-factor secrets and queued email. Move the current value to `APP_SECRET_PREVIOUS`, generate a new `APP_SECRET`, and restart: the server reads old values with the previous key and re-encrypts each person's two-factor secret with the new key the next time they sign in. Remove `APP_SECRET_PREVIOUS` after a few weeks (anyone who has not signed in by then must set up two-factor again). Rotate immediately if a copy of the environment or a backup of the secrets could have leaked; otherwise yearly is a reasonable routine.

## 12. Data-subject requests from the command line

People can export and delete their own data from **Account & security**. For requests that arrive by email, or for an account that can no longer sign in, the operator uses `server/admin.js` on the server (or locally, with `npm run dev` stopped):

```sh
npm run account -- list
umask 077
node server/admin.js export someone@example.com > someone-export.json
npm run account -- delete someone@example.com
```

`export` prints the same JSON the person could download themselves; `delete` removes the account and every related row through the database's cascade rules; `verify` is a development-only helper and is disabled in production. Use the actual email verification process there. Record each request and its completion date; do not keep the exported file longer than needed to send it.

## 13. Public-launch checklist

The application now includes email confirmation, password reset, per-account lockout, breached-password checks, two-factor authentication, self-service export and deletion, an operator command line, self-hosted fonts (and photos after `npm run photos:fetch`), Dependabot, and backup scripts. What remains is yours to decide and operate:

- Fill in `operator` in `client/src/data.js` (name, contact email, location) so the footer and privacy notice stop showing placeholders, and have the notice reviewed for the places your users live.
- Configure and test the email provider, `APP_SECRET`, `TRUST_PROXY`, and the OAuth providers with real credentials.
- The photographs are committed in `client/public/photos/`, so builds serve them from the app itself; re-run `npm run photos:fetch` only if you change the photo sources in `client/src/data.js`.
- Set up the nightly backup, copy backups off-site, and run `restore-test.sh` once before launch.
- Run the full checks (`npm test`, `npm run build`, `npm run test:e2e`) on the release you deploy.
- Add uptime monitoring and log retention that never stores request bodies, passwords, or tokens; set `SECURITY_ALERT_EMAIL` so the server emails you about unusual activity (see `docs/security-checklist.md`).
- Put a web application firewall in front of the site. Cloudflare's free plan is enough: proxy the DNS record, set SSL/TLS to "Full (strict)" so the connection to Caddy stays encrypted, enable the managed WAF rules and Bot Fight Mode. Because requests then pass through two proxies, add Cloudflare's address ranges as `trusted_proxies` inside the `reverse_proxy` block of the Caddyfile and set `TRUST_PROXY=2`. Then check that limits still apply per visitor: trigger the sign-in throttle from one network (25 wrong attempts) and confirm a phone on mobile data can still sign in.
- Rate limits are shared through the database, so several application replicas need no extra service.
- A qualified review of the health content and of your legal obligations for your audience.

Keep a staging deployment restricted while you complete these. `docs/security-checklist.md` maps a standard web-security checklist to what the code already does and what remains for you at launch.

## 14. Where to put the contact details

Edit the `operator` object at the top of `client/src/data.js`:

```js
export const operator = {
  name: 'Your name or organisation',
  email: 'privacy@your-domain.example',
  instagram: 'https://www.instagram.com/YOUR_HANDLE/',
  x: 'https://x.com/YOUR_HANDLE',
  location: 'Kansas, United States',
};
```

The footer and the privacy notice read these values; empty strings keep the "coming soon" placeholders and a visible warning on the privacy page. Do not publish an address nobody monitors.
