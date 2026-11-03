import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sessionHandler from "../api/session.js";
import jobsHandler from "../api/jobs.js";
import { fetchJobs } from "../src/lib/api.js";
import { formatCurrency, formatDate, formatDateTime, formatJobTime } from "../src/lib/formatters.js";
import { emailHref, phoneHref } from "../src/lib/contactLinks.js";
import { calculateJobMetrics } from "../src/lib/jobMetrics.js";

const oldEnv = {
  DASHBOARD_PASSPHRASE: process.env.DASHBOARD_PASSPHRASE,
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
  DASHBOARD_APPS_SCRIPT_URL: process.env.DASHBOARD_APPS_SCRIPT_URL,
  DASHBOARD_API_TOKEN: process.env.DASHBOARD_API_TOKEN,
};
const originalFetch = globalThis.fetch;

before(() => {
  process.env.DASHBOARD_PASSPHRASE = "synthetic-test-passphrase-only";
  process.env.DASHBOARD_SESSION_SECRET = "synthetic-test-session-key-at-least-32-characters";
  process.env.DASHBOARD_APPS_SCRIPT_URL = "https://script.google.com/macros/s/test-deployment/exec";
  process.env.DASHBOARD_API_TOKEN = "synthetic-test-token-for-api-gateway-only";
});

after(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

function response() {
  return {
    headers: {},
    code: 200,
    body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sameOriginHeaders = { origin: "https://dashboard.example", host: "dashboard.example" };

test("job data requires a valid server session", async () => {
  const res = response();
  await jobsHandler({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(res.headers["cache-control"], "no-store, private");
  assert.equal(JSON.stringify(res.body).includes("customerName"), false);
});

test("login rejects bad credentials and a foreign origin", () => {
  const bad = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: "wrong" } }, bad);
  assert.equal(bad.code, 401);
  assert.equal(bad.headers["set-cookie"], undefined);

  const foreign = response();
  sessionHandler({ method: "POST", headers: { origin: "https://other.example", host: "dashboard.example" }, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, foreign);
  assert.equal(foreign.code, 403);
});

test("signed, HTTP-only session permits proxied reads without revealing token", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  assert.equal(login.code, 200);
  assert.match(login.headers["set-cookie"], /HttpOnly/);
  assert.match(login.headers["set-cookie"], /SameSite=Strict/);
  const cookie = login.headers["set-cookie"].split(";")[0];

  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, jobs: [] }) };
  };
  const res = response();
  await jobsHandler({ method: "GET", headers: { cookie } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true, jobs: [] });
  assert.equal(sent.token, process.env.DASHBOARD_API_TOKEN);
  assert.equal(JSON.stringify(res.body).includes(process.env.DASHBOARD_API_TOKEN), false);
  assert.equal(res.headers["cache-control"], "no-store, private");

  const tampered = response();
  await jobsHandler({ method: "GET", headers: { cookie: cookie + "x" } }, tampered);
  assert.equal(tampered.code, 401);
});

test("writes require same origin and an allowed action", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];

  const foreign = response();
  await jobsHandler({ method: "POST", headers: { cookie, origin: "https://other.example", host: "dashboard.example" }, body: { action: "completeJob", jobId: "TEST-1" } }, foreign);
  assert.equal(foreign.code, 403);

  const unsupported = response();
  await jobsHandler({ method: "POST", headers: { ...sameOriginHeaders, cookie }, body: { action: "listJobs", jobId: "TEST-1" } }, unsupported);
  assert.equal(unsupported.code, 400);
});

test("sessions expire server-side and the session endpoint reports expiry", () => {
  const originalNow = Date.now;
  let currentTime = 1_800_000_000_000;
  Date.now = () => currentTime;
  try {
    const login = response();
    sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
    const cookie = login.headers["set-cookie"].split(";")[0];
    assert.equal(login.body.expiresAt, Math.floor(currentTime / 1000) + 12 * 60 * 60);

    const active = response();
    sessionHandler({ method: "GET", headers: { cookie } }, active);
    assert.equal(active.body.authenticated, true);
    assert.equal(active.body.expiresAt, login.body.expiresAt);

    currentTime += 12 * 60 * 60 * 1000 + 1000;
    const expired = response();
    sessionHandler({ method: "GET", headers: { cookie } }, expired);
    assert.equal(expired.body.authenticated, false);
    assert.equal(expired.body.expiresAt, null);
  } finally {
    Date.now = originalNow;
  }
});

