import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function makeUtilities() {
  return {
    formatDate(date, timezone, pattern) {
      if (pattern === "Z") {
        const offset = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
          .formatToParts(date).find((part) => part.type === "timeZoneName").value;
        return offset.replace("GMT", "").replace(":", "") || "+0000";
      }
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(date).map(({ type, value }) => [type, value]));
      if (pattern === "yyyy-MM-dd HH:mm") return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
      if (pattern === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
      return "";
    },
    getUuid: () => "synthetic-uuid",
  };
}

function harness(options = {}) {
  const events = [];
  const leadEvents = [];
  let serial = 0;
  let record = {
    jobId: "JOB-100", requestId: "REQ-100", status: options.status || "DEPOSIT_SENT",
    preferredDate: "2026-11-05", preferredTime: "10:00", estimatedTimeHours: 2,
    customerName: "Sample Customer", serviceType: "Move", pickupAddress: "100 Test St",
    dropoffAddress: "200 Test Ave", phone: "5550101000", email: "sample@example.com",
    quoteTotal: 500, depositAmount: 100, balanceDue: 400, depositLink: "",
    operatorNotes: "", calendarEventId: "", leadCalendarEventId: options.missingLeadEventId ? "" : "lead-event-1",
    balanceCollected: false, actualDurationHours: null, depositPaid: false,
  };
  let saveFailureCount = 0;
  let saveFailureAt = 0;
  let saveCalls = 0;
  let readCalls = 0;
  let failReadbackAt = 0;
  let silentSaveFailureCount = 0;
  let failCalendarLookup = false;
  let failCreateCount = 0;
  let failLeadDeleteCount = 0;
  let leadCancelled = false;
  let setTimeFailureCount = 0;
  let failRollbackMetadata = false;
  let locksAcquired = 0;
  let intakeSchedule = { date: record.preferredDate, time: record.preferredTime };
  const calendar = {
    getEventById(id) { return events.find((event) => event.getId() === id) || null; },
    getEvents(start, end) { return events.filter((event) => event.getStartTime() < end && event.getEndTime() > start); },
    createEvent(title, start, end, options = {}) {
      if (failCreateCount > 0) { failCreateCount -= 1; throw new Error("calendar create unavailable"); }
      const id = `event-${++serial}`;
      const state = { id, title, start, end, description: options.description || "", location: options.location || "" };
      const event = {
        getId: () => state.id,
        getTitle: () => state.title,
        getStartTime: () => state.start,
        getEndTime: () => state.end,
        getDescription: () => state.description,
        getLocation: () => state.location,
        setTime(a, b) {
          if (setTimeFailureCount > 0) { setTimeFailureCount -= 1; throw new Error("calendar setTime unavailable"); }
          state.start = a; state.end = b;
        },
        setTitle(value) { state.title = value; },
        setDescription(value) {
          if (failRollbackMetadata && state.description.includes("Draft changed")) throw new Error("rollback description failed");
          state.description = value;
        },
        setLocation(value) { state.location = value; },
      };
      events.push(event);
      return event;
    },
  };

  if (!options.missingLeadEventId) {
    const leadState = {
      id: "lead-event-1", title: "[NEW] MOVE — Sample Customer",
      start: new Date("2026-11-05T15:00:00Z"), end: new Date("2026-11-05T17:00:00Z"),
      description: "Request ID: REQ-100\nPhone: 5550101000\nEmail: sample@example.com",
    };
    leadEvents.push({
      getId: () => leadState.id,
      getTitle: () => leadState.title,
      getStartTime: () => leadState.start,
      getEndTime: () => leadState.end,
      getDescription: () => leadState.description,
      getLocation: () => "",
      setTime(start, end) { leadState.start = start; leadState.end = end; },
      setTitle(value) { leadState.title = value; },
      setDescription(value) { leadState.description = value; },
      setLocation() {},
      deleteEvent() {
        if (failLeadDeleteCount > 0) { failLeadDeleteCount -= 1; throw new Error("lead event deletion unavailable"); }
        if (options.retainCancelledLead) { leadCancelled = true; return; }
        const index = leadEvents.findIndex((item) => item.getId() === leadState.id);
        if (index !== -1) leadEvents.splice(index, 1);
      },
    });
  }
  const leadCalendar = {
    getEventById(id) { return leadEvents.find((event) => event.getId() === id) || null; },
  };

  const context = {
    Date, JSON, Object, Array, Math, String, Number, Boolean, RegExp, Error,
    CalendarApp: { getCalendarById: (id) => failCalendarLookup ? null : id === "lead-calendar" ? leadCalendar : calendar },
    LockService: { getScriptLock: () => ({ waitLock(ms) { assert.equal(ms, 20000); locksAcquired += 1; }, releaseLock() {} }) },
    Utilities: makeUtilities(),
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.getConfig_ = () => ({
    leadCalendarId: options.missingLeadCalendarId ? "" : "lead-calendar",
    jobsCalendarId: options.missingCalendarId ? "" : "test-calendar",
  });
  context.leadEventStatus_ = () => !leadEvents.length ? "missing" : leadCancelled ? "cancelled" : "active";
  context.getExistingJobRecord_ = (payload = {}) => {
    readCalls += 1;
    if (readCalls === failReadbackAt) throw new Error("Simulated Sheet readback failure");
    const matches = (!payload.requestId || payload.requestId === record.requestId) &&
      (!payload.jobId || payload.jobId === record.jobId);
    if (!matches || (!payload.jobId && !payload.requestId)) throw new Error("Job not found for request.");
    return { ...record };
  };
  context.saveJobRecord_ = (value) => {
    saveCalls += 1;
    if (saveFailureCount > 0) { saveFailureCount -= 1; throw new Error("Simulated Sheet failure"); }
    if (saveFailureAt === saveCalls) throw new Error("Simulated final Sheet failure");
    if (silentSaveFailureCount > 0) { silentSaveFailureCount -= 1; return; }
    record = { ...value };
  };
  context.writeBookingSchedule_ = (job) => {
    const snapshot = { ...intakeSchedule };
    intakeSchedule = { date: job.preferredDate, time: job.preferredTime };
    return snapshot;
  };
  context.restoreBookingSchedule_ = (snapshot) => { intakeSchedule = { ...snapshot }; };

  return {
    context, events, leadEvents, calendar,
    getRecord: () => ({ ...record }),
    getIntakeSchedule: () => ({ ...intakeSchedule }),
    setRecord: (value) => { record = { ...value }; },
    failNextSave: () => { saveFailureCount += 1; },
    failSaveAtCall: (call) => { saveFailureAt = call; },
    failReadbackAtCall: (call) => { failReadbackAt = call; },
    silentlyFailNextSave: () => { silentSaveFailureCount += 1; },
    failCalendarLookup: () => { failCalendarLookup = true; },
    failNextCreate: () => { failCreateCount += 1; },
    failNextLeadDelete: () => { failLeadDeleteCount += 1; },
    markLeadCancelled: () => { leadCancelled = true; },
    failSetTimeCalls: (count) => { setTimeFailureCount = count; },
    failRollbackMetadata: () => { failRollbackMetadata = true; },
    lockCount: () => locksAcquired,
  };
}

const key = { jobId: "JOB-100", requestId: "REQ-100" };

test("confirmation creates a Toronto-timed Jobs event, persists its ID, and is idempotent", () => {
  const h = harness();
  const first = h.context.confirmBooking_(key);
  const second = h.context.confirmBooking_(key);
  assert.equal(h.events.length, 1);
  assert.equal(first.calendarEventId, second.calendarEventId);
  assert.equal(h.getRecord().status, "CONFIRMED");
  assert.equal(h.leadEvents.length, 0);
  assert.equal(first.leadCalendarEventId, "lead-event-1");
  assert.match(h.events[0].getDescription(), /DWAP-Request-ID: REQ-100/);
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
  assert.equal(h.events[0].getEndTime().toISOString(), "2026-11-05T17:00:00.000Z");
  assert.equal(h.lockCount(), 2);
});

test("cancelled lead tombstones do not block confirmation or duplicate Jobs events on retry", () => {
  const h = harness({ retainCancelledLead: true });
  const first = h.context.confirmBooking_(key);
  assert.equal(first.status, "CONFIRMED");
  assert.equal(h.leadEvents.length, 1); // Direct lookup can still return a cancelled object.
  h.context.confirmBooking_(key);
  assert.equal(h.events.length, 1);

  const retry = harness({ retainCancelledLead: true });
  retry.failSaveAtCall(2);
  assert.throws(() => retry.context.confirmBooking_(key), /Simulated final Sheet failure/);
  assert.equal(retry.context.confirmBooking_(key).status, "CONFIRMED");
  assert.equal(retry.events.length, 1);

  const unstaged = harness({ retainCancelledLead: true });
  unstaged.markLeadCancelled();
  assert.throws(() => unstaged.context.confirmBooking_(key), /missing before the Jobs event was saved/);
  assert.equal(unstaged.events.length, 0);
});

test("Calendar API status lookup fails closed for errors, ambiguity, and recurring events", () => {
  let response = { items: [{ status: "cancelled" }] };
  const context = vm.createContext({ Calendar: { Events: { list: () => response } } });
  vm.runInContext(source, context);
  context.getConfig_ = () => ({ leadCalendarId: "test-lead" });
  assert.equal(context.leadEventStatus_("lead@example.com"), "cancelled");
  response = { items: [{ status: "confirmed" }] };
  assert.equal(context.leadEventStatus_("lead@example.com"), "active");
  response = { items: [] };
  assert.equal(context.leadEventStatus_("lead@example.com"), "missing");
  response = { kind: "calendar#events" };
  assert.equal(context.leadEventStatus_("lead@example.com"), "missing");
  response = {};
  assert.throws(() => context.leadEventStatus_("lead@example.com"), /ambiguous/);
  response = { items: [{ status: "confirmed", recurringEventId: "series" }] };
  assert.throws(() => context.leadEventStatus_("lead@example.com"), /ambiguous/);
  response = { items: [{ status: "confirmed" }, { status: "cancelled" }] };
  assert.throws(() => context.leadEventStatus_("lead@example.com"), /ambiguous/);
  context.Calendar.Events.list = () => { throw new Error("private API details"); };
  assert.throws(() => context.leadEventStatus_("lead@example.com"), /could not be verified/);
});

test("confirmation recovers an event after a failed or silently lost Sheet write", () => {
  for (const silent of [false, true]) {
    const h = harness();
    if (silent) h.silentlyFailNextSave(); else h.failNextSave();
    assert.throws(() => h.context.confirmBooking_(key), /Sheet failure|did not persist/);
    assert.equal(h.events.length, 1);
    assert.equal(h.leadEvents.length, 1);
    const retry = h.context.confirmBooking_(key);
    assert.equal(retry.calendarEventId, "event-1");
    assert.equal(h.events.length, 1);
    assert.equal(h.leadEvents.length, 0);
  }
});

test("confirmation blocks conflicting events and suggests only free candidates", () => {
  const h = harness();
  h.calendar.createEvent("busy", new Date("2026-11-05T15:00:00Z"), new Date("2026-11-05T17:00:00Z"), { description: "busy" });
  assert.throws(() => h.context.confirmBooking_(key), (error) => {
    assert.match(error.message, /Calendar conflict/);
    const alternatives = error.message.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g) || [];
    assert.ok(alternatives.length > 0 && alternatives.length <= 3);
    for (const alternative of alternatives) {
      const [date, time] = alternative.split(" ");
      const start = h.context.parseTorontoLocalDateTime_(date, time);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      assert.equal(h.calendar.getEvents(start, end).length, 0);
    }
    return true;
  });
  assert.equal(h.getRecord().status, "DEPOSIT_SENT");
  assert.equal(h.events.length, 1);
});

