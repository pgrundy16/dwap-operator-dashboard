# Supabase booking test function

This is an isolated variant of the supplied live `booking` Edge Function. It preserves the form payload contract and forwards **sample-only** requests to the sanitized booking Apps Script. It uses fresh test-only Supabase secrets:

| Secret | Meaning |
| --- | --- |
| `TEST_BOOKING_WEBHOOK_URL` | Deployed test booking Apps Script `/exec` URL |
| `TEST_BOOKING_WEBHOOK_TOKEN` | Same fresh test token as the Apps Script's `TEST_BOOKING_WEBHOOK_TOKEN` property |

The function sends the token in POST JSON as `testToken`, never in the URL. It removes any ad click ID and accepts only a `Sample` customer name, `example.com` email, and `55501xxxxx` test phone. The Apps Script repeats those checks and does not send email or SMS. The in-memory rate limit is only a lightweight test guard; it is not a durable production abuse control.

Deploy this under a **separate test function name or separate Supabase project**, and invoke it only from a staging/test client or server-side test call. The live `BookingForm.tsx` and `bookingApi.ts` remain unchanged and keep calling the live `booking` function. Do not replace the live function or its secrets as part of this test setup.