test("job writes reject invalid fields before calling Apps Script", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ ok: true, job: {} }) };
  };

  const cases = [
    { action: "confirmBooking", jobId: "TEST-1", extra: "unexpected" },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: "10", depositAmount: 2, balanceDue: 8 },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: 10, depositAmount: 2, balanceDue: 8, depositLink: "javascript:alert(1)" },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: 100_000_001, depositAmount: 2, balanceDue: 8 },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: 10, depositAmount: 2, balanceDue: 8, depositLink: "https://user:password@square.example/pay" },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: 10, depositAmount: 2, balanceDue: 5 },
    { action: "sendDeposit", jobId: "TEST-1", quoteTotal: 10, depositAmount: 12, balanceDue: 0 },
    { action: "completeJob", requestId: "request-1", actualDurationHours: Infinity },
    { action: "confirmBooking", jobId: "\n" },
  ];

  for (const body of cases) {
    const res = response();
    await jobsHandler({ method: "POST", headers: { ...sameOriginHeaders, cookie }, body }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.ok, false);
  }
  assert.equal(fetchCalls, 0);
});

test("booking updates validate dates, times, amounts, notes and balance state at the gateway", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  let fetchCalls = 0;
  globalThis.fetch = async (_url, options) => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ ok: true, job: JSON.parse(options.body) }) };
  };
  const invalid = [
    { preferredDate: "" },
    { preferredDate: "2026-02-30" },
    { preferredTime: "25:00" },
    { preferredTime: "9:30" },
    { quoteTotal: -1 },
    { actualDurationHours: 1001 },
    { operatorNotes: "bad\u0001note" },
    { balanceCollected: "yes" },
    {},
  ];
  for (const patch of invalid) {
    const res = response();
    await jobsHandler({ method: "POST", headers: { ...sameOriginHeaders, cookie }, body: { action: "updateBooking", requestId: "REQ-1", ...patch } }, res);
    assert.equal(res.code, 400, JSON.stringify(patch));
  }
  assert.equal(fetchCalls, 0);
  const valid = response();
  await jobsHandler({ method: "POST", headers: { ...sameOriginHeaders, cookie }, body: {
    action: "updateBooking", requestId: "REQ-1", preferredDate: "2026-11-12", preferredTime: "09:30",
    quoteTotal: 550, depositAmount: 125, operatorNotes: "Leave side gate clear", actualDurationHours: 2.5,
    balanceCollected: false,
  } }, valid);
  assert.equal(valid.code, 200);
  assert.equal(fetchCalls, 1);
});

test("job gateway rejects oversized write bodies", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const res = response();
  await jobsHandler({
    method: "POST",
    headers: { ...sameOriginHeaders, cookie, "content-length": String(16 * 1024 + 1) },
    body: { action: "confirmBooking", jobId: "TEST-1" },
  }, res);
  assert.equal(res.code, 413);
});

test("gateway rejects non-Apps Script upstream configuration", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const originalUrl = process.env.DASHBOARD_APPS_SCRIPT_URL;
  let fetchCalls = 0;
  process.env.DASHBOARD_APPS_SCRIPT_URL = "https://script.google.com:8443/macros/s/test-deployment/exec";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Unexpected fetch");
  };
  try {
    const res = response();
    await jobsHandler({ method: "GET", headers: { cookie } }, res);
    assert.equal(res.code, 503);
    assert.equal(fetchCalls, 0);
    assert.equal(JSON.stringify(res.body).includes(process.env.DASHBOARD_API_TOKEN), false);
  } finally {
    process.env.DASHBOARD_APPS_SCRIPT_URL = originalUrl;
  }
});

test("job response data is available only to an authenticated session", async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({ ok: true, jobs: [{ customerName: "Sample Customer", email: "sample@example.com" }] }),
    };
  };

  const denied = response();
  await jobsHandler({ method: "GET", headers: {} }, denied);
  assert.equal(denied.code, 401);
  assert.equal(JSON.stringify(denied.body).includes("Sample Customer"), false);
  assert.equal(fetchCalls, 0);

  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const allowed = response();
  await jobsHandler({ method: "GET", headers: { cookie } }, allowed);
  assert.equal(allowed.code, 200);
  assert.equal(allowed.body.jobs[0].customerName, "Sample Customer");
  assert.equal(fetchCalls, 1);
});

