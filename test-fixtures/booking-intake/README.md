# Booking intake test script

This is a sanitized copy of the supplied booking Apps Script for an **isolated test workbook**. It creates an intake row and an intake event on the test service lead calendar, then returns the Request ID and event ID. The active deployed test copy was observed writing that event ID into column Z; the current physical header says `Booking Calendar Event ID`, although this is the lead-calendar event. Customer email, internal email, and Twilio sending have been removed. It accepts only sample customer names with `example.com` email addresses and discards ad click IDs. It requires a test-only token; missing configuration fails closed.

Bind `Code.gs` and `appsscript.json` only to the sanitized booking workbook after importing it into a test Google Sheet. The manifest sets `America/Toronto`. Configure these Script Properties with fresh test-only values:

| Property | Value |
| --- | --- |
| `TEST_SHEET_ID` | ID of the imported, sanitized booking Sheet |
| `TEST_BOOKINGS_CALENDAR_ID` | The dedicated **test service lead** calendar ID; intake requests first appear here |
| `TEST_BOOKING_WEBHOOK_TOKEN` | A fresh random test token, held by a server-side caller only |

Send the test token as `testToken` in the POST JSON **from a server-side caller**. Do not put it in `BookingForm.tsx`, any `VITE_` variable, a public URL, or Git. The supplied `bookingApi.ts` invokes the live Supabase Edge Function named `booking`, which forwards to the live booking Apps Script with a server-held token in the URL. The separate `test-fixtures/supabase-booking/index.ts` variant forwards only synthetic requests to this test script with a fresh token in the POST body. Keep the live website and function unchanged during test setup.

The current intake script creates a new UUID for every accepted request and does not deduplicate retries. A calendar failure after the Sheet append can leave an intake row without an event; a retry can then create another row. This fixture preserves that behavior for inspection. Fix it before using the pattern in production.

The operator dashboard uses a separate Apps Script source in `apps-script/Code.gs`. Its **test deployment** must set `LEAD_CALENDAR_ID` to the dedicated test service lead calendar and `JOBS_CALENDAR_ID` to the dedicated test service booking calendar, plus fresh dashboard server credentials. Confirmation now creates/reconciles the Jobs event, verifies its Sheet ID, removes the lead event, then marks the booking confirmed. Local mocks cover retries; verify the handoff with the isolated deployment. Never reuse production Sheet IDs, calendar IDs, tokens, or customer data in this test environment.
