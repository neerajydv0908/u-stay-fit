# Testing U Stay Fit, from the beginning

A test is a repeatable way to ask, “Does this part behave the way we intended?” A successful build only tells us that the frontend can be assembled. It does not prove that signing in, saving food, or protecting another person's records works. We use several kinds of checks because they answer different questions.

## 1. What was actually verified

Development verification was completed on September 22–23, 2026, with Node.js 24 on macOS and Node.js 22 on Linux.

| Check | Result and boundary |
| --- | --- |
| `npm test` | All 28 calculation and API tests passed. API tests used a real, temporary PGlite database and a captured email outbox. |
| `npm run build` | Passed; Vite produced the optimized `dist/` folder with separate page bundles. |
| Built frontend route | Opened `/fat-loss` directly on Express at port 3001 and verified that the built page rendered. This was a local HTTP check in development mode. |
| Browser account flow | `npm run test:e2e` (desktop Chromium and iPhone-13 emulation) signs up with the consent box, is refused before confirming, resends and follows the confirmation link, completes onboarding with both confirmations, logs food and water, changes the password, enables two-factor with a real code, saves recovery codes, signs out everywhere, signs in through the code step with a wrong code then a recovery code, resets the password through the emailed link, and deletes the account. |
| Account security API | Tests cover: consent and breached-password refusal at sign-up; no session before confirmation; single-use links; sign-ups that never reveal an existing address; an unconfirmed sign-up not blocking the real address owner; ten failures locking an account (and unknown names) for 15 minutes; password change signing out other devices; sign-out-everywhere; reset links that are single-use and revoke sessions; two-factor setup, challenge, replay protection, recovery codes, and disable; deletion removing every row; maintenance dropping stale sign-ups; production `__Host-` cookies and headers. |
| Daily records | Saved food, water, exercise, and weight through the browser; verified dashboard totals and the food diary. |
| History | Entered weight on two different dates; verified the trend and the accessible records table. Optional body-fat and muscle values remained separately recorded values. |
| Persistence | Stopped and restarted the actual development server, reloaded the browser, and verified that the signed-in account and its saved records remained. |
| Responsive interface | Inspected desktop and 390-pixel mobile layouts and checked for document-wide horizontal overflow. |
| Educational pages | Opened the home, fat-loss, and muscle-gain routes; checked source links in the rendered content and homepage photo loading. |
| Long histories | An integration test seeded 503 records and verified that two pages returned all 503 unique records. |
| Body-composition estimates | Unit tests check the Deurenberg body-fat, Boer lean-mass, and protein figures against hand-worked male and female examples, and that implausible inputs return no value. A scripted Chromium walkthrough (desktop and iPhone-13 emulation) confirmed the five estimates in onboarding step 3, the extra tape-based row when circumferences are entered, the four Progress-tab panels, and no horizontal overflow. |
| Food ideas | A unit test checks that all 36 ideas are flat objects with a valid meal and nutrition that passes the food-entry schema. The browser walkthrough confirmed the picker shows four meal groups (9/14/10/3) and that choosing “Rajma Chawal” fills name, meal, calories, and macros. |

These results do **not** mean every possible browser, assistive technology, unusual input, or production deployment has been tested.

The following need your own environment and are **not claimed as completed**:

- Live Google/Facebook authorization with real provider credentials and approved callback URLs.
- Real email delivery through Resend or SMTP (development uses the console transport; the API tests use a captured outbox).
- The live Have I Been Pwned lookup (the parser and fail-open behaviour are unit-tested with a stubbed response).
- Native PostgreSQL-server integration on this Mac. The same API suite can run against PostgreSQL using `TEST_DATABASE_URL`; the GitHub workflow includes that configuration.
- Execution of the GitHub Actions workflow and Dependabot on a hosted repository.
- Building and running the Docker/Caddy deployment, domain DNS, public HTTPS, `backup.sh`, and `restore-test.sh`.
- Formal accessibility, penetration, clinical-content, performance, or load audits.

