async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function getSession() {
  const data = await request("/api/session");
  return {
    authenticated: data.authenticated === true,
    expiresAt: Number.isFinite(data.expiresAt) ? data.expiresAt : null,
  };
}

export async function login(passphrase) {
  return request("/api/session", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
}

export async function logout() {
  await request("/api/session", { method: "DELETE" });
}

export async function fetchJobs() {
  const data = await request("/api/jobs");
  if (!Array.isArray(data.jobs)) throw new Error("The job service returned an invalid jobs list.");

  const jobs = [];
  let rejectedCount = 0;
  const seenRequestIds = new Set();
  for (const record of data.jobs) {
    const job = normalizeJob(record);
    if (!job || seenRequestIds.has(job.requestId)) rejectedCount += 1;
    else {
      seenRequestIds.add(job.requestId);
      jobs.push(job);
    }
  }
  return { jobs, rejectedCount };
}

function normalizeJob(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const textFields = ["jobId", "requestId", "status", "serviceType", "customerName", "phone", "email", "preferredDate", "preferredTime", "pickupAddress", "dropoffAddress", "submittedAt", "additionalNotes", "operatorNotes", "depositLink"];
  if (textFields.some((field) => record[field] != null && typeof record[field] !== "string")) return null;
  const jobId = record.jobId?.trim();
  const requestId = record.requestId?.trim();
  if (!jobId || !requestId) return null;
  if (record.preferredDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.preferredDate)) return null;
    const parsedDate = new Date(`${record.preferredDate}T12:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== record.preferredDate) return null;
  }
  if (record.preferredTime) {
    const time = record.preferredTime.match(/^(\d{2}):(\d{2})$/);
    if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) return null;
  }

  const numericFields = ["estimatedTimeHours", "helpersNeeded", "quoteTotal", "depositAmount", "balanceDue", "actualDurationHours"];
  const normalized = { ...record, jobId, requestId };
  for (const field of numericFields) {
    const value = record[field];
    if (value === "" || value === undefined) normalized[field] = null;
    else if (value === null) normalized[field] = null;
    else if (typeof value !== "number" || !Number.isFinite(value)) return null;
  }
  if (typeof normalized.serviceDetails !== "object" || normalized.serviceDetails === null || Array.isArray(normalized.serviceDetails)) normalized.serviceDetails = {};
  if (!Array.isArray(normalized.riskFlags)) normalized.riskFlags = [];
  for (const field of ["stairsInvolved", "elevatorAtPickup", "elevatorAtDropoff", "depositPaid", "balanceCollected"]) {
    normalized[field] = normalized[field] === true;
  }
  normalized.status = (normalized.status || "NEW").trim().toUpperCase();
  return normalized;
}

async function postAction(action, payload) {
  const data = await request("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  if (!data.job) throw new Error("The server did not return an updated job.");
  return data.job;
}

export const updateBooking = (payload) => postAction("updateBooking", payload);
export const sendDeposit = (payload) => postAction("sendDeposit", payload);
export const confirmBooking = (payload) => postAction("confirmBooking", payload);
export const completeJob = (payload) => postAction("completeJob", payload);
