import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sessionHandler from "../api/session.js";
import jobsHandler from "../api/jobs.js";

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
  process.env.DASHBOARD_APPS_SCRIPT_URL = "https://example.invalid/apps-script";
  process.env.DASHBOARD_API_TOKEN = "synthetic-test-token";
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
