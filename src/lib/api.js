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
  return Array.isArray(data.jobs) ? data.jobs : [];
}

async function postAction(action, payload) {
  const data = await request("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  if (!data.job) throw new Error("The server did not return an updated job.");
  return data.job;
}

export const sendDeposit = (payload) => postAction("sendDeposit", payload);
export const confirmBooking = (payload) => postAction("confirmBooking", payload);
export const completeJob = (payload) => postAction("completeJob", payload);
