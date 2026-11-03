# Isolated test fixtures

These are sanitized, synthetic-data workbooks for reviewing the dashboard's data contract. They are not live business backups.

| File | Purpose |
| --- | --- |
| `booking-requests.xlsx` | Four booking tabs and the supplied intake/Jobs headers; two sample requests; no original customer rows, payment links, or contact details |
| `labour-allocations.xlsx` | Five labour/time-ticket tabs; original formula structure and validations; test worker IDs, rates, GL codes, and empty logs |
| `booking-intake/Code.gs` | Test-only booking intake script; writes to the test Sheet and test lead calendar, with all email/SMS sending removed |
| `supabase-booking/index.ts` | Test-only Supabase booking function; forwards synthetic requests to test Apps Script with server-held test credentials |

The booking workbook was rebuilt from the exported schema to remove customer data and residual links. Its tab names and headers are preserved, but source formatting and unused blank rows are not a byte-for-byte copy. The labour workbook retains its layout and 303 formulas. Formula caches were cleared so source totals cannot be carried into the fixture; Excel or Google Sheets recalculates when opened. A disposable recalculation check with a 1.25-hour sample entry produced 1.25 total hours and a 25 test gross cost. The linked Google Drive copies are currently still Excel-format workbooks in Office editing mode, use United States locale and Pacific time, and are public to anyone with their links. Convert them to native Google Sheets, set the test time zone to Toronto, and restrict sharing before connecting the test apps.

## Upload and wire the test copies

1. Upload each `.xlsx` to the DWAP Google Drive and open or convert each as a separate **Google Sheet**. Keep access limited to the test team. Check the imported tabs, formulas, and dropdowns.
2. In the booking Sheet, create a new Apps Script project from `booking-intake/Code.gs`. Set its `TEST_SHEET_ID` to the new booking Sheet ID, `TEST_BOOKINGS_CALENDAR_ID` to the dedicated **test service lead** calendar, and `TEST_BOOKING_WEBHOOK_TOKEN` to a fresh random test-only value. The script accepts a `testToken` in POST JSON from a server-side caller. It does not send email or SMS.
3. Deploy the dashboard's separate `apps-script/Code.gs` as a standalone test script. Set `LEAD_CALENDAR_ID` to the dedicated **test service lead** calendar, `JOBS_CALENDAR_ID` to the dedicated **test service booking** calendar, and `DASHBOARD_API_TOKEN` to a different fresh random token. Configure the dashboard server endpoint with that token and the test Apps Script deployment URL; never put either value in a browser variable or Git.
4. In the test labour Sheet, set `Time Ticket Config` → `Booking Spreadsheet ID` to the new test booking Sheet ID. Keep office email fields blank or use test-only addresses. If testing the Time Ticket app, use its separate repository and test deployment; its current employee-ID authorization weakness remains open.
5. The booking intake test has been run once: it created a synthetic row, UUID Request ID, and lead-calendar event. Once the dashboard transfer code is implemented and deployed, verify quote recording leaves that event in lead, confirmation moves it to the booking calendar once, and the booking-calendar event ID is stored in `Jobs`. Then verify the matching Time Ticket job key. The test Supabase function is not deployed; the live website was not pointed at these resources.

Repository files do not deploy or configure Google/Vercel resources. During verification, one sample-only booking row and its lead-calendar event were created in the supplied test environment; they are safe to remove after testing. No production Sheet, calendar, Apps Script, Vercel project, or live website configuration was changed. Test calendar IDs and deployment secrets stay in Google/Vercel configuration, not in these fixtures.
