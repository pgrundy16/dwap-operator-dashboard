# Job lifecycle and verification rules

## Model and evidence

The dashboard currently displays `NEW`, `DEPOSIT_SENT`, `CONFIRMED`, and `DONE`. Its Apps Script accepts `sendDeposit`, `confirmBooking`, and `completeJob`; the UI exposes all three buttons on a selected job. The supplied booking export has `Status` in both X and AB. X is mostly `NEW`, with a few anomalous values; AB includes `Reached Out`, `Quoted`, `Awaiting Client`, `Deposit Pending`, `Deposit Paid`, `Confirmed`, `Completed`, and `Lost/Cancelled`. These have **not** been reconciled with the dashboard's canonical states. This document distinguishes current implementation from the target contract.

## Target canonical states

| State | Meaning | Entry evidence | Implementation status |
| --- | --- | --- | --- |
| `NEW` | Intake received; operator review/quote pending | Unique Request ID and booking row | Implemented as dashboard default for blank status |
| `QUOTED` | Quote prepared/approved internally; no customer delivery implied | Operator-approved quote and amounts | Proposed; current UI records directly as `DEPOSIT_SENT` |
| `DEPOSIT_SENT` | Deposit request actually delivered to customer | Operator records delivery channel, time, and Square link; later automation should record delivery result | Current code sets this when details are recorded, **without sending anything**; label is currently stronger than evidence |
| `CONFIRMED` | Operator has checked acceptance/payment and scheduling | Manual Square check and operator confirmation, or future verified Square event | Implemented as a manual button; current code sets `depositPaid=true` by default without independent proof and creates a Jobs calendar event |
| `DONE` | Work completed and operator has closed job | Manual completion and actual duration/payment reconciliation | Implemented as a manual button; no Square balance verification |
| `LOST` | Customer declined/quote expired | Operator reason/date | Proposed; appears in quoting instructions but not dashboard controls |
| `CANCELLED` | Previously accepted job cancelled | Operator reason/date, payment/calendar follow-up | Proposed; not implemented |

`Pending`, `Deposit Paid`, and `Completed` are **source or external labels**, not additional canonical dashboard states. Map `Pending` to `NEW` only after confirming its meaning; map `Completed` to `DONE` only with a deliberate migration. `Deposit Paid` is a payment fact, not a job lifecycle state. The two source status columns need explicit ownership and precedence. Unknown source values must be surfaced for review rather than silently treated as `NEW`.

## Allowed transitions

| From → to | Current trigger | Required verification in target flow |
| --- | --- | --- |
| Intake → `NEW` | Booking form writes row | Automatic: valid unique Request ID and accepted booking payload |
| `NEW` → `QUOTED` | Not implemented | Manual operator approval of quote; future quoting agent may propose numbers but cannot approve or send by itself |
| `QUOTED` → `DEPOSIT_SENT` | Current `Record Quote and Deposit` jumps here from any state | Manual proof that the Square link/message was actually sent; future automation requires successful send acknowledgement |
| `DEPOSIT_SENT` → `CONFIRMED` | `Mark Confirmed` button | Manual check of Square deposit/acceptance and schedule, then event creation; future webhook may provide payment evidence but should not bypass schedule review |
| `CONFIRMED` → `DONE` | `Mark Done` button | Manual job-completion check and balance reconciliation in Square |
| `NEW`/`QUOTED`/`DEPOSIT_SENT` → `LOST` | Not implemented | Manual reason and date; no Jobs calendar event |
| `NEW`/`QUOTED`/`DEPOSIT_SENT`/`CONFIRMED` → `CANCELLED` | Not implemented | Manual reason; if confirmed, reconcile Square and cancel/update the calendar event |

The target flow should reject skipped, backward, and repeated transitions unless an explicit correction workflow records who changed what and why. **Current code does not enforce this table:** it permits any of its three actions on any existing job, and the UI does not restrict buttons by status. Treat the table as an architecture decision for later implementation, not a claim about current enforcement.

## Square: manual now, automation later

At present the operator creates/sends Square payment requests outside the dashboard, enters amounts and an optional link in the dashboard, checks payment in Square, and manually presses `Mark Confirmed` or `Mark Done`. The dashboard does not create invoices, send customer messages, read Square payment status, or prove balance collection. `depositPaid` and `depositSentAt` are operator-side metadata, not verified Square events. Square remains the financial source of truth.

Planned automation may create a Square invoice/payment link and consume verified Square webhooks through a server endpoint. It must authenticate webhook signatures, correlate events by immutable Request ID and Square invoice/payment ID, handle retries idempotently, and store payment evidence separately from the lifecycle state. The quote agent may draft a recommendation, but operator approval remains a separate transition. Customer outbound messages require an explicit review/send step under the supplied quoting process.

## Calendar behavior

The supplied booking Apps Script creates a **service booking calendar** event immediately after appending the intake row, before notifications. It saves that event ID to intake column Z. It creates a fresh Request ID on each POST and has no retry deduplication. The checked-in dashboard Apps Script creates a separate **service lead/Jobs calendar** event **when `confirmBooking` runs**, provided the job is not already confirmed and has no `calendarEventId`. It uses `JOBS_CALENDAR_ID` from Script Properties, the preferred date/time (or 09:00 if time is missing), and estimated hours (or two hours if missing). Its event title combines service type and customer name; its description includes IDs, contact details, addresses, quote/balance, and notes. The returned event ID is saved in `Jobs`. Local mocked-service checks verified both event-building paths, but both real test calendars still need observed events and a repeat-submission/confirmation check. The two event IDs must remain separate.

Current gaps: no update to an event when date/time changes after confirmation; no cancellation/removal path; no rollback if event creation succeeds but writing `Jobs` fails; no independent check for a duplicate event when event ID is missing. These need explicit handling before the operational workflow is considered reliable.

## Test-environment verification

With one synthetic booking and a dedicated test calendar, verify: form submission produces a unique Request ID; dashboard `NEW` appears; quote recording does not send a customer message; confirmation creates exactly one event in the test calendar and persists its event ID; repeat confirmation does not duplicate it; Time Ticket uses the same Request ID-based job key; completion hides the job only after the configured retention period. Use synthetic Square links or a test Square environment, never a live charge.