test("calendar conflict produces no suggestions when the nearby window is fully occupied", () => {
  const h = harness();
  h.calendar.createEvent("all busy", new Date("2026-11-05T15:00:00Z"), new Date("2026-11-06T06:00:00Z"), { description: "busy" });
  assert.throws(() => h.context.confirmBooking_(key), /No nearby alternatives found/);
  assert.equal(h.events.length, 1);
  assert.equal(h.getRecord().status, "DEPOSIT_SENT");
});

test("missing or foreign event IDs and duplicate request markers fail closed", () => {
  const wrong = harness();
  wrong.setRecord({ ...wrong.getRecord(), calendarEventId: "foreign" });
  wrong.calendar.createEvent("foreign", new Date("2026-11-05T15:00:00Z"), new Date("2026-11-05T17:00:00Z"), { description: "DWAP-Request-ID: OTHER-REQUEST" });
  wrong.setRecord({ ...wrong.getRecord(), calendarEventId: "event-1" });
  assert.throws(() => wrong.context.confirmBooking_(key), /does not match this Request ID/);

  const missing = harness();
  missing.setRecord({ ...missing.getRecord(), calendarEventId: "deleted-event" });
  assert.throws(() => missing.context.confirmBooking_(key), /event is missing/);

  const duplicate = harness();
  for (let i = 0; i < 2; i += 1) {
    duplicate.calendar.createEvent(`duplicate ${i}`, new Date(`2026-11-05T1${5 + i}:00:00Z`), new Date(`2026-11-05T1${6 + i}:00:00Z`), { description: "DWAP-Request-ID: REQ-100" });
  }
  assert.throws(() => duplicate.context.confirmBooking_(key), /duplicate events for this Request ID/);
});

