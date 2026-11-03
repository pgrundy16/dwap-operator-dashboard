# Milestones 4–5 final verification

**Verification branch:** `feat/milestone-5-calendar-synchronization`  
**Base:** Milestone 5 descends from Milestone 4; both descend from the existing Milestone 0–3 `main` history.  
**Scope:** Local source, synthetic Apps Script mocks, API tests, browser demo, and production build. No live Google, Vercel, or Supabase calls were made in this audit.

## Summary

Local implementation and regression tests pass after this verification pass. A user-run test of the prior Preview reported a 9:00 intake time appearing as noon in the Dashboard, then 3:00 PM after quote recording, while the booking sheet remained at 9:00; the note was also missing. Source review found Pacific-time workbook cells being formatted as Toronto and the quote action omitting the edited schedule/note. The local fix reads Date-valued cells in the workbook timezone and saves schedule/note before recording the quote, updating the intake row and lead event together. The updated Apps Script and UI have not yet been redeployed and retested against Google. The retry-safe lead-to-booking handoff remains locally mock-tested. **Recommendation: NOT READY TO MERGE until the updated Preview and isolated Google checks pass.**

## Milestone 4 — Operator booking management

| Requirement | Result | Evidence / limitation |
|---|---|---|
| Edit proposed date and time | **PASS — local; live retest required** | Pre-confirmation edits now update the Jobs record, source booking row, and existing lead event; confirmed edits reschedule the existing Jobs event. Tests cover persistence behavior. User-reported Pacific/Toronto offset still needs retesting with the updated Apps Script. |
| Edit quote, deposit, and notes | **PASS — local; live retest required** | Quote recording now saves the current schedule and operator note before amounts/status. Gateway and Apps Script validate amounts, cents, deposit/quote relationship, and note length/control characters; record is reloaded for comparison. |
| Record actual duration | **PASS — local** | Completion requires a positive explicit actual duration; it no longer falls back to estimated duration. |
| Mark balance collected | **PASS — local** | Boolean is persisted and can only be marked true for `DONE`; UI labels it operator-verified, not Square-verified. |
| Invalid/missing/excessive input | **PASS — local** | Automated tests cover invalid dates/times, negative or excessive amounts, invalid payment URLs, unsupported input, duration, and inconsistent quote/deposit/balance. Calendar layer rejects invalid dates, durations, and Toronto DST gaps/repeated times. |
| Values survive refresh/backend reload | **PASS — mocked** | Apps Script write paths reload and compare persisted values; frontend reloads the job list after mutation and checks the saved fields. Google persistence itself is unverified. |
| No failed request shown as successful save | **PASS — local** | Mutation errors are displayed; save success is only reflected after reload/readback. Calendar rollback failures are returned as actionable reconciliation errors. |
| Phone and email actions | **PASS — local** | Automated tests cover valid mobile `tel:` / `mailto:` links and missing/malformed values. Demo UI inspection showed these rendered as links. |
| Server-side lifecycle enforcement | **PASS — mocked** | Apps Script accepts deposit recording only from `NEW`, confirmation only from `DEPOSIT_SENT` or already-confirmed retry, and completion only from `CONFIRMED`; invalid source states fail. UI buttons are status-gated. |
| Confirmation dialogs / cancel behavior | **PASS — source review** | `window.confirm` guards quote recording, confirmation, completion, and saves before making requests. Cancel returns before the mutation call. No automated browser interaction test was added for native dialogs. |
| Calendar failure cannot produce confirmed success | **PASS — mocked** | Calendar configuration, conflict, and event-creation errors happen before status persistence. After creation, the script reads back the event ID; a lost write is surfaced and retried through the Request ID marker. |
| Financial calculations and Square distinction | **PASS — local** | Balance is derived as quote less deposit, cents are retained, deposits cannot exceed quote, and dashboard labels describe operator attestation. Square invoice, payment, and webhook verification remain manual and are not implemented. |

## Milestone 5 — Calendar synchronization

| Requirement | Result | Evidence / limitation |
|---|---|---|
| Lead event ID and Jobs event ID are distinct | **PASS — source/mocks** | Source header aliases map intake ID to `leadCalendarEventId`; `Jobs.calendarEventId` is reserved for the confirmed Jobs event. Mock verifies the mapping. Actual live headers were not re-read in this session. |
| Stable Request ID used for reconciliation | **PASS — mocked** | Created Jobs event carries `DWAP-Request-ID`; missing Sheet write recovery searches by exact marker and rejects multiple matches. |
| Create correct Jobs event, time, duration, metadata | **PASS — mocked** | Tests assert event creation in configured calendar mock, Toronto start/end, event details, and persisted event ID. Live calendar target/configuration is unverified. |
| Persist event ID and verify confirmation | **PASS — mocked** | Confirmation reloads the booking and checks the event ID before returning success. |
| Retry/double confirmation duplicate prevention | **PASS — sequential mock** | Repeated confirmation reuses a matching event. Failed and silently lost Sheet writes recover on retry without another event. |
| Concurrent confirmation | **BLOCKED — live concurrency** | Apps Script acquires a script lock on each mutation; the mock tests sequential retries, not simultaneous Google executions. Verify two concurrent requests on the isolated deployment. |
| Duplicate Request ID markers / missing or deleted event | **PASS — mocked** | Duplicate markers, foreign IDs, and missing stored events fail closed with reconciliation messages. |
| Rescheduling date/time and event ID | **PASS — mocked** | Date-only and time-only edits update the same event ID; completed jobs cannot be rescheduled. Event title/description/location refresh with relevant record changes. |
| Failed calendar or Sheet reschedule | **PASS — mocked** | Conflict leaves the Sheet and event unchanged. Sheet write failure rolls back event edits; failed rollback is explicitly reported. |
| Conflict policy | **PASS — implemented; business capacity unverified** | All overlapping events on the configured Jobs calendar count as busy. This is the conservative default for a dedicated single-capacity calendar. It is not a crew/vehicle capacity model; if simultaneous jobs are valid, model calendars/resources before using this policy operationally. |
| Alternative time suggestions | **PASS — mocked** | Suggestions are later 30-minute candidates, checked against the calendar and Toronto DST resolution; they are suggestions only and are not automatically booked. Business hours, travel time, routing, and crew availability are not evaluated. |
| Calendar API/network/permission failures | **PASS — mocked / live blocked** | Missing configuration/calendar, denied lookup, create failure, and persistence failures are covered by mocks. Google API outages, real permissions, and network timeout behavior were not tested against Google. |
| Lead-to-booking calendar transfer | **PASS — mocked; live test blocked** | Confirmation creates/reconciles the Jobs event, persists its ID, deletes the matching lead event, verifies its removal, then saves `CONFIRMED`. Tests cover failures deleting the lead event and failures persisting final status without creating duplicate Jobs events. Deploy with `LEAD_CALENDAR_ID` and verify in Google before merge. |

