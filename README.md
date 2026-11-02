# Dude With a Pickup Operator Dashboard

React/Vite dashboard for reviewing booking requests and recording job updates. The browser calls same-origin server endpoints in `api/`. Those endpoints check a signed, HTTP-only session cookie and call the Google Apps Script backend. Customer records and server credentials are never embedded in the browser build.

The shared system design is documented in `docs/architecture.md`, `docs/data-contract.md`, and `docs/job-lifecycle.md`. Sanitized workbook and booking-intake fixtures with isolated setup instructions are in `test-fixtures/`. The fixtures are not deployed to Google or connected to live business data.

## What currently works

- List jobs from the booking and operator sheets through Apps Script.
- Record quote, deposit amount, balance, and a payment link that was prepared outside this app.
- Mark a booking confirmed and create a Jobs calendar event.
- Mark a job done and hide completed jobs after 30 days.
- Edit booking date/time, quote, deposit, operator notes, actual duration, and operator-verified balance collection.
- Use customer phone and email links, confirm sensitive actions, and reject invalid lifecycle transitions.
- Reload bookings after an edit and verify submitted values persisted.

This version does not send customer email/text messages, create Square invoices, or verify payment. The quote button records details; it does not deliver a deposit link.

## Server configuration

The Vercel API routes are the only path from the browser to Apps Script. They require a valid signed session before reading customer records or writing job updates. The Apps Script URL must be an HTTPS deployment URL in the `script.google.com/macros/s/<deployment-id>/exec` form; the gateway rejects other hosts, query strings, and URL credentials.

Set these values in Vercel **server** environment settings. For local full-stack development, create an ignored `.env.local` from `.env.example` and use `vercel dev`; `npm run dev` serves only the Vite frontend and cannot run `/api` functions.

| Name | Purpose |
| --- | --- |
| `DASHBOARD_APPS_SCRIPT_URL` | HTTPS Apps Script `/exec` URL, with no query string |
| `DASHBOARD_API_TOKEN` | Random bearer token of at least 32 characters, stored only in the Apps Script `DASHBOARD_API_TOKEN` property and Vercel server settings |
| `DASHBOARD_PASSPHRASE` | High-entropy operator passphrase, at least 16 characters |
| `DASHBOARD_SESSION_SECRET` | Independent random session-signing secret, at least 32 characters |

Generate the API token, passphrase, and session secret independently. Use a password manager or a trusted local random generator; never reuse the Apps Script token as the login passphrase or session secret. Set production values only in the Vercel Production environment. Use separate test-only values for Preview or Development, and point those environments only at synthetic data. Do not use `VITE_` variables for secrets; Vite includes them in the browser bundle. Never commit a populated `.env` file.

The browser stores only an `HttpOnly`, `SameSite=Strict` session cookie. The cookie is signed with `DASHBOARD_SESSION_SECRET`, scoped to `/api`, marked `Secure` in production, and expires after 12 hours. Every `/api/jobs` call rechecks it. The dashboard hides and clears customer data when the server reports expiration, and asks the operator to sign in again. Writes require a same-origin request and allowlisted action; fields and values are validated before the server calls Apps Script. Responses are marked `no-store`.

## Apps Script

The source is `apps-script/Code.gs`. Create a **standalone Apps Script project** (not a script attached to a spreadsheet), add `Code.gs` and `appsscript.json`, and deploy it as a Web App. It opens the configured booking workbook by ID and reads its calendar ID and API token from **Project Settings → Script Properties**:

| Script Property | Purpose |
| --- | --- |
| `DASHBOARD_SPREADSHEET_ID` | ID from the test booking Sheet URL |
| `JOBS_CALENDAR_ID` | ID of the test service booking calendar |
| `DASHBOARD_API_TOKEN` | Random token of at least 32 characters; must match Vercel's server-only setting |

Set the Web App to execute as you, and make it callable by the Vercel gateway. The public HTTP entry point returns no customer data unless a valid token arrives in the POST JSON body. GET requests are rejected, and a token in the URL query string is not accepted. The Vercel gateway sends the token in the POST body and never returns it to the browser. Keep the script deployment URL and token out of browser code and Git.

The gateway accepts only the `listJobs` read path and the `sendDeposit`, `confirmBooking`, `completeJob`, and `updateBooking` write actions. Write inputs are restricted to job/request IDs and action-specific fields. Amounts and durations must be bounded, finite, nonnegative numbers; payment links must be valid HTTPS URLs. Upstream Apps Script failures, timeouts, invalid responses, and missing configuration return sanitized errors without customer data or credentials.

This is single-operator authentication: the app has one shared passphrase and no individual accounts, roles, or attribution for changes. It also has no durable cross-instance login rate limiter. Treat it as a portfolio/single-operator gateway; before relying on it for a wider public deployment, add an identity provider and durable abuse controls.

The script expects `Sheet1` for booking intake and `Jobs` for operator updates. Confirm the actual sheet headers before using it with live data.

## Rotate the previously exposed credential

If an earlier token or passphrase was exposed, replace the Apps Script token property and matching Vercel server value with a new random token, choose a new passphrase, and set a new independent session secret. Redeploy after changing Vercel values; the session secret change invalidates prior cookies. Revoke/remove old values. If a credential was ever committed, distributed, or deployed, treat it as exposed even after removing it from the current source.

## Verification

Run `npm install`, `npm test`, and `npm run build`. See `docs/milestone-4-verification.md` for the new acceptance checks. This GitHub-only change has not been run against a deployed test Apps Script. Use the full-stack deployment or `vercel dev` to check sign-in, sign-out, an unauthorized `/api/jobs` request, session expiration, job listing, invalid input rejection, and one synthetic test update. Use synthetic booking records for portfolio screenshots.

Append `?demo=1` to the dashboard URL for a public portfolio view containing only synthetic records. Demo mode bypasses sign-in, does not call the jobs API, and disables write controls. The default route remains live mode and uses only authenticated backend data.
