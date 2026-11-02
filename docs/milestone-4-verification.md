# Milestone 4 — operator booking management

This feature branch adds editable proposed schedule, quote and deposit, operator notes, actual duration, balance-collected state, contact links, guarded lifecycle actions, confirmation dialogs, and reload-based persistence checks.

## Manual acceptance checks (synthetic test environment only)

- Start with a NEW synthetic request. Edit date/time, quote, deposit, notes, duration. Save, reload and confirm changes persisted in the Jobs sheet.
- Record a quote/deposit. Confirm NEW -> DEPOSIT_SENT, then DEPOSIT_SENT -> CONFIRMED, then CONFIRMED -> DONE. Test that premature and repeated transitions fail through the API and Apps Script.
- Verify confirmation creates one booking-calendar event. Change date/time when CONFIRMED and verify the existing event is moved, not duplicated.
- On CONFIRMED, save actual duration before completing. On DONE, record balance collected; confirm it persists after reload. The flag is operator-attested, not verified by Square.
- Test missing/invalid date, time, currency, duration and excessively long notes. Check invalid IDs and cross-matched IDs are rejected.
- Confirm demo mode is read-only and customer phone/email contact links work on mobile.
- Check that unsaved edits are not assumed persisted. Test session expiry and unauthorized API calls.

## Deployment notes

The `apps-script/Code.gs` changes must be deployed as a new Apps Script Web App version to the isolated test environment, and the dashboard's Vercel test environment must use that deployment URL. Do not connect production bookings or payment flows before manual acceptance checks. This branch has not been tested against a live Google Apps Script deployment. Customer communication and Square payment verification remain manual, and existing lead-to-booking-calendar event transfer is not implemented in this milestone.
