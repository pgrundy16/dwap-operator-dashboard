/**
 * ISOLATED TEST COPY. Use synthetic bookings and test-only Script Properties.
 * Customer email, internal email, and Twilio sending are intentionally disabled.
 * Do not deploy this against a production Sheet or calendar.
 */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();

  const cfg = {
    SHEET_ID: props.getProperty("TEST_SHEET_ID"),
    SHEET_TAB_NAME: "Sheet1",
    BOOKINGS_CALENDAR_ID: props.getProperty("TEST_BOOKINGS_CALENDAR_ID"),
    BOOKING_WEBHOOK_TOKEN: props.getProperty("TEST_BOOKING_WEBHOOK_TOKEN"),
  };

  if (!cfg.SHEET_ID) throw new Error("Missing Script Property: TEST_SHEET_ID");
  if (!cfg.BOOKINGS_CALENDAR_ID) throw new Error("Missing Script Property: TEST_BOOKINGS_CALENDAR_ID");
  if (!cfg.BOOKING_WEBHOOK_TOKEN) throw new Error("Missing Script Property: TEST_BOOKING_WEBHOOK_TOKEN");

  return cfg;
}

/**
 * Expected payload shape (example):
 * {
 *  serviceType: "move" | "junk" | "delivery",
 *  contact: { fullName, phone, email },
 *  preferred: { date: "YYYY-MM-DD", time: "HH:mm" },
 *  estimatedDurationMinutes: 120, // optional; delivery can omit
 *  helpersNeeded: 1 | 2,
 *  addresses: {
 *    pickup: { formattedAddress, placeId, lat, lng },
 *    dropoff?: { formattedAddress, placeId, lat, lng }
 *  },
 *  access: { elevatorAtPickup, elevatorAtDropoff, stairsInvolved },
 *  details: { ...serviceSpecificFields },
 *  additionalNotes?: string,
 *  clientSubmittedAt?: string,
 *  gclid?: string
 * }
 */
function doPost(e) {
  try {
    const CONFIG = getConfig_();
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const token = String(payload.testToken || "");
    if (token !== CONFIG.BOOKING_WEBHOOK_TOKEN) {
      throw new Error("Unauthorized");
    }
    delete payload.testToken;
    validatePayload(payload);

    const requestId = Utilities.getUuid();
    const now = new Date();

    // 1) Append to Sheet
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_TAB_NAME);
    if (!sheet) throw new Error("Sheet tab not found: " + CONFIG.SHEET_TAB_NAME);

    const rowValues = buildRowValues(CONFIG, payload, requestId, now);
    sheet.appendRow(rowValues);

    // 2) Create booking event in Bookings calendar
    const eventId = createBookingsCalendarEvent(CONFIG, payload, requestId);

    // 3) Update the just-appended row with event ID (optional)
    // appendRow adds to bottom; we can write eventId into the correct column by tracking lastRow
    const lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const eventCol = headers.indexOf("Booking Calendar Event ID") + 1;
    if (eventCol > 0) sheet.getRange(lastRow, eventCol).setValue(eventId);

    return jsonResponse({ ok: true, requestId, eventId });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function validatePayload(p) {
  if (!p) throw new Error("Missing payload.");
  if (!p.serviceType) throw new Error("Missing serviceType.");
  if (!p.contact?.fullName || !p.contact?.phone || !p.contact?.email) throw new Error("Missing contact info.");
  if (!/^sample\b/i.test(String(p.contact.fullName)) || !/^[^@]+@example\.com$/i.test(String(p.contact.email))) {
    throw new Error("Test bookings require a Sample name and an example.com email.");
  }
  if (!/^55501\d{5}$/.test(String(p.contact.phone).replace(/\D/g, ""))) {
    throw new Error("Test bookings require a 55501xxxxx test phone.");
  }
  if (!p.preferred?.date || !p.preferred?.time) throw new Error("Missing preferred date/time.");
  if (!p.addresses?.pickup?.placeId) throw new Error("Pickup address must be selected from Google.");
  if ((p.serviceType === "move" || p.serviceType === "delivery") && !p.addresses?.dropoff?.placeId) {
    throw new Error("Dropoff address must be selected from Google.");
  }
}

function buildRowValues(CONFIG, p, requestId, now) {
  const pickup = p.addresses.pickup;
  const dropoff = p.addresses.dropoff;

  const serviceType = String(p.serviceType).toUpperCase();
  const preferredDate = p.preferred.date;
  const preferredTime = p.preferred.time;

  const durationMinutes = computeDurationMinutes(p);
  const estimatedTimeDisplay = durationMinutes ? `${Math.round(durationMinutes / 60)}h` : "";

  const addressesSummary = dropoff?.formattedAddress
    ? `${pickup.formattedAddress} -> ${dropoff.formattedAddress}`
    : pickup.formattedAddress;

  const gclid = ""; // Never copy real ad click identifiers into a test workbook.
  const leadSource = "Test";

  // IMPORTANT: this array must match your Sheet headers order.
  // If you change headers, update this array accordingly.
  return [
    serviceType,
    preferredDate,
    preferredTime,
    estimatedTimeDisplay,
    p.helpersNeeded ?? "",
    addressesSummary,

    p.contact.fullName,
    p.contact.phone,
    p.contact.email,

    pickup.formattedAddress,
    pickup.placeId,
    pickup.lat ?? "",
    pickup.lng ?? "",

    dropoff?.formattedAddress ?? "",
    dropoff?.placeId ?? "",
    dropoff?.lat ?? "",
    dropoff?.lng ?? "",

    p.access?.elevatorAtPickup ?? "",
    p.access?.elevatorAtDropoff ?? "",
    p.access?.stairsInvolved ?? "",

    // service-specific details (add columns here as needed)
    JSON.stringify(p.details || {}),

    p.additionalNotes ?? "",

    p.clientSubmittedAt ?? "",
    "NEW",
    requestId,
    "", // Booking Calendar Event ID placeholder (we fill it after)
    "", // AA
    "", // AB
    "", // AC
    leadSource, // AD: Lead Source
    "", // AE
    gclid // AF: gclid
  ];
}

function computeDurationMinutes(p) {
  // Delivery default = 2 hours
  if (p.serviceType === "delivery") return 120;
  // Otherwise use estimatedDurationMinutes if provided
  if (typeof p.estimatedDurationMinutes === "number") return p.estimatedDurationMinutes;
  return null;
}

function createBookingsCalendarEvent(CONFIG, p, requestId) {
  const cal = CalendarApp.getCalendarById(CONFIG.BOOKINGS_CALENDAR_ID);
  if (!cal) throw new Error("Bookings calendar not found.");

  const start = parseLocalDateTime(p.preferred.date, p.preferred.time);
  const durationMin = computeDurationMinutes(p) || 120;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const pickup = p.addresses.pickup.formattedAddress;
  const dropoff = p.addresses.dropoff?.formattedAddress || "";
  const title = `[NEW] ${String(p.serviceType).toUpperCase()} — ${p.contact.fullName}`;
  const description =
    `Request ID: ${requestId}\n` +
    `Phone: ${p.contact.phone}\n` +
    `Email: ${p.contact.email}\n` +
    `Pickup: ${pickup}\n` +
    (dropoff ? `Dropoff: ${dropoff}\n` : "") +
    `Helpers: ${p.helpersNeeded ?? ""}\n` +
    `Notes: ${p.additionalNotes ?? ""}\n`;

  const event = cal.createEvent(title, start, end, { description });
  return event.getId();
}

function parseLocalDateTime(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