test("gateway treats malformed upstream jobs as an upstream failure", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, jobs: "not-an-array" }) });
  const res = response();
  await jobsHandler({ method: "GET", headers: { cookie } }, res);
  assert.equal(res.code, 502);
  assert.equal(res.body.ok, false);
});

test("gateway exposes actionable calendar rollback errors but masks private upstream failures", async () => {
  const login = response();
  sessionHandler({ method: "POST", headers: sameOriginHeaders, body: { passphrase: process.env.DASHBOARD_PASSPHRASE } }, login);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const invoke = async (error) => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, error }) });
    const res = response();
    await jobsHandler({ method: "POST", headers: { ...sameOriginHeaders, cookie }, body: { action: "updateBooking", requestId: "REQ-1", operatorNotes: "safe" } }, res);
    return res;
  };

  const reconciliation = await invoke("Calendar or Sheet update failed and calendar rollback failed; manual reconciliation required.");
  assert.equal(reconciliation.code, 409);
  assert.match(reconciliation.body.error, /manual reconciliation required/);

  const transferRetry = await invoke("Jobs event is saved, but the lead calendar event could not be removed. Retry confirmation to finish the transfer.");
  assert.equal(transferRetry.code, 409);
  assert.match(transferRetry.body.error, /Retry confirmation/);

  const privateFailure = await invoke("Exception: private customer row and secret token");
  assert.equal(privateFailure.code, 502);
  assert.doesNotMatch(privateFailure.body.error, /customer row|secret token/);
});

test("browser job client keeps valid jobs and counts malformed or duplicate records", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, jobs: [
      { jobId: "JOB-1", requestId: "req-1", status: "new", preferredDate: "2026-11-12", preferredTime: "09:00", serviceDetails: { item: "box" } },
      { jobId: "JOB-2", requestId: "req-1", status: "NEW" },
      { jobId: "JOB-3", requestId: "req-3", preferredDate: "not-a-date" },
      null,
    ] }),
  });
  const result = await fetchJobs();
  assert.equal(result.jobs.length, 1);
  assert.equal(result.rejectedCount, 3);
  assert.equal(result.jobs[0].status, "NEW");
});

test("job dates and timestamps display in America/Toronto", () => {
  assert.match(formatDate("2026-11-12"), /Thu, Nov 12/);
  assert.match(formatJobTime("2026-11-12", "09:00"), /9:00/);
  assert.match(formatDateTime("2026-11-12T14:00:00Z"), /9:00/);
});

test("customer contact actions produce safe mobile tel and mailto links", () => {
  assert.equal(phoneHref("+1 (514) 555-0100"), "tel:+15145550100");
  assert.equal(phoneHref("514-555-0100"), "tel:5145550100");
  assert.equal(phoneHref(""), null);
  assert.equal(phoneHref("abc@example.com"), null);
  assert.equal(phoneHref("123"), null);
  assert.equal(emailHref("sample@example.com"), "mailto:sample@example.com");
  assert.equal(emailHref("bad email@example.com"), null);
  assert.equal(emailHref("user@example.com?subject=leak"), null);
  assert.equal(emailHref(""), null);
});

test("dashboard metrics account for operator-marked balance collection and Toronto date", () => {
  const jobs = [
    { status: "NEW", balanceDue: 20, quoteTotal: 30 },
    { status: "CONFIRMED", preferredDate: "2026-11-02", balanceDue: 100, quoteTotal: 200 },
    { status: "DONE", balanceDue: 50, balanceCollected: true, quoteTotal: 300 },
    { status: "DONE", balanceDue: 40, balanceCollected: false, quoteTotal: 400 },
  ];
  const metrics = calculateJobMetrics(jobs, new Date("2026-11-03T02:00:00Z"));
  assert.deepEqual(metrics, { pending: 1, confirmedToday: 1, balanceOpen: 140, revenueCompleted: 700 });
});

test("CAD display keeps cents when present", () => {
  assert.match(formatCurrency(1234.56), /1,234\.56/);
  assert.match(formatCurrency(1200), /1,200/);
});