test("calendar creation failure does not mark the booking confirmed", () => {
  const h = harness();
  h.failNextCreate();
  assert.throws(() => h.context.confirmBooking_(key), /calendar create unavailable/);
  assert.equal(h.getRecord().status, "DEPOSIT_SENT");
  assert.equal(h.getRecord().calendarEventId, "");
  assert.equal(h.events.length, 0);
  assert.equal(h.leadEvents.length, 1);
});

test("lead transfer retries deletion and final Sheet failures without duplicating the Jobs event", () => {
  const deleteRetry = harness();
  deleteRetry.failNextLeadDelete();
  assert.throws(() => deleteRetry.context.confirmBooking_(key), /lead calendar event could not be removed/);
  assert.equal(deleteRetry.getRecord().status, "DEPOSIT_SENT");
  assert.equal(deleteRetry.getRecord().calendarEventId, "event-1");
  assert.equal(deleteRetry.events.length, 1);
  assert.equal(deleteRetry.leadEvents.length, 1);
  deleteRetry.context.confirmBooking_(key);
  assert.equal(deleteRetry.getRecord().status, "CONFIRMED");
  assert.equal(deleteRetry.events.length, 1);
  assert.equal(deleteRetry.leadEvents.length, 0);

  const finalWriteRetry = harness();
  finalWriteRetry.failSaveAtCall(2);
  assert.throws(() => finalWriteRetry.context.confirmBooking_(key), /Simulated final Sheet failure/);
  assert.equal(finalWriteRetry.getRecord().status, "DEPOSIT_SENT");
  assert.equal(finalWriteRetry.events.length, 1);
  assert.equal(finalWriteRetry.leadEvents.length, 0);
  finalWriteRetry.context.confirmBooking_(key);
  assert.equal(finalWriteRetry.getRecord().status, "CONFIRMED");
  assert.equal(finalWriteRetry.events.length, 1);
  assert.equal(finalWriteRetry.leadEvents.length, 0);
});

