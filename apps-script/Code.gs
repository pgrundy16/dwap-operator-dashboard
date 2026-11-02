var CONFIG = {
  bookingsSheetName: "Sheet1",
  jobsSheetName: "Jobs",
  doneRetentionDays: 30,
  statusDone: "DONE",
  statusConfirmed: "CONFIRMED",
  actions: {
    listJobs: "listJobs",
    sendDeposit: "sendDeposit",
    confirmBooking: "confirmBooking",
    completeJob: "completeJob",
  },
};

// Runtime configuration for a standalone Apps Script project. Values belong in
// Project Settings > Script Properties, never in source code.
function getConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var config = {
    spreadsheetId: properties.getProperty("DASHBOARD_SPREADSHEET_ID"),
    jobsCalendarId: properties.getProperty("JOBS_CALENDAR_ID"),
    apiToken: properties.getProperty("DASHBOARD_API_TOKEN"),
  };

  return config;
}

function getDashboardSpreadsheet_() {
  var spreadsheetId = getConfig_().spreadsheetId;
  if (!spreadsheetId) throw new Error("Dashboard spreadsheet is not configured.");
  return SpreadsheetApp.openById(spreadsheetId);
}

var CANONICAL_HEADERS = [
  "jobId",
  "requestId",
  "status",
  "serviceType",
  "customerName",
  "phone",
  "email",
  "preferredDate",
  "preferredTime",
  "estimatedTimeHours",
  "helpersNeeded",
  "pickupAddress",
  "dropoffAddress",
  "stairsInvolved",
  "elevatorAtPickup",
  "elevatorAtDropoff",
  "submittedAt",
  "additionalNotes",
  "serviceDetails",
  "quoteTotal",
  "depositAmount",
  "balanceDue",
  "depositLink",
  "depositSentAt",
  "depositPaid",
  "confirmedAt",
  "completedAt",
  "actualDurationHours",
  "operatorNotes",
  "archiveOn",
  "riskFlags",
  "calendarEventId",
];

var HEADER_ALIASES = {
  jobId: ["jobId", "job_id", "Job ID"],
  requestId: ["requestId", "request_id", "Request ID", "Booking ID", "bookingId", "id"],
  status: ["status", "Status"],
  serviceType: ["serviceType", "service_type", "Service Type", "Move Type"],
  customerName: ["customerName", "customer_name", "Customer Name", "Name", "Full Name"],
  phone: ["phone", "Phone", "Phone Number"],
  email: ["email", "Email", "Email Address"],
  preferredDate: ["preferredDate", "preferred_date", "Preferred Date", "Move Date", "Date"],
  preferredTime: ["preferredTime", "preferred_time", "Preferred Time", "Move Time", "Time"],
  estimatedTimeHours: ["estimatedTimeHours", "estimated_time_hours", "Estimated Time", "Estimated Hours"],
  helpersNeeded: ["helpersNeeded", "helpers_needed", "Helpers Needed", "Helpers"],
  pickupAddress: ["pickupAddress", "pickup_address", "Pickup Address", "Origin Address"],
  dropoffAddress: ["dropoffAddress", "dropoff_address", "Dropoff Address", "Destination Address"],
  stairsInvolved: ["stairsInvolved", "stairs_involved", "Stairs Involved", "Stairs"],
  elevatorAtPickup: ["elevatorAtPickup", "elevator_at_pickup", "Elevator At Pickup", "Pickup Elevator"],
  elevatorAtDropoff: ["elevatorAtDropoff", "elevator_at_dropoff", "Elevator At Dropoff", "Dropoff Elevator"],
  submittedAt: ["submittedAt", "submitted_at", "Submitted At", "Timestamp", "Created At"],
  additionalNotes: ["additionalNotes", "additional_notes", "Additional Notes", "Notes"],
  serviceDetails: ["serviceDetails", "service_details", "Service Details", "Service-Specific Fields (JSON)"],
  quoteTotal: ["quoteTotal", "quote_total", "Quote Total", "Quote"],
  depositAmount: ["depositAmount", "deposit_amount", "Deposit Amount", "Deposit"],
  balanceDue: ["balanceDue", "balance_due", "Balance Due", "Balance"],
  depositLink: ["depositLink", "deposit_link", "Deposit Link"],
  depositSentAt: ["depositSentAt", "deposit_sent_at", "Deposit Sent At"],
  depositPaid: ["depositPaid", "deposit_paid", "Deposit Paid"],
  confirmedAt: ["confirmedAt", "confirmed_at", "Confirmed At"],
  completedAt: ["completedAt", "completed_at", "Completed At"],
  actualDurationHours: ["actualDurationHours", "actual_duration_hours", "Actual Duration Hours", "Actual Hours"],
  operatorNotes: ["operatorNotes", "operator_notes", "Operator Notes"],
  archiveOn: ["archiveOn", "archive_on", "Archive On"],
  riskFlags: ["riskFlags", "risk_flags", "Risk Flags"],
  calendarEventId: ["calendarEventId", "calendar_event_id", "Calendar Event ID"],
};