## 2. Run the automated tests yourself

Open a terminal in the project folder. If you have not installed dependencies, run `npm ci` first. Then run:

```sh
npm test
```

The command starts Node's built-in test runner. It looks for files ending in `.test.js` inside `tests/`. The browser file ends in `.spec.js`, so this command does not accidentally run browser tests.

Near the end, look for:

```text
tests 28
pass 28
fail 0
```

The number can grow when you add tests. The important detail is that failures are zero. If a test fails, read the first failure message and the expected/actual values; do not simply delete the assertion to make the report green.

An **assertion** is a statement such as “the saved record count must equal four.” An assertion fails when the observed answer differs from that expectation.

## 3. What the calculation tests check

Open [`tests/calculations.test.js`](../tests/calculations.test.js). These tests cover:

1. Independently worked male and female energy examples.
2. Short goal deadlines that must not override calorie limits.
3. Longer timeframes producing smaller requested deficits.
4. The limited surplus used for muscle-gain plans.
5. Maintenance and recomposition behavior.
6. Optional tape-based body-fat estimates and the absence of a fabricated measured muscle percentage.
7. Deurenberg body fat, Boer lean body mass, the skeletal-muscle range, and protein mass/percentage against hand-worked examples.
8. Implausible whole-body estimates being withheld rather than clamped.
9. Every food idea being a complete, schema-valid entry assigned to a real meal.
10. Invalid ages, unsupported plans, and invalid goal directions.
11. Consistent optional tape measurements.
12. Invalid dates and negative log values.
13. Reversible kilogram/pound conversion.
14. Low energy estimates for which the app must withhold a calorie plan.

These are **unit tests**: small checks of one function or closely related validation rules. They do not open a browser or make an HTTP request. Their advantage is speed and precise failure messages.

## 4. What the API tests check

Open [`tests/api.test.js`](../tests/api.test.js). An **integration test** checks several connected parts: here, an HTTP request goes through Express, validation, authentication, SQL, and the database.

The tests create their own database connection and temporary local HTTP server. In the default mode, the database exists in memory and disappears when the tests finish. The tests do not use your `.data/u-stay-fit` records.

They verify registration with consent and breached-password refusal, email confirmation before the first session, enumeration-safe duplicate sign-ups, password hashing, session-token hashing, cookie settings, login, per-account lockout, profile saving with health-data consent, all four entry types, one weight record per day, export (JSON and the PDF report), signing in with a new email address (which creates the account, with the same password and confirmation rules as sign-up, and a name/username change afterwards), passwords that contain the person's own name or email, idle and absolute session limits, browser-declared cross-site requests, the security alert job, `APP_SECRET` rotation, logout revocation, sign-out-everywhere, password change, password reset, two-factor authentication, account deletion, and maintenance. They also create a second account and check that it cannot read or delete the first account's records.

That isolation check matters more than merely testing that a delete button works. A private application must enforce ownership on the server, even if someone constructs a request without using your page.

The suite also verifies that a forged OAuth callback fails, unknown API routes return JSON, unsafe mutation origins are rejected, and histories beyond one 500-record page remain available.

## 5. Test against a separate PostgreSQL server

Use a **disposable test database**, never the public application's production database. `TEST_DATABASE_URL` is different from `DATABASE_URL` deliberately: it makes choosing test storage an explicit step.

On macOS/Linux, an example is:

```sh
TEST_DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@localhost:5432/usf_test' npm test
```

Replace the example parts with the test database's actual values. The database must exist, and the test user must have permission to create tables in it. The test setup creates the schema if missing. It cleans up its own generated account IDs; a failing process can still leave synthetic records, another reason to use disposable storage.

Do not paste a production connection string into a public issue, screenshot, commit, or chat. Connection strings often contain passwords.

## 6. Build the frontend

```sh
npm run build
```