test("confirmation requires configured lead calendar, a stored lead event, and matching Request ID", () => {
  const missingConfig = harness({ missingLeadCalendarId: true });
  assert.throws(() => missingConfig.context.confirmBooking_(key), /Lead calendar synchronization is not configured/);
  assert.equal(missingConfig.events.length, 0);

  const missingEvent = harness({ missingLeadEventId: true });
  assert.throws(() => missingEvent.context.confirmBooking_(key), /requires the intake lead event ID/);
  assert.equal(missingEvent.events.length, 0);

  const foreignEvent = harness();
  foreignEvent.leadEvents[0].getDescription = () => "Request ID: SOMEONE-ELSE";
  assert.throws(() => foreignEvent.context.confirmBooking_(key), /Lead calendar event does not match this Request ID/);
  assert.equal(foreignEvent.events.length, 0);
  assert.equal(foreignEvent.leadEvents.length, 1);

  const missingUnstagedLead = harness();
  missingUnstagedLead.leadEvents.splice(0, 1);
  assert.throws(() => missingUnstagedLead.context.confirmBooking_(key), /Lead calendar event is missing/);
  assert.equal(missingUnstagedLead.events.length, 0);
  assert.equal(missingUnstagedLead.getRecord().status, "DEPOSIT_SENT");
});