function doGet(e) {
  return jsonResponse_({ ok: false, error: "Method not allowed." });
}

function doPost(e) {
  try {
    var rawBody = e && e.postData && e.postData.contents;
    if (String(rawBody || "").length > 16384) {
      return jsonResponse_({ ok: false, error: "Request body is too large." });
    }
    var payload = JSON.parse(rawBody || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse_({ ok: false, error: "A JSON object is required." });
    }

    return handleRequest_({ method: "POST", payload: payload });
  } catch (error) {
    return jsonResponse_({ ok: false, error: "Invalid JSON request." });
  }
}

function handleRequest_(request) {
  try {
    if (!request || request.method !== "POST") {
      throw new Error("Method not allowed.");
    }
    assertAuthorized_(request.payload || {});

    var action = request.payload.action || CONFIG.actions.listJobs;
    validateDashboardPayload_(action, request.payload || {});

    if (action === CONFIG.actions.listJobs) {
      return jsonResponse_({
        ok: true,
        jobs: listJobs_(),
      });
    }

    if (action === CONFIG.actions.sendDeposit) {
      return jsonResponse_({
        ok: true,
        job: updateJobForDeposit_(request.payload || {}),
      });
    }

    if (action === CONFIG.actions.confirmBooking) {
      return jsonResponse_({
        ok: true,
        job: confirmBooking_(request.payload || {}),
      });
    }

    if (action === CONFIG.actions.completeJob) {
      return jsonResponse_({
        ok: true,
        job: completeJob_(request.payload || {}),
      });
    }

    throw new Error("Unsupported action: " + action);
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message,
    });
  }
}

function listJobs_() {
  var spreadsheet = getDashboardSpreadsheet_();
  var bookingsRows = readSheetRows_(spreadsheet, CONFIG.bookingsSheetName);
  var jobsRows = readSheetRows_(spreadsheet, CONFIG.jobsSheetName);
  var jobsByKey = {};

  jobsRows.forEach(function(jobRow) {
    var key = getRowKey_(jobRow);
    if (key) {
      jobsByKey[key] = jobRow;
    }
  });

  var merged = bookingsRows.map(function(bookingRow) {
    var key = getRowKey_(bookingRow);
    var jobsRow = key ? jobsByKey[key] : null;
    if (jobsRow) {
      delete jobsByKey[key];
    }
    return normalizeJobRecord_(mergeObjects_(bookingRow, jobsRow || {}));
  });

  Object.keys(jobsByKey).forEach(function(key) {
    merged.push(normalizeJobRecord_(jobsByKey[key]));
  });

  return merged.filter(shouldIncludeJob_).sort(compareJobs_);
}

function updateJobForDeposit_(payload) {
  var job = getExistingJobRecord_(payload);
  var quoteTotal = parseNumber_(payload.quoteTotal);
  var depositAmount = parseNumber_(payload.depositAmount);
  var balanceDue = parseNumber_(payload.balanceDue);

  if (balanceDue === null && quoteTotal !== null && depositAmount !== null) {
    balanceDue = Math.max(quoteTotal - depositAmount, 0);
  }

  var updated = mergeObjects_(job, {
    status: "DEPOSIT_SENT",
    quoteTotal: quoteTotal,
    depositAmount: depositAmount,
    balanceDue: balanceDue,
    depositLink: payload.depositLink || "",
    depositSentAt: nowIso_(),
  });

  saveJobRecord_(updated);
  return normalizeJobRecord_(updated);
}