The result is a `dist/` directory. Vite combines modules, processes Tailwind and CSS, and creates small browser-downloadable files. The dashboard and onboarding pages load as separate bundles when needed.

You can stop `npm run dev` with Control + C and run:

```sh
npm start
```

Then open `http://localhost:3001`. Express serves the generated frontend and API together. Open `/fat-loss` directly and reload it: the server should return the application shell so the frontend router can show that page. This is different from visiting an unknown `/api/...` path, which must return a JSON 404 response.

Local `npm start` without production environment variables is still a development-mode server. It is not proof that a remote deployment, TLS, secure production cookies, or provider callbacks work.

## 7. Run the included browser regression suite

**Playwright** controls a real browser to reproduce user actions. First install its Chromium browser once:

```sh
npx playwright install chromium
```

This downloads a testing browser; it can take time and requires network access. Then run:

```sh
npm run test:e2e
```

[`playwright.config.js`](../playwright.config.js) defines desktop Chromium and a small-screen mobile Chromium configuration. Mobile emulation approximates a device; it is not a real iPhone Safari test.

The configuration starts `npm run dev` if no server is running (it waits for `/api/health` through the Vite proxy, so both servers are ready). In that case it chooses a separate `.data/browser-tests` database folder and sets `AUTH_RATE_LIMIT=1000`, because the two browser projects together make more sign-in calls than the production allowance of 25 per address per 15 minutes; that variable is honoured only outside production. If it reuses your already-running development server, new synthetic browser accounts will be saved in that server's local database instead. Stop your normal preview first if you want the separate browser-test store.

[`tests/browser.spec.js`](../tests/browser.spec.js) covers public pages, registration, email confirmation through the development link, onboarding, food/water logging, reloading, the account page (password change, two-factor with a real code, recovery codes, sign-out-everywhere), the two-factor sign-in step, password reset, account deletion, the PDF download, and signing in afterwards with the deleted address (which creates a fresh account) followed by renaming it on the account page. It generates unique test usernames and computes authenticator codes with the same `server/totp.js` the server uses. Never configure this suite against the public service without deliberately preparing a test environment. If Chromium is already installed elsewhere, `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e` skips the download.

## 8. A manual walkthrough you can follow

Use invented details for practice. The purpose is testing the application, not receiving a personal nutrition recommendation.

1. Open the homepage. Check the logo, navigation, journey cards, myths, citations, and footer.
2. Follow both educational page links. Use Contact us and check that it scrolls to the footer.
3. Open Register for the plan. Choose “Please Sign up!”, tick the privacy box, and create a test account with a unique username and a long passphrase. You land on “Check your inbox”; in development, follow the link shown on the page (it is also printed in the server terminal). Try signing in before following it: you should be refused and offered a new link.
4. Choose a photo and journey. Enter plausible example measurements. BMI, a BMI-based body-fat estimate, lean body mass with a muscle range, a protein estimate, and maintenance calories should appear as soon as height, weight, and age are valid. Leave the optional tape fields empty; no tape-based row should appear.
5. Expand the detailed measurements and supply the complete required set. A separate “Body fat · tape” row should appear and usually differ from the BMI-based number. Check the estimate disclaimer.
6. Select activity. Compare a short and long timeframe for the same target. An aggressive goal should display a limit explanation.
7. Finish onboarding and inspect the initially empty dashboard.
8. Log a meal (try picking an idea from the grouped list, then edit it), 250 ml of water, and an exercise entry. Check that food intake and exercise energy remain separate.
9. Log today's weight. Log another weight on an earlier day using the date picker. Open My progress and expand View weight records.
10. Change kg to lb in Overview. Check that it changes display rather than adding another saved entry.
11. Reload. Stop and restart the server. Reload again. Your records should remain.
12. Open the greeting/profile menu. Inspect the export (a PDF report opens or downloads), plan-change, account, and sign-out options. Sign out, then try `/dashboard`; it should send you to login.
13. Sign in again with the same account and verify its plan and records. Enter a wrong password ten times: the eleventh attempt should be refused for 15 minutes even with the right password.
14. Open Account & security. Change the password; turn on two-factor authentication with an authenticator app (or the manual key); save the recovery codes; sign out everywhere; sign back in through the code step, once with a recovery code.
15. Use “Forgot your password?” and follow the development link; every other session should be gone afterwards.
16. In a separate browser session, create another account. It should start with its own empty diary.
17. Finally delete the test account from Account & security. Signing in again with that email address creates a brand-new, empty account and shows “Check your inbox” — there is no separate sign-up step; use Edit next to the username on Account & security to change the generated name and handle.

