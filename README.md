# U Stay Fit

Hi, this is **Neeraj Yadav**, a master's student in Computer Science at the University of Kansas. I built **U Stay Fit**, a full-stack wellness planner: you enter your measurements and a goal, it works out a realistic daily calorie and macro target, and then it helps you keep going one small step at a time, with food, water, exercise and weight logging and progress you can actually read.

I built it end to end! The design, the React front end, the Node/Express API, the PostgreSQL schema, the authentication and security layer, the tests and the deployment setup — with the aim of shipping something real people could use, not just a class demo.

![U Stay Fit home page](docs/screenshots/home.jpg)

## What it does

- **A personal plan from your own numbers.** Height, weight, age, activity level and a goal (fat loss, muscle gain, recomposition or maintenance) become a daily calorie target with protein, carbohydrate and fat starting points. Under the hood: Mifflin–St Jeor for resting energy, BMI, a Deurenberg body-fat estimate, Boer lean body mass, a protein-mass estimate and an optional Navy-style tape-measure body-fat figure. Overly aggressive goals are capped and explained rather than accepted silently.
- **Daily logging that takes seconds.** Food (with 36 meal ideas grouped by meal, including everyday Indian dishes), water, exercise and weight check-ins, all editable, with kg/lb switching.
- **Progress you can read.** A weekly calorie chart against your goal, a weight trend, body-composition history and a "days with a check-in" streak.
- **Your data stays yours.** Explicit consent before any health data is stored, a downloadable PDF report (or JSON) of everything the app holds, and one-click account deletion that removes every record.
- **Accounts that are hard to abuse.** Email confirmation, password reset, breached-password screening, per-account lockout, two-factor authentication with recovery codes, "sign out everywhere", and optional Google/Facebook sign-in.

| Dashboard on a laptop | Dashboard on a phone |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Dashboard on a phone](docs/screenshots/dashboard-phone.png) |

## How it is built

| Layer | Choices |
| --- | --- |
| Front end | React 19, Vite, Tailwind CSS 4, React Router 7, Motion for restrained animation; fonts and photographs are served by the app itself, so a visit makes no third-party requests |
| API | Node.js 24, Express 5, Zod validation shared between the browser and the server |
| Data | PostgreSQL in production with three database roles, each holding only the privileges it needs; an embedded PostgreSQL engine (PGlite) for local development; numbered SQL migrations |
| Security | scrypt password hashing, hashed session tokens with idle and absolute lifetimes, TOTP two-factor implemented from RFC 6238, AES-256-GCM encryption for secrets at rest, database-backed rate limits, strict CSP/HSTS headers, CSRF protection, a pseudonymous security log with alerting |
| Delivery | Docker (non-root, read-only container) behind Caddy for automatic HTTPS, encrypted backups, and GitHub Actions running the tests, `npm audit` and secret scanning on every push |
| Testing | 58 API and unit tests (`node --test`), the same suite against native PostgreSQL 17, and Playwright browser journeys on desktop and phone |

The formulas, their limits and their sources are in [docs/health-methodology.md](docs/health-methodology.md). The security design is mapped item by item — what the code does, what the deployment does, and what the operator still has to do — in [docs/security-checklist.md](docs/security-checklist.md).

## Run it locally

```sh
npm ci
npm run dev
```

Then open http://localhost:5173. Nothing else is needed: development uses an embedded database and prints confirmation links in the terminal instead of sending email. `npm test` runs the API and unit tests and `npm run test:e2e` the browser suite; [docs/testing.md](docs/testing.md) has the details.

## Status

Feature-complete and passing its full test suite. Deployment is the next step; the plan is in [docs/deployment.md](docs/deployment.md).

## A note on the health content

U Stay Fit provides general wellness information calculated from the numbers you enter. It is not medical advice, it is meant for healthy adults, and it says so at every relevant point — including refusing to suggest weight loss below a healthy BMI.

## Contact

Neeraj Yadav — neerajahir018@gmail.com

## Licence

The code is released under the [MIT Licence](LICENSE). The photographs come from Unsplash under the [Unsplash License](https://unsplash.com/license); credits are in [docs/assets.md](docs/assets.md).
