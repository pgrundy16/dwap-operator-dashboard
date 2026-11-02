# Milestone 5 — Calendar synchronization handoff

## Branch and intended commit
- Branch: `feat/milestone-5-calendar-synchronization`
- Based on: `feat/milestone-4-operator-booking-workflow` (not `main`; merge Milestone 4 first)
- Final commit label: `feat: implement idempotent job calendar synchronization`
- Do not merge until the real integration checklist passes.

## Implemented
- Booking intake `Sheet1`'s calendar event ID is mapped to `bookingCalendarEventId`, separately from the `Jobs` calendar's `calendarEventId`. Verify the booking intake header in the deployed workbook.
- Confirmation uses Apps Script's script-level lock, and safely reuses the stored Jobs calendar event ID.
- When a calendar event was created but the sheet save failed, retries search for the exact `DWAP-Request-ID` marker in Jobs event descriptions to recover the event rather than creating another. A duplicate marker causes a manual reconciliation error.
- Reject confirmation when the requested slot is occupied; propose up to three later free 30-minute candidates within the next 12 hours. These are calendar-free alternatives only—not automatically approved customer or crew times.
- Confirmation stores and re-reads the Jobs event ID. Repeated confirmation is idempotent as long as event and Sheet data agree.
- Rescheduling confirmed bookings checks for overlaps, updates the existing event, retains its ID, and rolls back event time when saving the updated Sheet fails. If rollback itself fails, the operator receives a manual-reconciliation error.
- Invalid dates/times, missing calendar access, missing events and conflicting event times fail closed.
- The authenticated API exposes limited, actionable calendar errors to the dashboard; other upstream exceptions remain masked.
- New `tests/calendar-sync.test.js` contains synthetic mock tests.

## Local verification on Mac
1. Fetch the branch: `git fetch origin && git switch feat/milestone-5-calendar-synchronization`.
2. Run `npm test` and `npm run build`. Fix any failures before merge.
3. Deploy this branch's `apps-script/Code.gs` to a **test** standalone Apps Script deployment and configure `DASHBOARD_SPREADSHEET_ID`, `JOBS_CALENDAR_ID`, and `DASHBOARD_API_TOKEN` with synthetic/test resources. Deploy the Vercel backend pointing at that test endpoint.
4. Confirm booking intake `Sheet1` maps the actual source calendar ID into `bookingCalendarEventId`. If the intake calls this field something other than `Calendar Event ID`, add its explicit header alias before live use. Ensure it is not incorrectly used as a Jobs event ID.
5. Create a synthetic DEPOSIT_SENT booking. Confirm it and verify exactly one Jobs event appears; verify `Jobs.calendarEventId` matches the actual Jobs calendar event and survives refresh.
6. Confirm again and repeat an identical API request. Verify one event and the same persisted ID. Test a simulated Sheet save failure after event creation and retry; verify recovery without another event.
7. Create a competing event in the test Jobs calendar during the desired period. Confirm a second synthetic booking for that slot. Expect an actionable conflict and suggestions; verify no new Jobs event or confirmed status.
8. Select one suggested time in the dashboard, save it, and reconfirm. Verify a new event appears only after the operator explicitly saves the new time.
9. Reschedule an already confirmed job. Verify the existing Jobs event changes time, event ID remains stable, and no second event is created. Check conflict rejection leaves both Sheet and event time unchanged.
10. Delete an associated Jobs event manually; verify confirmation/rescheduling reports a reconciliation problem rather than silently creating a replacement.
11. Validate time zone behavior around DST, including the spring-forward missing hour. Verify intended handling of the fall-back repeated hour before using either boundary in production.
12. Test two near-concurrent confirmation calls to verify the Apps Script lock; verify event creation failures and Sheet failures are visible to operators.
13. Verify no live customer/employee data or credentials appear in logs, screenshots, git history, or fixtures.
14. Merge Milestone 4 into `main` before merging Milestone 5; review branch comparison and CI status first.

## Known limitations and operational considerations
- Calendar conflict detection considers **all events** on the Jobs calendar busy. It is not a staff/vehicle-capacity scheduler and does not consult other calendars. If the business supports concurrent jobs, define capacity rules before enforcing this in production.
- Suggested alternatives are only nearby free time slots; business hours, routing, crew assignments and customer acceptance are not assessed.
- Event recovery searches a 14-day window around the scheduled slot. Missing IDs or moved events outside this window require manual reconciliation.
- CalendarApp and Sheets are not one transaction. Recovery and rollback reduce duplicate/out-of-sync cases but cannot guarantee atomicity across services.
- Do not assume modifying the Jobs event also moves or deletes the intake booking-calendar event; that is intentionally a separate record.
- The source code was updated through GitHub. **Live Google Calendar and Google Sheets verification has not been performed here.**