function confirmBooking_(payload) {
  var job = getExistingJobRecord_(payload);
  var wasConfirmed = normalizeStatus_(job.status) === CONFIG.statusConfirmed;
  var updated = mergeObjects_(job, {
    status: CONFIG.statusConfirmed,
    depositPaid: payload.depositPaid === false ? false : true,
    confirmedAt: job.confirmedAt || nowIso_(),
  });

  if (!updated.calendarEventId && !wasConfirmed) {
    updated.calendarEventId = createCalendarEvent_(updated);
  }

  saveJobRecord_(updated);
  return normalizeJobRecord_(updated);
}

function completeJob_(payload) {
  var job = getExistingJobRecord_(payload);
  var completedAt = payload.completedAt || nowIso_();
  var archiveOn = payload.archiveOn || addDaysIso_(completedAt, CONFIG.doneRetentionDays);
  var actualDurationHours = parseNumber_(payload.actualDurationHours);

  if (actualDurationHours === null) {
    actualDurationHours = parseNumber_(job.actualDurationHours);
  }
  if (actualDurationHours === null) {
    actualDurationHours = parseNumber_(job.estimatedTimeHours);
  }

  var updated = mergeObjects_(job, {
    status: CONFIG.statusDone,
    completedAt: completedAt,
    archiveOn: archiveOn,
    actualDurationHours: actualDurationHours,
  });

  saveJobRecord_(updated);
  return normalizeJobRecord_(updated);
}

function getExistingJobRecord_(payload) {
  var mergedJobs = listJobs_();
  var target = mergedJobs.filter(function(job) {
    return matchesPayload_(job, payload);
  })[0];

  if (!target) {
    throw new Error("Job not found for request.");
  }

  return target;
}

function matchesPayload_(job, payload) {
  return Boolean(
    (payload.jobId && job.jobId === payload.jobId) ||
    (payload.requestId && job.requestId === payload.requestId)
  );
}

function saveJobRecord_(job) {
  var spreadsheet = getDashboardSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(CONFIG.jobsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.jobsSheetName);
  }

  ensureHeaders_(sheet, CANONICAL_HEADERS);

  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerMap = getHeaderMap_(headerRow);
  var dataRowCount = Math.max(sheet.getLastRow() - 1, 0);
  var rows = dataRowCount > 0
    ? sheet.getRange(2, 1, dataRowCount, sheet.getLastColumn()).getValues()
    : [];
  var targetIndex = findRowIndex_(rows, headerMap, job);
  var serialized = serializeForSheet_(job, headerRow);

  if (targetIndex === -1) {
    sheet.appendRow(serialized);
    return;
  }

  sheet.getRange(targetIndex + 2, 1, 1, serialized.length).setValues([serialized]);
}

function readSheetRows_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var headerMap = getHeaderMap_(headers);

  return values.slice(1).map(function(row) {
    var record = {};

    Object.keys(HEADER_ALIASES).forEach(function(field) {
      var index = findHeaderIndex_(headerMap, HEADER_ALIASES[field]);
      if (index !== -1) {
        record[field] = row[index];
      }
    });

    return record;
  }).filter(function(record) {
    return record.jobId || record.requestId || record.customerName;
  }).filter(function(record) {
    return hasMeaningfulRowData_(record);
  }).map(function(record) {
    return normalizeJobRecord_(record);
  });
}

function normalizeJobRecord_(record) {
  var normalized = {};

  CANONICAL_HEADERS.forEach(function(field) {
    normalized[field] = normalizeField_(field, record ? record[field] : "");
  });

  if (!normalized.jobId) {
    normalized.jobId = buildJobId_(normalized);
  }

  if (!normalized.status) {
    normalized.status = "NEW";
  }

  if (
    normalized.balanceDue === null &&
    normalized.quoteTotal !== null &&
    normalized.depositAmount !== null
  ) {
    normalized.balanceDue = Math.max(normalized.quoteTotal - normalized.depositAmount, 0);
  }

  return normalized;
}

