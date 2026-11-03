# DWAP software project roadmap

This document is the working plan for the DWAP Operator Dashboard and the separate DWAP Time Ticket application. It records the shared system boundaries, stable data keys, milestone scope, current evidence, and remaining release gates. It intentionally excludes account setup instructions and business credentials.

The projects live in separate repositories because their responsibilities differ. The only current runtime dependency is that Time Ticket reads booking jobs and uses their stable Request IDs; it does not share dashboard code or own booking status.

## Project map and data ownership

| Area | Owner | Boundary |
|---|---|---|
| Customer booking and initial lead event | Booking website, booking service, booking Sheet | Creates the request and stable Request ID; places new requests on the lead calendar. |
| Quote, operator notes, booking lifecycle | Operator Dashboard and its Apps Script | Reads booking data, records operator decisions, and creates/updates the Jobs calendar event. |
| Payments | Square, operated manually for now | Dashboard records operator-entered amounts and payment notes; no Square transaction is automatically verified. |
| Employee time and allocation | Time Ticket, its Apps Script, labour workbook | Records employee time and allocates hours using the booking Request ID when available. |

### Shared data contract

- **Request ID** is the immutable cross-system join key. Keep it stable across the booking Sheet, Dashboard, Jobs calendar marker, Time Ticket, and allocation workbook.
- **Job ID** is a human-facing display label. It is not the join key and must not be regenerated from mutable booking dates.
- The intake calendar pointer (`leadCalendarEventId`) and confirmed Jobs event pointer (`calendarEventId`) are distinct fields. The current Dashboard implementation creates a separate Jobs event but leaves the lead event in place. The agreed lead-to-booking transfer is still outstanding.
- Dashboard dates and calendar operations use `America/Toronto`. Sheet and workbook time zones must be aligned before using payroll or calendar automation against an operational workbook.
- Time Ticket stores exact minutes in `Time Ticket Log` and currently rounds each job upward to the configured 15-minute payroll interval for allocation. The target allocation workbook uses column S for revenue-stream classification and column AM for the stable job key; confirm the actual test workbook headers before wiring new writes.
- A manually entered Square payment or employee-selected identity is not independent verification. Store evidence and actor identity separately if later automation needs them.

## Current status

| Project / milestone | Status | Evidence and remaining work |
|---|---|---|
| Dashboard M0 — Repository and security baseline | **Complete for current source** | Repository and server-side configuration are established; browser bundle does not contain server credentials. Continue to rotate any credential that was exposed historically and review full history before a public release. |
| Dashboard M1 — Shared architecture | **Documented for test design** | Architecture, data contract, and lifecycle documents exist. Test resources were inspected earlier; live operational mappings must not be assumed from the test copies. |
| Dashboard M2 — Authenticated gateway | **Implemented; single-operator limitation** | Same-origin API, server-side Apps Script token, signed HTTP-only session, validation, and expiry checks are tested. Shared passphrase, no user roles/attribution, and no durable rate limiter remain limitations. |
| Dashboard M3 — Reliable loading | **Implemented locally** | Demo/live separation, loading/empty/error states, refresh, malformed-row handling, and Toronto formatting are present. Live booking submission is not retested by the current verification pass. |
| Dashboard M4 — Operator workflow | **Implemented on M5 branch; local tests pass** | Editable fields, validation, lifecycle checks, confirmation dialogs, contact links, and persistence readback are covered by tests. Live Google/Vercel acceptance remains outstanding. |
| Dashboard M5 — Calendar synchronization | **In review; not ready to merge** | Mock tests cover Jobs event idempotency, recovery, conflicts, alternatives, rescheduling, rollback, and DST. Live Google behavior is unverified. The agreed lead-calendar event transfer is not implemented. See [final verification](milestones-4-5-final-verification.md). |
| Dashboard M6–M11 | **Planned** | Manual workflow completion, AI quote assistance, human approvals, outbound Square/Quo/email automation, production hardening, and portfolio release remain future work. |
| Time Ticket M0 — Repository baseline | **Repository established; privacy setting not rechecked here** | Separate repository and ignore rules exist. Identity spoofing is documented as a release blocker. |
| Time Ticket M1 — Workbook contract | **In progress / needs test-workbook verification** | Code has configurable booking columns and known allocation layout assumptions. Verify all tabs, headers, codes, payroll periods, protections, and formulas in a synthetic native Google Sheet. |
| Time Ticket M2–M9 | **Planned** | Revenue-stream classification, confirmed/assigned booking sync, reliable offline delivery, employee authentication, correction audit workflow, integration tests, mobile acceptance, and portfolio release. |

