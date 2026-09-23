# U Stay Fit: the seven security checks before deployment

Reviewed on **September 22, 2026**, against this local project and its dependency lockfile.

**Result: the application checks below passed after fixes. The next step is private staging and real-provider testing. Public launch is not yet verified.** You do not have a public hostname yet, so there is no real website certificate, Internet-facing proxy, or hosting account to inspect. This is a specific remaining task, not a failed local test.

A **staging site** is a practice deployment using test accounts and invented records. It lets you check the actual host, email delivery, Google/Facebook sign-in, and backups before inviting people to store health information. Do not copy real user records into it casually.

## 1. Results at a glance

| Area you requested | Result | Evidence and practical meaning |
| --- | --- | --- |
| Dependency vulnerabilities | **Passed current npm advisory scan** | Both the full dependency scan and the production-only scan returned **0 known vulnerabilities**, at every severity. Updated the lockfile to `dotenv 18.0.3` and `motion 13.4.1`. |
| Secret management | **Passed scoped scan and code review** | Gitleaks found no leaks in the scanned working files; server-side secrets use environment variables or mounted secret files. `.env` now has permission `600`. Removed the local Docker database's fallback password. Production rejects the known development application-secret placeholder. |
| Exposed routes | **Passed local production tests** | `/debug`, `/staging`, `/admin`, private files, and unknown API routes return 404. Sixteen private API operations reject requests without a session. Administrator operations are a server-side command line, with no public admin web route. |
| HTTPS and TLS | **Application tests passed; live infrastructure pending** | Tested production HTTP read redirects and rejection of HTTP mutations, including forged forwarding/Host headers. HSTS is present. Caddy specifies TLS 1.2–1.3. No public certificate, real edge redirect, or renewal process has been verified yet. |
| Security headers | **Passed local production tests** | Explicit `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restrictive CSP, and production HSTS are tested on success/error responses. API responses, including rate-limit errors, use `Cache-Control: no-store`. |
| Input validation, SQL injection, XSS | **Passed targeted tests and code review** | Validated malformed/oversized/compressed/invalid-type input rejection, cross-origin rejection, account ownership, and literal storage of an SQL/XSS payload. Database parameters keep input out of SQL syntax; React text rendering escapes markup. |
| Rate limiting and DoS | **Application controls passed; edge capacity pending** | Tested separate authentication limits, shared database limits across app instances, malformed requests consuming limits, and rejection of spoofed forwarding headers when not trusted. Body-size and HTTP timeout limits are configured. Real hosting traffic protection still needs setup/testing. |

“Passed” means the stated checks succeeded. It is not a claim that no undiscovered vulnerability exists, or that every possible request has been tested.

## 2. What was actually executed

From the project root:

```sh
npm test
npm run test:postgres
npm run build
npm audit --json
npm audit --omit=dev --json
```

Results:

- **53 of 53 tests passed** in the regular suite. This includes ten new production-boundary tests in `tests/production-boundaries.test.js`, plus the existing authentication, privacy, calculation, and security regressions.
- **23 of 23 API/security tests also passed on native PostgreSQL 17**, together with separate restricted-role, startup-guard, and competing-connection lock checks. These 23 overlap the regular suite; they are another database environment, not 23 additional unique cases.
- **Production frontend build passed.** A build verifies compilation; it does not certify security.
- **Both dependency audits returned zero known vulnerabilities.** The audit metadata reports 248 dependency nodes in the lockfile; do not interpret the production-only command's shared dependency-count metadata as 248 production packages.
- **Gitleaks 8.30.1**, downloaded from its official release and checked against the release SHA-256 checksum, performed a redacted secret scan. Its configuration is `.gitleaks.toml`. No live credential values were printed or copied into this report.

Tests used disposable databases and synthetic accounts. They did not edit your saved learning accounts in `.data/u-stay-fit` or stop your development servers.

The test log's deliberate “Password breach check unavailable … continuing without it” message exercises the external-service fallback. It is not evidence that the real Have I Been Pwned service was checked successfully. Provider availability and actual email delivery still need staging verification.

### What the dependency scan does and does not mean

A **dependency** is code written by another project that this application uses. An **advisory** describes a known security problem in such code; many advisories have a CVE identifier. `npm audit` compares the dependency tree against npm's advisory service. Zero findings means no matching published advisories were returned at that time. It cannot detect every new or unreported flaw. [Official npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/).

The development-only `embedded-postgres` helper intentionally remains on `17.10.0-beta.17`, matching the deployment's PostgreSQL major version. A newer major version being available does not itself mean this version has an advisory. This helper is omitted from the production runtime image.

Scan again before each release. Also update and scan your eventual operating system and container images: an npm audit does **not** scan Caddy, the PostgreSQL server image, the Node base image, or the host operating system. Those deployed images were not pulled or scanned on this Mac.

## 3. Secrets: where they belong

A **secret** is a value that grants access, such as an email API key or database password. Your frontend is downloaded by every visitor, so it must never contain these values. The backend reads secrets through environment variables or protected files; `server/config.js` supports the `_FILE` alternatives listed in `.env.example`.

Changes and checks:

- `.env` remains local and is ignored by Git and excluded from the Docker build context. Permission `600` means its owner can read/write it; other ordinary local users cannot read it through those file permissions.
- `.env.example` contains empty settings and explanatory placeholders, not production credentials. Optional local Docker PostgreSQL now requires you to choose `POSTGRES_PASSWORD` instead of silently accepting a built-in password. Your existing local password was not changed.
- The known development `APP_SECRET` fallback remains for local compatibility. Production explicitly rejects it. It is a development placeholder, not a safe production encryption key. Synthetic test passwords and example URLs are likewise not real account credentials.
- Production secret creation is documented in [the hardening guide](security-hardening.md#5-safe-production-setup). Create a unique random application secret and separate database-role credentials. Keep recovery copies in a password manager. Do not rotate the application encryption key casually: existing authenticator secrets and queued emails depend on it.
- Source review found no frontend secret environment variables or live provider credentials embedded in browser code. Production uses opaque server sessions; there is no custom application JWT-signing secret to move out of the frontend.

The scanner covers working source, documentation, settings, `.env`, and built frontend files. It excludes external dependencies, local database contents, private secret/backup folders, and generated test reports. These exclusions keep user records and intentionally private secret storage out of a repository scan. Gitleaks finds recognized patterns; it cannot prove that an arbitrary string is not a password. [Official Gitleaks project](https://github.com/gitleaks/gitleaks).

**This folder has no Git repository yet.** Therefore no local commit history could be scanned. The prepared GitHub workflow scans full history and working/built files once a repository exists. Ignoring a file does not erase it from existing Git history. If a real secret was ever published, revoke/replace it at its provider, then remove the exposed copy; simply adding `.gitignore` is insufficient.

## 4. Routes and input handling

A **route** is an address plus an action, for example `GET /api/me` to read the signed-in account. Authentication and authorization protect the data on the server even if someone bypasses the page buttons and sends a request manually.

Public routes intentionally include educational pages, the sign-in/signup screens, provider availability, account-recovery endpoints, OAuth callbacks, and a minimal database-health response. Private profile, tracking, export, and account operations require a valid session. Signup/recovery routes validate their own tokens, consent, credentials, and abuse limits where applicable.

The `/dashboard` and `/account` HTML shells can be loaded publicly; they contain application code, not account records. The API must authenticate before returning private data. There is no public administrator login or debug console. Operator commands require access to the backend's environment and must be restricted through the host's administrative permissions.

The old catch-all frontend fallback made arbitrary URLs return the application page. It did not expose a real debug console, but could misleadingly return success at `/debug`. The server now serves the app shell only for its actual page routes; unused paths return 404.

**SQL injection** means trying to turn a text value into a database command. The application passes values separately as SQL parameters (`$1`, `$2`, and so on). A test saved an attempted SQL command as a food name and verified that the users table remained intact. The application's conditional SQL fragment is selected from fixed code after validation, not assembled from a user's raw text.

**XSS** means trying to make supplied text execute as browser code. User text is rendered through React's escaped text output, with no raw-HTML insertion found in the frontend. The regression verifies escaping when stored text is rendered as React text; this is not a full browser penetration test of every screen. Keep that same text-rendering approach for future features instead of inserting untrusted HTML. Stripping every punctuation character from a person's text is not a replacement for correct output escaping.

The new tests also verify invalid JSON (400), oversized bodies (413), compressed bodies (415), invalid values (400), wrong content types (415), and disallowed browser origins (403). API request bodies are capped at 24 KiB. Compression is rejected to avoid expanding a small compressed upload into a large in-memory body.

## 5. HTTPS and headers, explained

**HTTPS** encrypts traffic and lets the browser verify the server's identity. A **certificate** is part of that verification. You need an actual hostname and running host to test its validity, expiration, and renewal.

The production application now redirects ordinary HTTP reads to the configured HTTPS origin with status **308** and refuses HTTP mutations. Using the configured origin prevents an attacker-controlled `Host` header from choosing the redirect destination. At the public edge, Caddy's automatic HTTPS configuration is intended to redirect HTTP before it reaches Express and obtain/renew certificates when DNS and connectivity are correct. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Only the real reverse proxy may reach the backend port and supply trusted forwarding headers. The included Compose recipe publishes proxy ports 80/443, not backend/database ports. On another host, confirm its network restrictions and set `TRUST_PROXY` for the actual topology. A correct local simulation does not verify a future load balancer or firewall.

The configured headers are:

| Header or policy | Purpose |
| --- | --- |
| `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` | Prevent another page from embedding the site in a frame. |
| `X-Content-Type-Options: nosniff` | Tell browsers not to guess a different resource type. |
| CSP `script-src 'self'` | Restrict scripts to this origin, without allowing inline scripts or `eval`. |
| CSP `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'` | Block embedded objects/frames and injected document-base URLs. |
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | After a valid HTTPS visit, tell the browser to use HTTPS for one year, including subdomains. It is deliberately not sent in development. |
| API `Cache-Control: no-store` | Tell caches not to retain API responses containing account data or errors. |