function normalizeField_(field, value) {
  if (value === null || value === undefined) {
    value = "";
  }

  if (field === "preferredDate") {
    return normalizeDateField_(value);
  }

  if (field === "preferredTime") {
    return normalizeTimeField_(value);
  }

  if (
    field === "submittedAt" ||
    field === "depositSentAt" ||
    field === "confirmedAt" ||
    field === "completedAt" ||
    field === "archiveOn"
  ) {
    return normalizeDateTimeField_(value);
  }

  if (field === "serviceDetails") {
    return normalizeObjectField_(value);
  }

  if (field === "riskFlags") {
    return normalizeArrayField_(value);
  }

  if (
    field === "stairsInvolved" ||
    field === "elevatorAtPickup" ||
    field === "elevatorAtDropoff" ||
    field === "depositPaid"
  ) {
    return normalizeBoolean_(value);
  }

  if (
    field === "estimatedTimeHours" ||
    field === "helpersNeeded" ||
    field === "quoteTotal" ||
    field === "depositAmount" ||
    field === "balanceDue" ||
    field === "actualDurationHours"
  ) {
    return field === "estimatedTimeHours" ? parseDurationHours_(value) : parseNumber_(value);
  }

  if (field === "status") {
    return normalizeStatus_(value);
  }

  return value === "" ? "" : String(value);
}

function normalizeObjectField_(value) {
  if (!value) {
    return {};
  }

  if (Object.prototype.toString.call(value) === "[object Object]") {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return { summary: value };
    }
  }

  return {};
}

function normalizeArrayField_(value) {
  if (!value) {
    return [];
  }

  if (Object.prototype.toString.call(value) === "[object Array]") {
    return value;
  }

  if (typeof value === "string") {
    try {
      var parsed = JSON.parse(value);
      return Object.prototype.toString.call(parsed) === "[object Array]" ? parsed : [value];
    } catch (error) {
      return value.split(/\s*,\s*/).filter(Boolean);
    }
  }

  return [];
}

function normalizeBoolean_(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (!value) {
    return false;
  }

  return /^(true|yes|y|1)$/i.test(String(value));
}

function normalizeDateField_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return formatDate_(value, "yyyy-MM-dd");
  }

  var dateOnly = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    var exactDate = new Date(dateOnly + "T12:00:00Z");
    return !isNaN(exactDate.getTime()) && exactDate.toISOString().slice(0, 10) === dateOnly ? dateOnly : "";
  }

  var parsed = parseDate_(value);
  if (!parsed) {
    return String(value);
  }

  return formatDate_(parsed, "yyyy-MM-dd");
}

function normalizeTimeField_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return formatDate_(value, "HH:mm");
  }

  var trimmed = String(value).trim();
  var clockMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    var hour = Number(clockMatch[1]);
    var minute = Number(clockMatch[2]);
    if (hour > 23 || minute > 59) return "";
    return (hour < 10 ? "0" : "") + hour + ":" + clockMatch[2];
  }

  var parsed = parseDate_(value);
  if (!parsed) {
    return trimmed;
  }

  return formatDate_(parsed, "HH:mm");
}

function normalizeDateTimeField_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  var parsed = parseDate_(value);
  return parsed ? parsed.toISOString() : String(value);
}

function parseNumber_(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  var number = Number(value);
  return isNaN(number) ? null : number;
}

function parseDurationHours_(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return isFinite(value) ? value : null;
  var match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:h|hr|hrs|hour|hours)?$/i);
  return match ? Number(match[1]) : null;
}

function normalizeStatus_(value) {
  return value ? String(value).trim().toUpperCase() : "";
}

function shouldIncludeJob_(job) {
  if (job.status !== CONFIG.statusDone) {
    return true;
  }

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.doneRetentionDays);
  var doneAt = parseDate_(job.completedAt || job.archiveOn || job.preferredDate);

  return !doneAt || doneAt >= cutoff;
}

function compareJobs_(a, b) {
  var aDate = buildCombinedDateTime_(a.preferredDate, a.preferredTime);
  var bDate = buildCombinedDateTime_(b.preferredDate, b.preferredTime);

  return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
}