test("stored intake and Jobs event IDs remain separate in canonical mappings", () => {
  const h = harness();
  assert.equal(h.context.findCanonicalField_("Booking Calendar Event ID"), "leadCalendarEventId");
  assert.equal(h.context.findCanonicalField_("Jobs Calendar Event ID"), "calendarEventId");
  assert.notEqual(h.context.HEADER_ALIASES.leadCalendarEventId, h.context.HEADER_ALIASES.calendarEventId);
});

test("editing a new booking synchronizes its intake row and lead event before quote recording", () => {
  const h = harness({ status: "NEW" });
  const updated = h.context.updateBooking_({ ...key, preferredTime: "12:00", operatorNotes: "Test note" });
  assert.equal(updated.preferredTime, "12:00");
  assert.equal(updated.operatorNotes, "Test note");
  assert.deepEqual(h.getIntakeSchedule(), { date: "2026-11-05", time: "12:00" });
  assert.equal(h.leadEvents[0].getStartTime().toISOString(), "2026-11-05T17:00:00.000Z");
  assert.equal(h.leadEvents[0].getEndTime().toISOString(), "2026-11-05T19:00:00.000Z");
  assert.match(h.leadEvents[0].getDescription(), /Request ID: REQ-100/);
  assert.equal(h.events.length, 0);
});