## Dashboard milestones

### M0 — Establish repository and protect data

Maintain the independent repository, ignore rules, server-only secrets, sanitized fixtures, and reviewed Git history. Rotate previously exposed credentials and verify old deployments are disabled before any live release.

### M1 — Define shared data architecture

Maintain the architecture, data contract, and lifecycle documents. Verify Sheet tabs and headers, date/time zones, Request ID and display Job ID roles, lifecycle transitions, manual Square boundary, and the Dashboard/Time Ticket ownership split whenever the test schema changes.

### M2 — Secure server integration

Keep customer data behind same-origin server routes and a signed session. Validate all writes on the server and Apps Script. Before expanding beyond one operator, add identity-based accounts, role/actor attribution, durable abuse controls, and session protections appropriate to the deployment.

### M3 — Reliable job loading

Keep live data separate from synthetic demo data. Preserve explicit loading, empty, retry, malformed-data, and authorization-expiry states. Verify the complete website-to-Sheet-to-Dashboard path in a test environment before asserting live integration.

### M4 — Operator booking management

Complete validated booking edits; quote, deposit, balance, and actual-duration handling; operator notes; safe contact links; server-enforced status transitions; confirmation dialogs; and save/reload verification. Payment facts remain manually checked in Square until verified Square integration exists.

### M5 — Calendar synchronization

Maintain separate lead and Jobs event identifiers. Create/reconcile one Jobs event by stable Request ID, persist its event ID, check conflicts under a documented capacity policy, offer only genuinely free alternatives, and update confirmed events safely when edited. Implement and verify the agreed move from lead calendar to Jobs/booking calendar, including retry and partial-failure recovery, before considering this milestone complete.

### M6 — Complete manual billing workflow

Complete the manual bridge from operator-created Square payment request through recorded quote/deposit, manual payment check, completion, and balance collection. Clearly distinguish operator attestations from Square-confirmed transaction data. Add full lifecycle acceptance tests and verify every action against persisted state.

### M7 — AI-assisted quoting

Obtain and version the current quoting rules. Keep deterministic pricing constraints in code; call the model only from the server. Generate structured recommendations for job classification, missing information, risks, duration, crew, rationale, and draft English/French customer messages. Validate malformed or out-of-policy output and never treat generated text as approved pricing.

### M8 — Human approval

Present editable recommendations, rationale, and message previews. Require explicit operator approval before retaining approved values or initiating any customer-facing action. Record approval state and use repeat-action keys to avoid duplicate requests.

### M9 — Approved external actions

Integrate Square invoicing, Quo messaging, and required email only after provider rules, credentials, privacy, and test accounts are ready. Require approval, signatures/webhook validation where applicable, idempotency, delivery/error records, invoice identifiers, and verified payment status. Keep failures visible and recoverable.

### M10 — End-to-end tests and production hardening

Test booking intake, authentication, authorization, malformed requests, API failures, lifecycle, financial integrity, calendar retry/conflicts, AI constraints/approval, repeated actions, and mobile workflows. Run deployed tests using synthetic data; document limitations and recovery operations.

### M11 — Dashboard portfolio release

Publish a concise README, architecture diagram, setup/environment documentation, tested synthetic screenshots, implemented-versus-planned feature list, tests, limitations, and a link to the Time Ticket repository. Review current files and complete Git history for credentials and real customer data before changing repository visibility.

## Time Ticket milestones

### M0 — Establish the separate repository

Keep the application independently versioned, with `.gitignore`, no duplicate Apps Script source, sanitized examples, and a clearly documented security boundary. Keep the repository private until employee identity and server-to-script protection are implemented and verified.

### M1 — Verify workbook integration contract

Use a synthetic native Google Sheet to verify `Monthly Summary`, `Pay Period Time Tracker`, `Time Ticket Log`, `Time Ticket Audit`, and `Time Ticket Config`. Confirm employee-to-allocation-column mapping, pay-period tab/date rules, Request ID mapping, revenue-stream column S, stable job key column AM, travel/vehicle-return rules, exact versus rounded hours, formula behavior, and office review requirements. Do not include real employee roster or workbook exports in Git.

### M2 — Revenue-stream classification

Add required move/junk/delivery and applicable residential/commercial code selection. Validate codes in both browser and Apps Script; persist raw selection and write the agreed value to tracker column S. Confirm `Monthly Summary` formulas and missing/invalid-code behavior in the test workbook. Labour-code definitions are a business-owned input and must be confirmed before implementation.