function createCalendarEvent_(job) {
  var calendarId = getConfig_().jobsCalendarId;
  if (!calendarId) throw new Error("Jobs calendar is not configured.");
  var calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) {
    throw new Error("Jobs calendar not found.");
  }

  var start = buildEventStart_(job);
  var durationHours = parseNumber_(job.estimatedTimeHours) || 2;
  var end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  var title = [job.serviceType || "Job", "-", job.customerName || job.jobId].join(" ");
  var description = [
    "Job ID: " + (job.jobId || ""),
    "Request ID: " + (job.requestId || ""),
    "Customer: " + (job.customerName || ""),
    "Phone: " + (job.phone || ""),
    "Email: " + (job.email || ""),
    "Pickup: " + (job.pickupAddress || ""),
    "Dropoff: " + (job.dropoffAddress || ""),
    "Helpers: " + (job.helpersNeeded || ""),
    "Quote: " + (job.quoteTotal || ""),
    "Balance Due: " + (job.balanceDue || ""),
    "Notes: " + (job.additionalNotes || ""),
  ].join("\n");

  var event = calendar.createEvent(title, start, end, {
    description: description,
    location: job.pickupAddress || job.dropoffAddress || "",
  });

  return event.getId();
}

function buildEventStart_(job) {
  var datePart = job.preferredDate || formatDate_(new Date(), "yyyy-MM-dd");
  var timePart = job.preferredTime || "09:00";
  var candidate = buildCombinedDateTime_(datePart, timePart);

  if (!candidate) {
    throw new Error("Cannot create calendar event without a valid preferred date.");
  }

  return candidate;
}

function buildJobId_(job) {
  var dateSeed = (job.preferredDate || formatDate_(new Date(), "yyyy-MM-dd"))
    .replace(/-/g, "")
    .slice(2);
  var requestSeed = (job.requestId || Utilities.getUuid())
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();

  return "JOB-" + dateSeed + "-" + requestSeed;
}

function nowIso_() {
  return new Date().toISOString();
}

function addDaysIso_(isoString, days) {
  var date = parseDate_(isoString) || new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function parseDate_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function buildCombinedDateTime_(dateValue, timeValue) {
  var datePart = normalizeDateField_(dateValue);
  if (!datePart) {
    return null;
  }

  var timePart = normalizeTimeField_(timeValue) || "00:00";
  return parseDate_(datePart + "T" + timePart + ":00");
}

function hasMeaningfulRowData_(record) {
  var fieldsToCheck = [
    "jobId",
    "requestId",
    "customerName",
    "phone",
    "email",
    "pickupAddress",
    "dropoffAddress",
    "preferredDate",
    "submittedAt",
  ];

  return fieldsToCheck.some(function(field) {
    var value = record[field];

    if (value === null || value === undefined || value === "") {
      return false;
    }

    if (Object.prototype.toString.call(value) === "[object Date]") {
      return !isNaN(value.getTime());
    }

    return String(value).trim() !== "";
  });
}

function ensureHeaders_(sheet, headers) {
  var currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];
  var isExactMatch = headers.length === currentHeaders.length && headers.every(function(header, index) {
    return currentHeaders[index] === header;
  });

  if (isExactMatch) {
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function serializeForSheet_(job, headers) {
  return headers.map(function(header) {
    var field = findCanonicalField_(header);
    var value = field ? job[field] : "";

    if (field === "serviceDetails" || field === "riskFlags") {
      return value && (Object.keys(value).length || value.length) ? JSON.stringify(value) : "";
    }

    return value === null || value === undefined ? "" : value;
  });
}

function findRowIndex_(rows, headerMap, job) {
  var jobIdIndex = findHeaderIndex_(headerMap, HEADER_ALIASES.jobId);
  var requestIdIndex = findHeaderIndex_(headerMap, HEADER_ALIASES.requestId);

  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    var rowJobId = jobIdIndex === -1 ? "" : row[jobIdIndex];
    var rowRequestId = requestIdIndex === -1 ? "" : row[requestIdIndex];

    if ((job.jobId && rowJobId === job.jobId) || (job.requestId && rowRequestId === job.requestId)) {
      return index;
    }
  }

  return -1;
}

function getHeaderMap_(headers) {
  var map = {};

  headers.forEach(function(header, index) {
    if (header !== "") {
      map[String(header)] = index;
    }
  });

  return map;
}

function findHeaderIndex_(headerMap, aliases) {
  for (var index = 0; index < aliases.length; index += 1) {
    if (Object.prototype.hasOwnProperty.call(headerMap, aliases[index])) {
      return headerMap[aliases[index]];
    }
  }

  return -1;
}

function findCanonicalField_(header) {
  var fields = Object.keys(HEADER_ALIASES);

  for (var index = 0; index < fields.length; index += 1) {
    var field = fields[index];
    if (HEADER_ALIASES[field].indexOf(header) !== -1) {
      return field;
    }
  }

  return null;
}

function getRowKey_(row) {
  return row.requestId || row.jobId || "";
}

function mergeObjects_(base, override) {
  var merged = {};
  var source = base || {};
  var patch = override || {};

  CANONICAL_HEADERS.forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== undefined && patch[field] !== null && patch[field] !== "") {
      merged[field] = patch[field];
      return;
    }

    if (Object.prototype.hasOwnProperty.call(patch, field) && (field === "depositLink" || field === "operatorNotes")) {
      merged[field] = patch[field];
      return;
    }

    merged[field] = source[field];
  });

  return merged;
}

