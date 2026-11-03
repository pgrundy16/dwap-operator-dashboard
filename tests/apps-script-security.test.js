import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const configuredToken = "synthetic-apps-script-token-for-tests-only";
const configuredProperties = {
  DASHBOARD_API_TOKEN: configuredToken,
  DASHBOARD_SPREADSHEET_ID: "synthetic-test-sheet-id",
  LEAD_CALENDAR_ID: "synthetic-test-lead-calendar-id",
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
    Utilities: {
      formatDate: (date, timeZone, pattern) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
          timeZone, year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).formatToParts(date).map(({ type, value }) => [type, value]));
        if (pattern === "HH:mm") return `${parts.hour}:${parts.minute}`;
        if (pattern === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
        return "";
      },
    },
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
  assert.equal(script.getConfig_().leadCalendarId, "synthetic-test-lead-calendar-id");
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

test("time-only spreadsheet cells retain their wall time in the spreadsheet timezone", () => {
  const script = loadScript();
  const cellDate = new Date("2026-11-05T17:00:00.000Z"); // 9:00 AM in Pacific, noon in Toronto.
  assert.equal(script.normalizeSpreadsheetDateCell_("preferredTime", cellDate, "America/Los_Angeles"), "09:00");
  assert.equal(script.normalizeSpreadsheetDateCell_("preferredTime", cellDate, "America/Toronto"), "12:00");
});

test("booking rows normalize Date-valued date and time cells using the Sheet timezone", () => {
  const script = loadScript();
  const values = [
    ["jobId", "requestId", "Preferred Date", "Preferred Time", "Full Name"],
    ["JOB-1", "REQ-1", new Date("2026-11-05T08:00:00.000Z"), new Date("2026-11-05T17:00:00.000Z"), "Sample Customer"],
  ];
  const sheet = {
    getLastRow: () => values.length,
    getDataRange: () => ({ getValues: () => values }),
  };
  const spreadsheet = {
    getSheetByName: () => sheet,
    getSpreadsheetTimeZone: () => "America/Los_Angeles",
  };
  const rows = script.readSheetRows_(spreadsheet, "Sheet1");
  assert.equal(rows[0].preferredDate, "2026-11-05");
  assert.equal(rows[0].preferredTime, "09:00");
});

test("schedule writeback targets a unique Request ID row and preserves its display formats", () => {
  const script = loadScript();
  const values = [
    ["Preferred Date", "Preferred Time", "Request ID"],
    ["2026-11-05", "09:00", "REQ-1"],
  ];
  const formats = [["yyyy-mm-dd", "h:mm AM/PM", "@"], ["yyyy-mm-dd", "h:mm AM/PM", "@"]];
  const range = (row, col, rowCount = 1, colCount = 1) => ({
    getValues: () => values.slice(row - 1, row - 1 + rowCount).map((line) => line.slice(col - 1, col - 1 + colCount)),
    getValue: () => values[row - 1][col - 1],
    setValue: (value) => { values[row - 1][col - 1] = value; },
    getNumberFormat: () => formats[row - 1][col - 1],
    setNumberFormat: (value) => { formats[row - 1][col - 1] = value; },
  });
  const sheet = {
    getLastRow: () => values.length,
    getLastColumn: () => values[0].length,
    getRange: (row, col, rowCount, colCount) => range(row, col, rowCount, colCount),
  };
  script.getDashboardSpreadsheet_ = () => ({ getSheetByName: () => sheet, getSpreadsheetTimeZone: () => "America/Los_Angeles" });
  script.writeBookingSchedule_({ requestId: "REQ-1", preferredDate: "2026-11-06", preferredTime: "12:00" });
  assert.deepEqual(values[1], ["2026-11-06", "12:00", "REQ-1"]);
  assert.deepEqual(formats[1], ["yyyy-mm-dd", "h:mm AM/PM", "@"]);
});
