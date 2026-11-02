import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function harness() {
  const events = [];
  let serial = 0;
  let record = { jobId: "JOB-100", requestId: "REQ-100", status: "DEPOSIT_SENT", preferredDate: "2026-11-05", preferredTime: "10:00", estimatedTimeHours: 2, customerName: "Test Customer", serviceType: "Move", calendarEventId: "", depositPaid: false };
  let failSave = false;
  const calendar = {
    getEventById(id) { return events.find(e => e.getId() === id) || null; },
    getEvents(start, end) { return events.filter(e => e.getStartTime() < end && e.getEndTime() > start); },
    createEvent(title, start, end, options) {
      const id = "event-" + (++serial);
      const event = { getId: () => id, getStartTime: () => start, getEndTime: () => end,
        getDescription: () => options.description,
        setTime(a, b) { start = a; end = b; } };
      events.push(event); return event;
    },
  };
  const context = {
    Date, JSON, Object, Array, Math, String, Number, Boolean, RegExp, Error,
    CalendarApp: { getCalendarById: () => calendar },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      parseDate(value) { return new Date(value.replace(" ", "T") + ":00-05:00"); },
      formatDate(date) {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23" }).format(date).replace(", ", " ");
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), context);
  context.getConfig_ = () => ({ jobsCalendarId: "test-calendar" });
  context.getExistingJobRecord_ = () => ({ ...record });
  context.saveJobRecord_ = value => { if (failSave) throw new Error("Simulated sheet failure"); record = { ...value }; };
  return { context, events, calendar, getRecord: () => record, setRecord: value => { record = value; }, failNextSave: () => { failSave = true; } };
}

test("confirmation creates one event, persists ID and remains idempotent", () => {
  const h = harness();
  const first = h.context.confirmBooking_({ requestId: "REQ-100" });
  const second = h.context.confirmBooking_({ requestId: "REQ-100" });
  assert.equal(h.events.length, 1);
  assert.equal(first.calendarEventId, second.calendarEventId);
  assert.equal(h.getRecord().status, "CONFIRMED");
});

test("lost Sheet write is recovered using the exact Request ID marker", () => {
  const h = harness();
  h.failNextSave();
  assert.throws(() => h.context.confirmBooking_({ requestId: "REQ-100" }), /Simulated sheet/);
  assert.equal(h.events.length, 1);
  // Simulate the next request after the failed write with the prior data intact.
  h.context.saveJobRecord_ = value => h.setRecord(value);
  const result = h.context.confirmBooking_({ requestId: "REQ-100" });
  assert.equal(result.calendarEventId, "event-1");
  assert.equal(h.events.length, 1);
});

test("conflicting time refuses confirmation and offers alternatives", () => {
  const h = harness();
  h.calendar.createEvent("unrelated", new Date("2026-11-05T15:00:00Z"), new Date("2026-11-05T17:00:00Z"), { description: "unrelated" });
  assert.throws(() => h.context.confirmBooking_({ requestId: "REQ-100" }), /Calendar conflict.*Suggested alternatives/);
  assert.equal(h.getRecord().status, "DEPOSIT_SENT");
  assert.equal(h.events.length, 1);
});

test("rescheduling edits existing event without creating another", () => {
  const h = harness();
  h.context.confirmBooking_({ requestId: "REQ-100" });
  const result = h.context.updateBooking_({ preferredDate: "2026-11-05", preferredTime: "13:00" });
  assert.equal(result.preferredTime, "13:00");
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T18:00:00.000Z");
});

test("rescheduling conflict preserves Sheet and prior calendar time", () => {
  const h = harness();
  h.context.confirmBooking_({ requestId: "REQ-100" });
  h.calendar.createEvent("busy", new Date("2026-11-05T18:00:00Z"), new Date("2026-11-05T19:00:00Z"), { description: "busy" });
  assert.throws(() => h.context.updateBooking_({ preferredTime: "13:00" }), /Calendar conflict/);
  assert.equal(h.getRecord().preferredTime, "10:00");
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
});

test("a stored missing event ID fails closed rather than creating a duplicate", () => {
  const h = harness();
  h.setRecord({ ...h.getRecord(), calendarEventId: "missing" });
  assert.throws(() => h.context.confirmBooking_({ requestId: "REQ-100" }), /Reconcile manually/);
  assert.equal(h.events.length, 0);
});