function assertAuthorized_(request) {
  var configuredToken = getConfig_().apiToken;
  if (!configuredToken || configuredToken.length < 32) {
    throw new Error("Dashboard API token is not configured.");
  }

  var candidate = request && request.token;

  if (typeof candidate !== "string" || !constantTimeEquals_(candidate, String(configuredToken))) {
    throw new Error("Unauthorized.");
  }
}

function constantTimeEquals_(left, right) {
  left = String(left || "");
  right = String(right || "");
  var difference = left.length ^ right.length;
  var maxLength = Math.max(left.length, right.length);
  for (var i = 0; i < maxLength; i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

function validateDashboardPayload_(action, payload) {
  var allowedActions = [
    CONFIG.actions.listJobs,
    CONFIG.actions.sendDeposit,
    CONFIG.actions.confirmBooking,
    CONFIG.actions.completeJob,
  ];
  if (allowedActions.indexOf(action) === -1) {
    throw new Error("Unsupported action.");
  }

  var allowedFields = ["action", "token"];
  if (action !== CONFIG.actions.listJobs) {
    allowedFields.push("jobId", "requestId");
    if (action === CONFIG.actions.sendDeposit) {
      allowedFields.push("quoteTotal", "depositAmount", "balanceDue", "depositLink");
    }
    if (action === CONFIG.actions.completeJob) {
      allowedFields.push("actualDurationHours");
    }
    if (!isValidDashboardId_(payload.jobId) && !isValidDashboardId_(payload.requestId)) {
      throw new Error("A valid job ID or request ID is required.");
    }
    if (payload.jobId !== undefined && !isValidDashboardId_(payload.jobId)) {
      throw new Error("Invalid job ID.");
    }
    if (payload.requestId !== undefined && !isValidDashboardId_(payload.requestId)) {
      throw new Error("Invalid request ID.");
    }
  }

  Object.keys(payload).forEach(function(key) {
    if (allowedFields.indexOf(key) === -1) {
      throw new Error("Unsupported request field.");
    }
  });

  if (action === CONFIG.actions.sendDeposit) {
    ["quoteTotal", "depositAmount", "balanceDue"].forEach(function(field) {
      var value = payload[field];
      if (typeof value !== "number" || !isFinite(value) || value < 0 || value > 100000000) {
        throw new Error("Invalid quote or deposit amount.");
      }
    });
    if (payload.depositLink !== undefined) {
      if (typeof payload.depositLink !== "string" || payload.depositLink.length > 2048) {
        throw new Error("Invalid payment link.");
      }
      if (payload.depositLink && !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(payload.depositLink)) {
        throw new Error("Payment link must use HTTPS.");
      }
    }
  }

  if (action === CONFIG.actions.completeJob && payload.actualDurationHours !== undefined) {
    if (typeof payload.actualDurationHours !== "number" ||
        !isFinite(payload.actualDurationHours) ||
        payload.actualDurationHours < 0 ||
        payload.actualDurationHours > 1000) {
      throw new Error("Invalid actual duration.");
    }
  }
}

function isValidDashboardId_(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function formatDate_(date, pattern) {
  return Utilities.formatDate(date, getTimezone_(), pattern);
}

function getTimezone_() {
  return "America/Toronto";
}