test("failed unconfirmed booking save rolls intake schedule and lead event back", () => {
  const h = harness({ status: "NEW" });
  h.failNextSave();
  assert.throws(() => h.context.updateBooking_({ ...key, preferredTime: "12:00" }), /Simulated Sheet failure/);
  assert.deepEqual(h.getIntakeSchedule(), { date: "2026-11-05", time: "10:00" });
  assert.equal(h.leadEvents[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
  assert.equal(h.getRecord().preferredTime, "10:00");
});

test("failed unconfirmed persistence readback restores Jobs row, intake row, and lead event", () => {
  const h = harness({ status: "NEW" });
  h.failReadbackAtCall(2);
  assert.throws(() => h.context.updateBooking_({ ...key, preferredTime: "12:00", operatorNotes: "Test note" }), /Simulated Sheet readback failure/);
  assert.equal(h.getRecord().preferredTime, "10:00");
  assert.equal(h.getRecord().operatorNotes, "");
  assert.deepEqual(h.getIntakeSchedule(), { date: "2026-11-05", time: "10:00" });
  assert.equal(h.leadEvents[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
});

test("rescheduling changes the existing event and keeps its ID", () => {
  const h = harness();
  const confirmed = h.context.confirmBooking_(key);
  const updated = h.context.updateBooking_({ ...key, preferredTime: "13:00" });
  assert.equal(updated.preferredTime, "13:00");
  assert.equal(updated.calendarEventId, confirmed.calendarEventId);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T18:00:00.000Z");
});

test("date-only rescheduling works and completed jobs cannot be rescheduled", () => {
  const h = harness();
  h.context.confirmBooking_(key);
  const dateChange = h.context.updateBooking_({ ...key, preferredDate: "2026-11-06" });
  assert.equal(dateChange.preferredDate, "2026-11-06");
  assert.equal(h.events.length, 1);
  h.setRecord({ ...h.getRecord(), status: "DONE" });
  assert.throws(() => h.context.updateBooking_({ ...key, preferredDate: "2026-11-07" }), /Cannot reschedule a completed job/);
});

test("reschedule conflict preserves Sheet and existing event", () => {
  const h = harness();
  h.context.confirmBooking_(key);
  h.calendar.createEvent("busy", new Date("2026-11-05T18:00:00Z"), new Date("2026-11-05T19:00:00Z"), { description: "busy" });
  assert.throws(() => h.context.updateBooking_({ ...key, preferredTime: "13:00" }), /Calendar conflict/);
  assert.equal(h.getRecord().preferredTime, "10:00");
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
  assert.equal(h.events.length, 2);
});

test("failed Sheet write after rescheduling rolls calendar back; failed rollback is explicit", () => {
  const h = harness();
  h.context.confirmBooking_(key);
  h.failNextSave();
  assert.throws(() => h.context.updateBooking_({ ...key, preferredTime: "13:00" }), /Simulated Sheet failure/);
  assert.equal(h.getRecord().preferredTime, "10:00");
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");

  const rollback = harness();
  rollback.context.confirmBooking_(key);
  rollback.failNextSave();
  rollback.failSetTimeCalls(2);
  assert.throws(() => rollback.context.updateBooking_({ ...key, preferredTime: "13:00" }), /calendar rollback failed; manual reconciliation required/);
  assert.equal(rollback.getRecord().preferredTime, "10:00");
});

test("confirmed booking edits refresh event notes and financial details transactionally", () => {
  const h = harness();
  h.context.confirmBooking_(key);
  const eventId = h.getRecord().calendarEventId;
  const updated = h.context.updateBooking_({ ...key, quoteTotal: 600, depositAmount: 150, operatorNotes: "Draft changed" });
  assert.equal(updated.balanceDue, 450);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].getId(), eventId);
  assert.match(h.events[0].getDescription(), /Quote: 600/);
  assert.match(h.events[0].getDescription(), /Balance Due: 450/);
  assert.match(h.events[0].getDescription(), /Operator Notes: Draft changed/);

  h.failNextSave();
  assert.throws(() => h.context.updateBooking_({ ...key, operatorNotes: "Another draft" }), /Simulated Sheet failure/);
  assert.equal(h.getRecord().operatorNotes, "Draft changed");
  assert.match(h.events[0].getDescription(), /Operator Notes: Draft changed/);
});

test("silent reschedule persistence failure is detected and rolled back", () => {
  const h = harness();
  h.context.confirmBooking_(key);
  h.silentlyFailNextSave();
  assert.throws(() => h.context.updateBooking_({ ...key, preferredTime: "13:00" }), /Saved booking values could not be verified/);
  assert.equal(h.getRecord().preferredTime, "10:00");
  assert.equal(h.events[0].getStartTime().toISOString(), "2026-11-05T15:00:00.000Z");
});

test("Toronto spring DST gap, fall repeated hour, invalid dates and durations are rejected", () => {
  const h = harness();
  assert.throws(() => h.context.parseTorontoLocalDateTime_("2026-03-08", "02:30"), /does not exist/);
  assert.throws(() => h.context.parseTorontoLocalDateTime_("2026-11-01", "01:30"), /ambiguous/);
  assert.throws(() => h.context.parseTorontoLocalDateTime_("2026-02-30", "10:00"), /real calendar date/);
  assert.throws(() => h.context.calendarPeriod_({ ...h.getRecord(), preferredTime: "25:00" }), /valid proposed date and time/);
  assert.throws(() => h.context.calendarPeriod_({ ...h.getRecord(), estimatedTimeHours: 0 }), /valid estimated duration/);
  assert.throws(() => h.context.calendarPeriod_({ ...h.getRecord(), estimatedTimeHours: 25 }), /valid estimated duration/);
});

test("missing calendar configuration, denied access, and create failures are actionable", () => {
  const config = harness({ missingCalendarId: true });
  assert.throws(() => config.context.confirmBooking_(key), /Calendar synchronization is not configured/);
  const denied = harness();
  denied.failCalendarLookup();
  assert.throws(() => denied.context.confirmBooking_(key), /not found or access was denied/);
});

test("lifecycle transitions require valid source states and actual duration", () => {
  const fresh = harness({ status: "NEW" });
  const deposit = fresh.context.updateJobForDeposit_({ ...key, quoteTotal: 500, depositAmount: 100, balanceDue: 400 });
  assert.equal(deposit.status, "DEPOSIT_SENT");
  assert.throws(() => fresh.context.updateJobForDeposit_({ ...key, quoteTotal: 500, depositAmount: 100, balanceDue: 400 }), /Cannot record deposit from status DEPOSIT_SENT/);

  const beforeActual = harness({ status: "CONFIRMED" });
  assert.throws(() => beforeActual.context.completeJob_(key), /Explicit actual duration required/);
  const completed = beforeActual.context.completeJob_({ ...key, actualDurationHours: 3.5 });
  assert.equal(completed.status, "DONE");
  assert.equal(completed.actualDurationHours, 3.5);
  assert.throws(() => beforeActual.context.completeJob_({ ...key, actualDurationHours: 3.5 }), /Cannot complete job from status DONE/);
});
