# Milestones 4–5: isolated acceptance checklist

Use only the test booking form, test spreadsheet, test lead and Jobs calendars, and the feature-branch Vercel Preview. Use synthetic contacts and no real payments or messages. Record PASS, FAIL, or BLOCKED and the error for each step. Stop a sequence when an expected result fails; keep the Request ID and event IDs private when sharing results.

## Setup and recovery

1. Deploy the latest dashboard `apps-script/Code.gs` to the existing **test** web app. Enable the **Calendar API** advanced service as `Calendar` (version v3), or apply `apps-script/appsscript.json`; authorize the test project if prompted. If it uses a standard Google Cloud project, the Calendar API must also be enabled there. Keep the test spreadsheet, lead calendar, Jobs calendar, and dashboard token Script Properties unchanged. Deploy a new version of the existing web app so its URL remains stable.
2. Open the Preview for this branch. Confirm it targets that test deployment. Confirm the Sheet and both calendars use the intended test copies. Keep the partially transferred synthetic bookings for recovery testing.
3. Pick one previously stuck `DEPOSIT_SENT` booking whose Jobs event ID is populated and whose Jobs event still matches its Request ID. Retry **Mark Confirmed** once. **PASS:** status becomes `CONFIRMED`, the same Jobs event ID remains, exactly one matching Jobs event exists, and no active matching lead event remains. If it fails, stop and record the exact message; do not edit status manually. A missing or foreign Jobs event must fail rather than create a duplicate.

## A. Intake and quote

4. Submit a fresh synthetic booking for a free future slot, for example 9:00 AM Toronto, using the test booking form. **PASS:** one intake row with a stable Request ID, one event on the lead calendar, no Jobs event, and dashboard status `NEW`; date/time agree in all views.
5. Edit the proposed time to 10:00 AM, enter an operator note, quote $700 and deposit $200, then **Record Quote and Deposit**. **PASS:** dashboard, intake row, Jobs row, and the same lead event show 10:00 AM; note persists in the Jobs row and dashboard; status is `DEPOSIT_SENT`; balance is $500. The lead event remains on the lead calendar; there is no Jobs event. Refresh and check again. The action records a manual step; no Square payment is verified or sent.
6. Try invalid times/dates, negative amounts and a deposit greater than the quote. **PASS:** each is rejected without changing the saved record or calendar. Cancel a confirmation dialog and verify no mutation occurs. Verify valid telephone/email links and that missing contact details do not create broken links.

## B. Confirmation and retry

7. For the booking above, verify its date, time, and duration are valid and the Jobs calendar slot is free. Click **Mark Confirmed**. **PASS:** status `CONFIRMED` survives refresh; one Jobs event has correct date/time, duration, and synthetic details; the Jobs event ID persists; the matching lead event is no longer active; the distinct lead ID remains as history.
8. Use another fresh synthetic `DEPOSIT_SENT` booking and open it in two dashboard tabs. Confirm near-simultaneously. **PASS:** after both finish and after refresh there is one matching Jobs event, one stored Jobs event ID, and a consistent confirmed state. If an attempt returns an error, record it and inspect both calendars before retrying.

## C. Conflict and alternatives

9. Create a second synthetic booking overlapping a confirmed Jobs event and record its quote. Try to confirm. **PASS:** a conflict is shown with free suggested alternatives or an explicit no-alternatives message; the booking stays `DEPOSIT_SENT`, its lead event stays active, and no new Jobs event is created.
10. Choose a suggestion manually, save the booking edit, and confirm. **PASS:** intake row and lead event update before confirmation; afterward exactly one Jobs event is created at the chosen time and status is `CONFIRMED`. Suggestions must never be booked automatically.

## D. Editing and rescheduling by lifecycle stage

11. **NEW:** change date only, then time only, and edit a note; save and refresh each time. **PASS:** intake row, Jobs row, dashboard, and existing lead event agree; Request ID and lead event ID remain stable; no Jobs event exists.
12. **DEPOSIT_SENT:** repeat date-only, time-only, and note edits; refresh. **PASS:** the same lead event is updated in place and all pre-confirmation schedule views agree. Test a proposed conflicting time: the edit may be saved, but confirmation must reject the conflict until a free time is selected.
13. **CONFIRMED:** change date only, then time only, and edit a note. **PASS:** the existing Jobs event updates without changing its event ID or creating a duplicate; the dashboard and Jobs row persist the new values. Inspect the original intake row as well: current code does not write confirmed reschedules back to it, so record any mismatch as an open cross-system issue. Test a conflicting reschedule and verify the prior Jobs event and saved record stay unchanged.
14. **DONE:** after completing step E, try changing date/time. **PASS:** rescheduling is rejected and the saved record and calendar remain unchanged. Check notes and balance controls separately.

## E. Completion and balance

15. On a confirmed synthetic job, enter a positive actual duration and click **Save booking edits**. Refresh; verify the duration persists. Click **Mark Done**, confirm the dialog, and refresh. **PASS:** status `DONE` and duration persist; no success is displayed on a failed request.
16. Once `DONE`, check **Balance collected (operator-verified)** and click **Save booking edits**. Refresh. **PASS:** the checkbox remains checked and dashboard metrics reflect it. Balance due is calculated from quote minus deposit and stays read-only. This checkbox is a manual attestation, not Square verification.

## F. Errors and final review

17. Confirm authentication still gates jobs, signing out blocks access, and an expired session prompts sign-in. Verify desktop and mobile layout, loading/empty/error states, refresh and retry, and contact links. Use a separate disposable test deployment for missing calendar, denied access, and deliberate Sheet or Calendar failures; do not break a shared working deployment.
18. Record which cases were actually run, any error messages and changed records, and any skipped concurrency, DST, permission, or rollback checks. The local tests cover some failure simulations, but they are not evidence that Google or Vercel integration passed. Do not merge into `main` until the requested acceptance checks and known gaps are reviewed.
