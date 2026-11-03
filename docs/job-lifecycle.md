# Job lifecycle and verification rules

## Model and evidence

The dashboard currently displays `NEW`, `DEPOSIT_SENT`, `CONFIRMED`, and `DONE`. Its Apps Script accepts `sendDeposit`, `confirmBooking`, and `completeJob`; the UI exposes all three buttons on a selected job. The supplied booking export has `Status` in both X and AB. X is mostly `NEW`, with a few anomalous values; AB includes `Reached Out`, `Quoted`, `Awaiting Client`, `Deposit Pending`, `Deposit Paid`, `Confirmed`, `Completed`, and `Lost/Cancelled`. These have **not** been reconciled with the dashboard's canonical states. The active test booking endpoint and both test calendars were observed on 2026-11-01; no dashboard Apps Script test deployment exists. This document separates the verified intake path, current dashboard source behavior, and desired calendar contract.

## Target canonical states

| State | Meaning | Entry evidence | Implementation status |
| --- | --- | --- | --- |
| `NEW` | Intake received; operator review/quote pending | Unique Request ID and booking row | Implemented as dashboard default for blank status |
| `QUOTED` | Quote prepared/approved internally; no customer delivery implied | Operator-approved quote and amounts | Not a dashboard state; quote/deposit action goes directly to `DEPOSIT_SENT` |
| `DEPOSIT_SENT` | Quote and deposit request recorded as sent | Operator records amounts, Square link, and send time; actual delivery is manual | Current code sets this when details are recorded, **without sending anything**; label is currently stronger than evidence |
| `CONFIRMED` | Operator has checked acceptance/payment and scheduling | Manual Square check and operator confirmation, or future verified Square event | Backend transition is restricted to `DEPOSIT_SENT`; the operator confirmation dialog attests manual checks, then a Jobs event is created and persisted. `depositPaid` is an operator attestation, not Square verification. |
| `DONE` | Work completed and operator has closed job | Manual completion and actual duration/payment reconciliation | Implemented as a manual button; no Square balance verification |
| `LOST` | Customer declined/quote expired | Operator reason/date | Proposed; appears in quoting instructions but not dashboard controls |
| `CANCELLED` | Previously accepted job cancelled | Operator reason/date, payment/calendar follow-up | Proposed; not implemented |

`Pending`, `Deposit Paid`, and `Completed` are **source or external labels**, not additional canonical dashboard states. Map `Pending` to `NEW` only after confirming its meaning; map `Completed` to `DONE` only with a deliberate migration. `Deposit Paid` is a payment fact, not a job lifecycle state. The two source status columns need explicit ownership and precedence. Unknown source values must be surfaced for review rather than silently treated as `NEW`.

## Allowed transitions

| From → to | Current trigger | Required verification in target flow |
| --- | --- | --- |
| Intake → `NEW` | Booking form writes row | Automatic: valid unique Request ID and accepted booking payload |
| `NEW` → `DEPOSIT_SENT` | Current `Record Quote and Deposit` action | Operator approves the quote and manually sends the Square request; dashboard records the amounts/link but does not prove delivery. The intake event stays on the lead calendar. |
| `DEPOSIT_SENT` → `CONFIRMED` | `Mark Confirmed` button | Backend accepts only this source state, checks calendar availability, creates/reuses a Jobs event and persists its ID. UI requires a manual acceptance/payment/schedule attestation. The lead event remains in place; transfer is not implemented. |
| `CONFIRMED` → `DONE` | `Mark Done` button | Backend accepts only CONFIRMED and requires explicit positive actual duration. Payment reconciliation remains manual. |
| `NEW`/`QUOTED`/`DEPOSIT_SENT` → `LOST` | Not implemented | Manual reason and date; no Jobs calendar event |
| `NEW`/`QUOTED`/`DEPOSIT_SENT`/`CONFIRMED` → `CANCELLED` | Not implemented | Manual reason; if confirmed, reconcile Square and cancel/update the calendar event |

The dashboard API and Apps Script validate transition source states. The interface also disables actions outside their supported states. Repeated transition requests are rejected; confirmation is idempotent when the job and matching marked calendar event are already confirmed.

## Square: manual now, automation later

At present the operator creates/sends Square payment requests outside the dashboard, enters amounts and an optional link in the dashboard, checks payment in Square, and manually presses `Mark Confirmed` or `Mark Done`. The dashboard does not create invoices, send customer messages, read Square payment status, or prove balance collection. `depositPaid` and `depositSentAt` are operator-side metadata, not verified Square events. Square remains the financial source of truth.

Planned automation may create a Square invoice/payment link and consume verified Square webhooks through a server endpoint. It must authenticate webhook signatures, correlate events by immutable Request ID and Square invoice/payment ID, handle retries idempotently, and store payment evidence separately from the lifecycle state. The quote agent may draft a recommendation, but operator approval remains a separate transition. Customer outbound messages require an explicit review/send step under the supplied quoting process.

## Calendar behavior and required transfer

The active test booking Apps Script creates an intake event in the **test service lead calendar** immediately after appending the `Sheet1` row. It writes the event ID to column Z, whose physical header currently says `Booking Calendar Event ID`. The observed event was `[NEW] JUNK — Sample Milestone 1 Verification` on Wednesday, November 4, 2026, 10:00–11:00 a.m. Toronto time, and Google Calendar identified its calendar as `Test Service Lead Calendar`. The event ID is present in Z. The script generates a fresh Request ID on each POST and has no retry deduplication.

The agreed lifecycle is: new requests live on the lead calendar; quote/deposit recording leaves them there; after the operator confirms acceptance/payment and schedule in the dashboard, the event moves to the **test service booking calendar**. The event on the booking calendar is then the scheduled-job event. Keep the lead-event reference and booking-event reference distinct; the current Z header is misleading and should be renamed or explicitly documented as the lead event ID when the test schema is next revised.

The checked-in dashboard Apps Script does **not** implement this transfer yet. `confirmBooking_` creates a new event through `JOBS_CALENDAR_ID` when no matching Jobs event exists, and stores that new ID in `Jobs.calendarEventId`. It validates the proposed Toronto date/time and duration, checks the entire Jobs calendar for conflicts, and recovers a created event by its Request ID marker after a failed sheet write. It does not read the lead event ID from column Z or move/delete the lead event, so confirmation can leave two events. Confirmed edits update the existing Jobs event and attempt rollback if sheet persistence fails. No dashboard Apps Script test deployment was available to exercise confirmation against Google. `JOBS_CALENDAR_ID` must target the test service booking calendar for the intended final state.

Current gaps: no lead-to-booking event transfer; no cancellation/removal path; no live Apps Script, Sheets, or Calendar verification; event recovery and capacity behavior remain mock-tested only. Event creation and Sheet writes cannot be made atomic across Google services, so a recovery/reconciliation path remains necessary.

## Test-environment verification

The intake test is verified: one sample-only request created a unique Request ID, a booking row, and exactly one lead-calendar event with an event ID in column Z. The quote/confirm and transfer stages remain unverified because no dashboard test deployment is present and the checked-in source does not move the lead event. Once that code is implemented and deployed to the test workbook, verify quote recording leaves the lead event untouched, confirmation transfers it once to the booking calendar, repeat confirmation does not create duplicates, the booking event ID is stored in `Jobs`, and Time Ticket receives the same Request ID-based job key. Use synthetic Square links or a test Square environment, never a live charge.
