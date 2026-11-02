import { isAuthenticated, noStore, sameOrigin } from "../server/auth.js";

const ACTIONS = new Set(["sendDeposit", "confirmBooking", "completeJob", "updateBooking"]);
const MAX_BODY_BYTES = 16 * 1024;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_PAYMENT_LINK_LENGTH = 2048;
const MAX_MONEY_AMOUNT = 100_000_000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validAppsScriptUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function requestBodySize(req) {
  const declaredSize = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredSize) && declaredSize > 0) return declaredSize;
  try {
    return Buffer.byteLength(JSON.stringify(req.body ?? null), "utf8");
  } catch {
    return MAX_BODY_BYTES + 1;
  }
}

function validateActionPayload(body) {
  if (!isPlainObject(body)) return { error: "A JSON object is required." };
  const { action } = body;
  if (!ACTIONS.has(action)) return { error: "Unsupported action." };

  const allowed = action === "updateBooking"
    ? new Set(["action", "jobId", "requestId", "preferredDate", "preferredTime", "quoteTotal", "depositAmount", "operatorNotes", "actualDurationHours", "balanceCollected"])
    : action === "sendDeposit"
    ? new Set(["action", "jobId", "requestId", "quoteTotal", "depositAmount", "balanceDue", "depositLink"])
    : action === "completeJob"
      ? new Set(["action", "jobId", "requestId", "actualDurationHours"])
      : new Set(["action", "jobId", "requestId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { error: "The request contains unsupported fields." };
  }

  if ((!body.jobId && !body.requestId) ||
      (body.jobId !== undefined && !isIdentifier(body.jobId)) ||
      (body.requestId !== undefined && !isIdentifier(body.requestId))) {
    return { error: "A valid job ID or request ID is required." };
  }

  const normalized = { action };
  if (body.jobId !== undefined) normalized.jobId = body.jobId.trim();
  if (body.requestId !== undefined) normalized.requestId = body.requestId.trim();

  if (action === "updateBooking") {
    const fields = ["preferredDate", "preferredTime", "quoteTotal", "depositAmount", "operatorNotes", "actualDurationHours", "balanceCollected"];
    if (!fields.some((field) => Object.hasOwn(body, field))) return { error: "No changes supplied." };
    for (const field of fields) {
      if (!Object.hasOwn(body, field)) continue;
      const value = body[field];
      if (field === "preferredDate") {
        if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value) return { error: "Invalid proposed date." };
      } else if (field === "preferredTime") {
        if (typeof value !== "string" || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value)) return { error: "Invalid proposed time." };
      } else if (field === "operatorNotes") {
        if (typeof value !== "string" || value.length > 5000 || /[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/.test(value)) return { error: "Invalid operator notes." };
      } else if (field === "balanceCollected") {
        if (typeof value !== "boolean") return { error: "Balance-collected must be true or false." };
      } else if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > (field === "actualDurationHours" ? 1000 : MAX_MONEY_AMOUNT))) {
        return { error: "Invalid " + field + "." };
      }
      normalized[field] = value;
    }
  }

  if (action === "sendDeposit") {
    for (const field of ["quoteTotal", "depositAmount", "balanceDue"]) {
      if (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0 || body[field] > MAX_MONEY_AMOUNT) {
        return { error: `${field} must be between 0 and ${MAX_MONEY_AMOUNT}.` };
      }
      normalized[field] = body[field];
    }

    if (body.depositLink !== undefined) {
      if (typeof body.depositLink !== "string" || body.depositLink.length > MAX_PAYMENT_LINK_LENGTH) {
        return { error: "The payment link is invalid." };
      }
      const link = body.depositLink.trim();
      if (link) {
        try {
          const parsedLink = new URL(link);
          if (parsedLink.protocol !== "https:" || parsedLink.username || parsedLink.password) {
            return { error: "The payment link must be a credential-free HTTPS URL." };
          }
        } catch {
          return { error: "The payment link must be a valid HTTPS URL." };
        }
      }
      normalized.depositLink = link;
    } else {
      normalized.depositLink = "";
    }
  }

  if (action === "completeJob" && body.actualDurationHours !== undefined) {
    if (typeof body.actualDurationHours !== "number" ||
        !Number.isFinite(body.actualDurationHours) ||
        body.actualDurationHours < 0 ||
        body.actualDurationHours > 1000) {
      return { error: "Actual duration must be between 0 and 1000 hours." };
    }
    normalized.actualDurationHours = body.actualDurationHours;
  }

  return { payload: normalized };
}

export default async function handler(req, res) {
  noStore(res);

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Please sign in again." });
    }
  } catch {
    return res.status(503).json({ ok: false, error: "Dashboard authentication is not configured." });
  }

  if (req.method === "POST" && !sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: "Request origin was rejected." });
  }

  if (req.method === "POST" && requestBodySize(req) > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "Request body is too large." });
  }

  const config = {
    url: validAppsScriptUrl(process.env.DASHBOARD_APPS_SCRIPT_URL || ""),
    token: process.env.DASHBOARD_API_TOKEN,
  };
  if (!config.url || !config.token || config.token.length < 32) {
    return res.status(503).json({ ok: false, error: "Dashboard data is not configured." });
  }

  let action = "listJobs";
  let actionPayload = {};
  if (req.method === "POST") {
    const validation = validateActionPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ ok: false, error: validation.error });
    }
    action = validation.payload.action;
    actionPayload = validation.payload;
  }

  try {
    const upstream = await fetch(config.url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ ...actionPayload, action, token: config.token }),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: "Could not reach the job service." });
    }

    const data = await upstream.json();
    if (!isPlainObject(data) || data.ok !== true) {
      return res.status(502).json({ ok: false, error: "The job service rejected the request." });
    }
    if (req.method === "GET") {
      if (!Array.isArray(data.jobs)) {
        return res.status(502).json({ ok: false, error: "The job service returned an invalid jobs list." });
      }
      return res.status(200).json({ ok: true, jobs: data.jobs });
    }
    if (!isPlainObject(data.job)) {
      return res.status(502).json({ ok: false, error: "The job service returned an invalid response." });
    }
    return res.status(200).json({ ok: true, job: data.job });
  } catch {
    return res.status(502).json({ ok: false, error: "The job service is unavailable." });
  }
}
