# DWAP test booking website

A small Vite/React form for submitting a synthetic booking to the isolated Supabase Edge Function. It calls `https://<project>.supabase.co/functions/v1/booking` directly with the project's **publishable** key in the `apikey` header; it never has the Apps Script token. The backend function and Apps Script enforce the sample-only customer rule too.

## Configure locally

1. Copy `.env.example` to `.env.local` if you are setting up on another computer. On the current computer, the ignored `.env.local` is already configured for the supplied test project.
2. Set `VITE_SUPABASE_URL` to the test Supabase project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its publishable key.
3. From the dashboard repository root, run `npm install`, then `npm run dev --prefix test-fixtures/booking-site`.
4. Submit the default sample form. Confirm the new request in the test Sheet and test lead calendar.

The supplied test function validates `Sample` names, `example.com` email, `55501xxxxx` phone, selected service, date/time, helpers, and selected-address place ID. The form uses fixed synthetic place IDs and Montreal sample addresses; it does not call Google Maps.

## Deploy a separate Vercel site

1. Push this folder to GitHub as part of the dashboard repository. In Vercel, add a **second project** connected to the same repository; this will deploy the booking test form separately from the dashboard.
2. Set **Root Directory** to the repository root (`./`), **Framework Preset** to Vite, install command to `npm install`, build command to `npm run build --prefix test-fixtures/booking-site`, and output directory to `test-fixtures/booking-site/dist`.
3. In the Vercel project settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Preview. Do not add any Apps Script token or service-role key.
4. Enable Vercel Authentication for preview deployments, deploy a non-main branch, and open the generated preview URL while signed into your Vercel account. Verify one synthetic submission in the test Sheet and lead calendar.

Do not point this app at the production Supabase project, booking script, Sheet, or calendar. Keep the deployed test Edge Function sample-only. The test function's in-memory rate limit is not suitable as a production abuse control. Keep Production environment variables unset and do not make the form publicly reachable; anyone who can reach it could create synthetic rows and calendar events.
