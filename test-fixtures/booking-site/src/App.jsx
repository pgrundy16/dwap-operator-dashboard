import { useState } from "react";

const TEST_NAME = "Sample Test Customer";
const TEST_EMAIL = "sample@example.com";
const TEST_PHONE = "5550101000";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

const initialForm = {
  serviceType: "move",
  fullName: TEST_NAME,
  email: TEST_EMAIL,
  phone: TEST_PHONE,
  date: defaultDate(),
  time: "09:00",
  helpersNeeded: "1",
  estimatedHours: "2",
  pickup: "TEST PICKUP — Montreal, QC",
  dropoff: "TEST DROPOFF — Montreal, QC",
  elevatorAtPickup: false,
  elevatorAtDropoff: false,
  stairsInvolved: false,
  notes: "Synthetic test booking. No real customer data.",
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState(null);

  const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const needsDropoff = form.serviceType === "move" || form.serviceType === "delivery";

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setResult(null);
  }

  async function submit(event) {
    event.preventDefault();
    setResult(null);

    if (!isConfigured) {
      setResult({ ok: false, message: "Supabase is not configured. Add the two VITE settings in Vercel or .env.local." });
      return;
    }
    if (!/^sample\b/i.test(form.fullName.trim()) || !/^[^@]+@example\.com$/i.test(form.email.trim()) || !/^55501\d{5}$/.test(form.phone.replace(/\D/g, ""))) {
      setResult({ ok: false, message: "This test site accepts synthetic details only: a name beginning with Sample, an example.com email, and a 55501xxxxx phone." });
      return;
    }

    const duration = form.serviceType === "delivery" ? 120 : Number(form.estimatedHours) * 60;
    const payload = {
      serviceType: form.serviceType,
      contact: { fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() },
      preferred: { date: form.date, time: form.time },
      ...(Number.isFinite(duration) && duration > 0 ? { estimatedDurationMinutes: duration } : {}),
      helpersNeeded: Number(form.helpersNeeded),
      addresses: {
        pickup: { formattedAddress: form.pickup.trim(), placeId: "TEST_PICKUP_PLACE_ID", lat: 45.5017, lng: -73.5673 },
        ...(needsDropoff ? { dropoff: { formattedAddress: form.dropoff.trim(), placeId: "TEST_DROPOFF_PLACE_ID", lat: 45.5088, lng: -73.5878 } } : {}),
      },
      access: {
        elevatorAtPickup: form.elevatorAtPickup,
        elevatorAtDropoff: form.elevatorAtDropoff,
        stairsInvolved: form.stairsInvolved,
      },
      details: { testRecord: "Synthetic test website submission" },
      additionalNotes: form.notes.trim(),
      clientSubmittedAt: new Date().toISOString(),
      gclid: "",
    };

    setIsSending(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/booking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || `Booking function returned HTTP ${response.status}.`);
      }
      setResult({ ok: true, message: "Test booking accepted by Supabase.", requestId: data.requestId, eventId: data.eventId });
    } catch (error) {
      setResult({ ok: false, message: error.message || "Could not reach the booking function." });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="DWAP test booking home"><span>DW</span> / TEST</a>
        <span className="environment-tag"><i /> Isolated test environment</span>
      </header>

      <section className="intro" id="top">
        <p className="eyebrow">BOOKING PIPELINE CHECK</p>
        <h1>Send a test<br /><em>booking request.</em></h1>
        <p className="intro-copy">This small test form sends a synthetic request to the isolated Supabase <code>booking</code> function and its test Sheet.</p>
      </section>

      <section className="warning" role="note">
        <span className="warning-icon">!</span>
        <p><strong>Test records only.</strong> This form is locked to sample-style contact details. The address place IDs are placeholders. Do not enter real customer information.</p>
      </section>

      {!isConfigured ? <p className="config-warning" role="alert">Supabase settings are missing. Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.</p> : null}

      <form className="booking-form" onSubmit={submit}>
        <div className="form-heading"><span>01</span><h2>Request details</h2></div>
        <label className="field">
          <span>Service type</span>
          <select value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
            <option value="move">Move</option><option value="junk">Junk removal</option><option value="delivery">Delivery</option>
          </select>
        </label>

        <div className="form-heading form-heading--spaced"><span>02</span><h2>Test contact</h2></div>
        <div className="fields-two">
          <label className="field"><span>Name <small>must begin with “Sample”</small></span><input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required /></label>
          <label className="field"><span>Email <small>example.com only</small></span><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></label>
        </div>
        <div className="fields-two">
          <label className="field"><span>Phone <small>55501xxxxx test number</small></span><input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required /></label>
          <label className="field"><span>Helpers</span><select value={form.helpersNeeded} onChange={(e) => update("helpersNeeded", e.target.value)}><option value="1">1 helper</option><option value="2">2 helpers</option></select></label>
        </div>

        <div className="form-heading form-heading--spaced"><span>03</span><h2>Preferred schedule</h2></div>
        <div className="fields-two">
          <label className="field"><span>Date <small>Montreal time</small></span><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required /></label>
          <label className="field"><span>Start time</span><input type="time" value={form.time} onChange={(e) => update("time", e.target.value)} required /></label>
        </div>
        {form.serviceType !== "delivery" ? <label className="field"><span>Estimated hours</span><input type="number" min="0.5" max="24" step="0.5" value={form.estimatedHours} onChange={(e) => update("estimatedHours", e.target.value)} /></label> : null}

        <div className="form-heading form-heading--spaced"><span>04</span><h2>Test addresses</h2></div>
        <label className="field"><span>Pickup address</span><input value={form.pickup} onChange={(e) => update("pickup", e.target.value)} required /></label>
        {needsDropoff ? <label className="field"><span>Drop-off address</span><input value={form.dropoff} onChange={(e) => update("dropoff", e.target.value)} required /></label> : null}
        <div className="check-row">
          <label><input type="checkbox" checked={form.elevatorAtPickup} onChange={(e) => update("elevatorAtPickup", e.target.checked)} /> Elevator at pickup</label>
          {needsDropoff ? <label><input type="checkbox" checked={form.elevatorAtDropoff} onChange={(e) => update("elevatorAtDropoff", e.target.checked)} /> Elevator at drop-off</label> : null}
          <label><input type="checkbox" checked={form.stairsInvolved} onChange={(e) => update("stairsInvolved", e.target.checked)} /> Stairs involved</label>
        </div>
        <label className="field"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>

        <button className="submit-button" type="submit" disabled={isSending || !isConfigured}>
          {isSending ? "Sending test request…" : "Send synthetic booking"}<span aria-hidden="true">↗</span>
        </button>
        <p className="form-footnote">Sends to the test Supabase project configured for this deployment.</p>
      </form>

      {result ? <section className={`result ${result.ok ? "result--success" : "result--error"}`} role={result.ok ? "status" : "alert"}>
        <strong>{result.ok ? "Request sent" : "Request not completed"}</strong>
        <p>{result.message}</p>
        {result.requestId ? <p><b>Request ID:</b> <code>{result.requestId}</code></p> : null}
        {result.eventId ? <p><b>Test calendar event:</b> <code>{result.eventId}</code></p> : null}
      </section> : null}

      <footer><span>DWAP / TEST BUILD</span><span>Only synthetic data belongs here.</span></footer>
    </main>
  );
}