## Test and build results

- `npm test`: **PASS**, 47 tests, 47 passed, 0 failed.
- `npm run build`: **PASS**, Vite production build completed.
- `git diff --check`: **PASS**.
- Lint/type-check: **NOT CONFIGURED** in `package.json`; no dedicated lint or TypeScript check script exists.
- Browser: **PASS — demo smoke check** at `http://127.0.0.1:5173/?demo=1`; synthetic job, demo warning, disabled mutations, safe contact links, and workflow controls were visible. Responsive breakpoints were source-reviewed, but a narrow viewport was not available in this UI session.
- Secret-pattern scan of the current project tree: **PASS — no matches** for common Google/Supabase/Square key forms, exposed bearer tokens, or private-key headers. This is a pattern scan, not a full historical Git-secret audit. Test fixtures are synthetic; keep them synthetic.

### Automated test coverage added or strengthened

- `tests/calendar-sync.test.js`: event creation/recovery, retries, conflict suggestions, duplicate markers, separate event identity, rescheduling, transaction rollback, missing configuration/permissions, DST boundaries, and lifecycle source states.
- `tests/security.test.js`: strict gateway validation, cents and balance rules, contact link safety, metrics, and safe calendar rollback error reporting without leaking arbitrary upstream errors.
- Apps Script script-lock acquisition and persistence readback are exercised through deterministic mocks; these do not emulate Google service transaction/concurrency guarantees.

## Fixes made during verification

- Corrected malformed/double-escaped validation expressions that prevented API startup or input checks from working.
- Hardened date/time, amount, cents, quote/deposit/balance, note, completion-duration, and lifecycle validation at the API and Apps Script trust boundaries.
- Added persisted-value readback after mutations and removed frontend assumptions of success before reload verification.
- Made confirmation retries find the matching Request ID event; reject foreign IDs and duplicate markers; persist and verify the Jobs event ID.
- Made confirmed rescheduling update existing event metadata and time with Sheet verification and calendar rollback handling.
- Fixed calendar alternative duration calculation and ensured suggestions are actually free in the mock calendar.
- Added Toronto local-time handling that rejects nonexistent and ambiguous DST local times.
- Fixed Pacific-sheet/Toronto-dashboard time normalization for Date-valued cells, and made quote recording persist the edited date, time, and note before changing status. Pre-confirmation schedule edits now update the source booking row and existing lead event with rollback on failure.
- Added safe customer contact links and clarified manual payment status labels.
- Updated architecture and lifecycle notes to correct stale claims about status enforcement and event mapping.
- Removed a duplicated dashboard header block and removed estimated-duration fallback from completion.

## Integration tests and blockers

**Live integration: BLOCKED / NOT RETESTED AFTER FIX.** The user's manual test of the earlier Preview revealed a timezone mismatch and missing quote-save fields. The updated code is local only so far; the new Apps Script must be deployed and the same synthetic booking retested before any further lifecycle testing. No live data, production credentials, or deployments were changed by this code review. Local mocks do not prove actual authorization, calendar event semantics, Sheets header behavior, or concurrent locking in Google.

## Required isolated-environment verification

1. Deploy this branch's Apps Script as a standalone project and configure its test spreadsheet ID, lead calendar ID, Jobs calendar ID, token, and any other server-side values using synthetic test resources.
2. Use the test workbook and test calendars only. Confirm physical source headers and timezone are aligned with the documented `leadCalendarEventId` / `calendarEventId` separation.
3. Verify the implemented lead-to-booking handoff and failure/retry path so the operator never sees confirmation success while the two calendars disagree.
4. Test confirmation twice and with two near-concurrent requests; confirm one Jobs event, stable Request ID, event ID persistence, and correct lifecycle status.
5. Test conflict, alternatives, reschedule success, Sheet write failure, calendar rollback failure, deleted events, permission denial, and DST-boundary cases in test resources.
6. Test the dashboard against the isolated Apps Script deployment through its Vercel preview; verify session expiry, mobile layout, and all save/reload workflows.
7. Keep Square manual and verify payment in Square outside the dashboard. Do not interpret the dashboard's operator-attested field as Square evidence.

## Recommendation

**NOT READY TO MERGE.** Local automated tests and build pass, including the transfer implementation, but live Google service integration remains untested. Do not merge or use this branch operationally until the isolated Google/Vercel acceptance steps above pass. No merge into `main` was performed.
