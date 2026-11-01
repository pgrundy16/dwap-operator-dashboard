# Isolated test fixtures

These are sanitized, synthetic-data workbooks for reviewing the dashboard's data contract. They are not live business backups.

| File | Purpose |
| --- | --- |
| `booking-requests.xlsx` | Four booking tabs and the supplied intake/Jobs headers; two sample requests; no original customer rows, payment links, or contact details |
| `labour-allocations.xlsx` | Five labour/time-ticket tabs; original formula structure and validations; test worker IDs, rates, GL codes, and empty logs |
| `booking-intake/Code.gs` | Test-only booking intake script; writes to the test Sheet and test booking calendar, with all email/SMS sending removed |
| `supabase-booking/index.ts` | Test-only Supabase booking function; forwards synthetic requests to test Apps Script with server-held test credentials |

The booking workbook was rebuilt from the exported schema to remove customer data and residual links. Its tab names and headers are preserved, but source formatting and unused blank rows are not a byte-for-byte copy. The labour workbook retains its layout and 303 formulas. Formula caches were cleared so source totals cannot be carried into the fixture; Excel or Google Sheets recalculates when opened. A disposable recalculation check with a 1.25-hour sample entry produced 1.25 total hours and a 25 test gross cost.

## Upload and wire the test copies

1. Upload each `.xlsx` to the DWAP Google Drive and open or convert each as a separate **Google Sheet**. Keep access limited to the test team. Check the imported tabs, formulas, and dropdowns.
2. In the booking Sheet, create a new Apps Script project from `booking-intake/Code.gs`. Set its `TEST_SHEET_ID` to the new booking Sheet ID, `TEST_BOOKINGS_CALENDAR_ID` to the dedicated **test service booking** calendar, and `TEST_BOOKING_WEBHOOK_TOKEN` to a fresh random test-only value. The script accepts a `testToken` in POST JSON from a server-side caller. It does not send email or SMS.
3. Bind the dashboard's separate `apps-script/Code.gs` to the **test booking Sheet**. Set `JOBS_CALENDAR_ID` to the dedicated **test service lead** calendar and `DASHBOARD_API_TOKEN` to a different fresh random token. Configure the dashboard server endpoint with that token and this test Apps Script deployment URL; never put either value in a browser variable or Git.
4. In the test labour Sheet, set `Time Ticket Config` → `Booking Spreadsheet ID` to the new test booking Sheet ID. Keep office email fields blank or use test-only addresses. If testing the Time Ticket app, use its separate repository and test deployment; its current employee-ID authorization weakness remains open.
5. Deploy the separate `supabase-booking/index.ts` test variant with `TEST_BOOKING_WEBHOOK_URL` and `TEST_BOOKING_WEBHOOK_TOKEN` secrets, or call the test Apps Script from another controlled server-side test. Then run one synthetic booking and verify the intake row, Request ID, booking-calendar event, dashboard list, confirmation event in the lead calendar, and matching Time Ticket job key. Do not point the live website at these test resources.

No Google Sheet, Apps Script deployment, calendar, Vercel project, or live website configuration is changed by files in this repository. The test calendar IDs and all deployment secrets stay in Google/Vercel configuration, not in these fixtures.