The CSP still permits inline **styles**, which the current UI/animation implementation uses. That does not permit inline scripts. Any future tightening of style policy needs a visual regression check. Review all subdomains before using the HSTS policy on your real domain: they need HTTPS too. HSTS does not itself protect an entirely new browser's first HTTP request, and this project does not claim HSTS preload registration. [Helmet's header documentation](https://helmetjs.github.io/).

`Caddyfile` explicitly permits TLS 1.2–1.3. The Caddy/Docker deployment has not been run here because those tools are not installed. Certificate validity, renewal, legacy-protocol rejection, and the real proxy behavior therefore remain unverified.

## 6. Limits and traffic attacks

An **IP address** identifies a network connection. A **rate limit** bounds attempts during a time window; exceeding it returns HTTP **429** and an appropriate retry delay. Application counters are stored in PostgreSQL so processes using the same database and application secret share them.

Current defaults include:

| Control | Default |
| --- | --- |
| General API requests | 240 per minute per IP/subnet key |
| Authentication routes | 25 per 15 minutes per IP/subnet key |
| Login account attempts | 10 per 15 minutes per normalized identifier |
| MFA attempts | 10 per 15 minutes per account |
| Sensitive account operations | 20 per 15 minutes per account |
| Request body | 24 KiB; compressed request bodies rejected |
| HTTP headers / complete incoming request | 10-second / 30-second configured timeouts |
| HTTP keep-alive / requests per socket | 5 seconds / 100 requests |

The API limiter runs **before JSON parsing**, so malformed and oversized submissions also count. Tests verify shared state across two app instances and that forged forwarding headers cannot change the client's identity when the caller is not trusted. Sensitive account/email operations have additional limits described in [the hardening guide](security-hardening.md).

These controls do not prove that the service can survive a distributed traffic flood. Requests still consume network and server/database resources before or while the app handles them. Your host/CDN must provide traffic filtering, connection/resource limits, monitoring, and suitable capacity. Configure those for the actual host and load-test staging within your provider's rules. There is no deployed edge to validate today.

## 7. The check to run after you have a hostname

Keep this for later; the placeholder below is not a site to test. Once your own deployed host is reachable, open a terminal in the project folder and replace `YOUR_REAL_DOMAIN` with its canonical hostname:

```sh
npm run verify:deployment -- https://YOUR_REAL_DOMAIN
```

The command sends only a small number of unauthenticated, read-only requests. It verifies:

1. HTTP redirects directly to the same path/query on the canonical HTTPS origin.
2. Normal certificate-chain and hostname verification succeeds, TLS 1.2 or 1.3 is negotiated, and the certificate has not expired. It notes when fewer than 14 days remain.
3. The expected headers are present on the checked success/error responses.
4. Health can reach the database, selected private APIs reject anonymous requests, and selected debug/admin/secret-file paths return 404.

`PASS` means that individual check succeeded. `FAIL` means investigate before launch. Exit code `0` means all these checks passed; `1` means a check failed; `2` means the command's address/arguments were invalid. Never disable certificate verification to make a check pass. The tool uses normal trusted certificate authorities and explicitly enables certificate verification.

The tool's syntax/help and seven invalid-argument cases were checked locally. A disposable local HTTPS fixture also verified four cases: valid configuration passes; a missing framing header fails; a redirect to the wrong host fails; and an untrusted self-signed certificate fails. The fixture's temporary certificate was trusted only in the successful test process; TLS verification was not disabled. **It has not been run against a real deployment.** It cannot prove automatic certificate renewal, rejection of every old TLS version, database network isolation, Google/Facebook approval, email delivery, backup recovery, or traffic capacity. A provider's private staging access gateway may intentionally intercept these paths; investigate such results rather than removing the gateway just to get green output.

Before opening public registration, complete the [staging launch checks](security-hardening.md#6-connect-and-verify-google-facebook-and-email) and [deployment walkthrough](deployment.md): real provider login/email, actual proxy and database TLS, a successful isolated backup restore, monitoring, and accurate contact/privacy details. Record the results for the version you deploy.

## 8. Keep these checks running on GitHub

`.github/workflows/checks.yml` is prepared to run tests, native PostgreSQL checks, the build, and `npm audit --audit-level=low` on pushes to `main` and pull requests. The audit now fails for any reported vulnerability severity. It also downloads a pinned, checksum-verified Gitleaks release and scans both Git history and working/built files with findings redacted.

This automation runs once the project is pushed to GitHub: upload only the intended files (the `.gitignore` excludes secrets, local data and build output), enable the workflow, and make its successful checks required before merging/deploying. A workflow failure only blocks a release if your branch/deployment rules enforce that requirement.