To test a delete action, create a clearly disposable synthetic entry yourself. Confirm the app's deletion dialog only for that entry; don't use a real record you intend to keep.

## 9. Responsive and accessibility checks

Try a narrow phone-sized window and a wider desktop window. Horizontal scrolling should be limited to intentionally scrollable goal cards or data tables, not the whole page. Long labels should wrap without covering controls.

Use the keyboard: Tab to a button, Enter to activate it, Escape to close a dialog. A visible focus outline helps you know which control will receive the next key press. Native dialogs help contain focus while open. The charts also offer text tables so the data is available without interpreting color or lines.

Enable your operating system's Reduce Motion preference and reload. Smooth scrolling and animated reveals should respect that preference. This is part of making a pleasant interface usable for people who experience motion discomfort.

Check with an actual screen reader and different browsers before launching publicly; automated checks and visual inspection do not replace those tests.

## 10. Common failures and how to investigate

| Symptom | What to check |
| --- | --- |
| `EADDRINUSE` | Another server already uses port 5173 or 3001. Stop that known process or use the documented port/origin configuration. |
| “We couldn't connect” | Confirm that both the server and Vite started; inspect the terminal's first error. |
| Blank page after changing shared context code | Reload once. Development hot replacement can preserve an incompatible older module; inspect browser errors if reloading does not fix it. |
| Username already exists | Use a different synthetic name or sign into the existing account. |
| OAuth button is dimmed | Provider credentials are missing; the button is intentionally unavailable. |
| No confirmation email arrives | Without `RESEND_API_KEY`/`SMTP_URL` the message is printed in the server terminal and linked on the page. In production, check the provider's dashboard and your domain's SPF/DKIM records. |
| “Too many failed attempts for this account” | Ten wrong passwords lock that identifier for 15 minutes. Wait, or reset the password, which clears the lock. |
| Authenticator codes are rejected | Check the phone's clock; codes are valid for 30 seconds plus one step either side, and a code can be used only once. Use a recovery code if needed. |
| Server refuses to start in production | It requires `DATABASE_URL`, an HTTPS `APP_ORIGIN`, `APP_SECRET` (32+ characters), and an email transport with `EMAIL_FROM`. The message names the missing one. |
| Native date changed visually but did not save in a tool-driven check | Use the native date picker or keyboard, leave the field, and confirm the displayed date survives another edit. A tool setting a DOM value without a real change event is not equivalent to typing. |
| No weight trend | Record weights on two distinct dates. Saving twice on one day updates that day's one record. |
| Expected calendar date differs | Check local timezone and the app's date field; diary dates are calendar dates, not midnight timestamps. |
| Database test cannot connect | Check the disposable database name, user, password, host, TLS settings, and whether PostgreSQL is running. |

## 11. When to add another test

Add a regression test when you fix a meaningful bug or add behavior that could break: for example, ownership checks for a new record type, a new formula, or a password-recovery token flow. A regression test reproduces the bug and verifies its corrected outcome.

You do not need a new automated test for every harmless color or wording change. Inspect those changes visually instead. Tests should protect behavior that matters rather than copy every implementation detail.

Run the relevant tests after the change, and update this document when the verification status changes. An honest testing record tells the next person both what works and what still needs evidence.