### M3 — Confirmed booking synchronization

Use Request ID to load only confirmed and appropriately assigned jobs. Preserve manual jobs, support multiple jobs per day and reassignment, and reject unconfirmed or cancelled work. Validate date mapping and behavior against the Dashboard's lifecycle contract.

### M4 — Reliable offline persistence

Persist drafts locally, sync queued dates after reconnection, identify failed entries, stop day submission if any save fails, and prevent false success. Make save and submit idempotent and prevent duplicate office emails. Test browser restart, service-worker refresh, offline reopen, retry, and partial submission.

### M5 — Employee authentication and authorization

Replace caller-selected employee identity with verified sign-in. Authorize each employee-scoped read/write on the server; protect the Vercel proxy and Apps Script endpoint; validate employee, date, entry, and action fields at every trust boundary. Test impersonation, direct Apps Script calls, unauthorized data access, expired sessions, and unauthorized submissions before any real data use.

### M6 — Corrections and audit trail

Define submitted-day locking and correction roles. Preserve original and amended values, actor identity, timestamps, reasons, and office review state. Never silently delete or overwrite submitted time; make amendments traceable and reportable.

### M7 — Integration tests

Test two employees on one job, multiple jobs per day, manual entries, offline retries, duplicate saves/submits/emails, corrections, missing pay periods, revenue allocation, exact versus rounded totals, workbook summaries, and email recipients. Compare raw log, allocation cells, and summary results.

### M8 — Mobile acceptance

Test real employee devices and target screen sizes. Improve date/job selection, touch targets, validation, offline visibility, and save/submit feedback. Verify installation, manifest, icons, and service-worker update behavior.

### M9 — Time Ticket portfolio release

Document purpose, architecture, workbook contract, privacy and authentication model, offline behavior, configuration, tests, and known limitations. Use synthetic screenshots only, link the Dashboard repository, and review the complete history before considering public visibility.

## Recommended delivery order

1. Keep both repository baselines and this architecture documentation current.
2. Finish Dashboard test-environment acceptance for M4–M5, including the lead-to-booking calendar transfer and live synthetic integration.
3. Verify Time Ticket's labour workbook contract (M1), agree revenue-stream definitions, then implement revenue selection (M2) and confirmed booking sync (M3).
4. Complete the Dashboard manual billing release (M6) and Time Ticket offline reliability (M4).
5. Secure Time Ticket employee identity (M5) before real employee data or production access.
6. Add correction/audit flows and integration tests to Time Ticket (M6–M7); harden and test the Dashboard end to end (M10).
7. Complete mobile acceptance and prepare each portfolio release (Time Ticket M8–M9; Dashboard M11).
8. Only after the manual workflow is stable, build Dashboard AI quoting (M7), explicit human approval (M8), and approved Square/Quo/email actions (M9), followed by automation-specific tests.

Milestones are reviewable outcomes, not a promise that every milestone equals one commit. Use small, descriptive commits and keep feature work on review branches; do not claim an integration is complete until the deployed test flow has passed.

## Release gates and shared constraints

- Use synthetic customers, employees, payment links, Sheets, and calendars for development and portfolio evidence.
- Keep API keys, Apps Script URLs/tokens, populated environment files, workbook exports, customer data, and employee data out of browser bundles and Git history.
- Keep Time Ticket private and synthetic-only until M5 employee authentication and endpoint protections are verified.
- Keep Dashboard M4–M5 on its review branch until the calendar transfer gap and isolated Google integration checklist are resolved. Current local tests do not prove live Google service behavior.
- Repository visibility is a separate release decision; a clean current file tree alone does not certify old Git history or deployed credentials.
- The initial conflict policy treats all overlapping events on the dedicated Jobs calendar as busy. Revisit it if crews, vehicles, or service categories permit multiple concurrent jobs.

## Related project and detailed verification

- Dashboard repository: [pgrundy16/dwap-operator-dashboard](https://github.com/pgrundy16/dwap-operator-dashboard)
- Time Ticket repository: [pgrundy16/dwap-time-ticket](https://github.com/pgrundy16/dwap-time-ticket)
- Dashboard M4–M5 verification: [`milestones-4-5-final-verification.md`](milestones-4-5-final-verification.md)
- Dashboard architecture: [`architecture.md`](architecture.md), [`data-contract.md`](data-contract.md), [`job-lifecycle.md`](job-lifecycle.md)
