# Dude With a Pickup Operator Dashboard

React/Vite dashboard for reviewing booking requests and recording job updates. The browser calls same-origin server endpoints in `api/`. Those endpoints check a signed, HTTP-only session cookie and call the Google Apps Script backend. Customer records and server credentials are never embedded in the browser build.

The shared system design is documented in `docs/architecture.md`, `docs/data-contract.md`, and `docs/job-lifecycle.md`. Sanitized workbook and booking-intake fixtures with isolated setup instructions are in `test-fixtures/`. The fixtures are not deployed to Google or connected to live business data.

## What currently works

- List jobs from the booking and operator sheets through Apps Script.
- Record quote, deposit amount, balance, and a payment link that was prepared outside this app.
- Mark a booking confirmed and create a Jobs calendar event.
- Mark a job done and hide completed jobs after 30 days.

This version does not send customer email/text messages, create Square invoices, or verify payment. The quote button records details; it does not deliver a deposit link.

## Private server configuration

Set these values in the Vercel project's server environment settings. For local full-stack development, use an ignored local environment file with `vercel dev`; `npm run dev` serves only the Vite frontend and cannot run `/api` functions.

| Name | Purpose |
| --- | --- |
| `DASHBOARD_APPS_SCRIPT_URL` | Deployed Apps Script `/exec` URL |
| `DASHBOARD_API_TOKEN` | Same random token stored as Apps Script script property `DASHBOARD_API_TOKEN` |
| `DASHBOARD_PASSPHRASE` | Operator passphrase, at least 16 characters |
| `DASHBOARD_SESSION_SECRET` | Independent random session-signing value, at least 32 characters |

Do not use `VITE_` variables for secrets. Vite includes those values in the browser bundle. Never commit a populated `.env` file.

## Apps Script

The source is `apps-script/Code.gs`. Deploy it as a Web App bound to the booking spreadsheet, and set script properties `DASHBOARD_API_TOKEN` and `JOBS_CALENDAR_ID`. The script now rejects requests if the token property is missing. Keep the script deployment URL and token private.

The script expects `Sheet1` for booking intake and `Jobs` for operator updates. Confirm the actual sheet headers before using it with live data.

## Rotate the previously exposed credential

The previous client source contained a token and passphrase. Generate a new token and passphrase, replace the Apps Script token property and Vercel server environment values, then redeploy. Revoke/remove the old values. Also generate a fresh, unrelated session secret so earlier sessions expire. If the former token was ever committed, distributed, or deployed, treat it as exposed even after removing it from the current source.

## Verification

Run `npm install` and `npm run build` for the frontend. Use the full-stack deployment or `vercel dev` to check sign-in, sign-out, an unauthorized `/api/jobs` request, job listing, and one test update. Use synthetic booking records for portfolio screenshots.
