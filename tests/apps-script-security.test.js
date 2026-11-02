import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const configuredToken = "synthetic-apps-script-token-for-tests-only";
const configuredProperties = {
  DASHBOARD_API_TOKEN: configuredToken,
  DASHBOARD_SPREADSHEET_ID: "synthetic-test-sheet-id",
  JOBS_CALENDAR_ID: "synthetic-test-calendar-id",
};
const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function loadScript() {
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => configuredProperties[name] || null,
      }),
    },
    SpreadsheetApp: { openById: (spreadsheetId) => ({ spreadsheetId }) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  });
  vm.runInContext(source, context);
  return context;
}

function readResponse(output) {
  return JSON.parse(output.text);
}

test("Apps Script does not serve customer data through GET, even with a query token", () => {
  const script = loadScript();
  const result = readResponse(script.doGet({ parameter: { token: configuredToken, action: "listJobs" } }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "Method not allowed.");
  assert.equal(JSON.stringify(result).includes("customerName"), false);
});

test("Apps Script does not accept credentials from query parameters", () => {
  const script = loadScript();
  const result = readResponse(script.doPost({
    parameter: { token: configuredToken },
    postData: { contents: JSON.stringify({ action: "listJobs" }) },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "Unauthorized.");
  assert.equal(JSON.stringify(result).includes("customerName"), false);
});

test("Apps Script rejects malformed JSON and unsupported payload fields", () => {
  const script = loadScript();
  const malformed = readResponse(script.doPost({ postData: { contents: "{" } }));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, "Invalid JSON request.");

  const extraField = readResponse(script.doPost({
    postData: { contents: JSON.stringify({ token: configuredToken, action: "confirmBooking", jobId: "TEST-1", customerEmail: "leak@example.com" }) },
  }));
  assert.equal(extraField.ok, false);
  assert.equal(extraField.error, "Unsupported request field.");
  assert.equal(JSON.stringify(extraField).includes("leak@example.com"), false);
});

test("Apps Script rejects oversized bodies before parsing them", () => {
  const script = loadScript();
  const result = readResponse(script.doPost({ postData: { contents: "x".repeat(16385) } }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "Request body is too large.");
});

test("dashboard Apps Script uses configured spreadsheet ID and has no bound-sheet dependency", () => {
  const script = loadScript();
  assert.equal(script.getDashboardSpreadsheet_().spreadsheetId, "synthetic-test-sheet-id");
  assert.equal(source.includes("getActiveSpreadsheet"), false);
  assert.equal(script.getConfig_().jobsCalendarId, "synthetic-test-calendar-id");
});

test("booking normalization accepts the website service JSON field and display durations", () => {
  const script = loadScript();
  const detailsIndex = script.HEADER_ALIASES.serviceDetails.indexOf("Service-Specific Fields (JSON)");
  assert.notEqual(detailsIndex, -1);
  assert.equal(script.parseDurationHours_("2h"), 2);
  assert.equal(script.parseDurationHours_("2.5 hours"), 2.5);
  assert.equal(script.parseDurationHours_("unknown"), null);
  assert.equal(script.normalizeDateField_("2026-11-12"), "2026-11-12");
  assert.equal(script.normalizeTimeField_("9:05"), "09:05");
  assert.equal(script.normalizeTimeField_("25:05"), "");
  assert.equal(script.normalizeJobRecord_({ jobId: "legacy-job" }).requestId, "");
});
