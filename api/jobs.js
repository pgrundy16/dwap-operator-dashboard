import { isAuthenticated, noStore, sameOrigin } from "../server/auth.js";

const ACTIONS = new Set(["sendDeposit", "confirmBooking", "completeJob"]);

export default async function handler(req, res) {
  noStore(res);
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Please sign in again." });
    }
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
    if (req.method === "POST" && !sameOrigin(req)) {
      return res.status(403).json({ ok: false, error: "Request origin was rejected." });
    }

    const url = process.env.DASHBOARD_APPS_SCRIPT_URL;
    const token = process.env.DASHBOARD_API_TOKEN;
    if (!url || !token) {
      return res.status(503).json({ ok: false, error: "Dashboard data is not configured." });
    }

    const action = req.method === "GET" ? "listJobs" : req.body?.action;
    if (req.method === "POST" && !ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "Unsupported action." });
    }
    if (req.method === "POST" && (!req.body?.jobId || typeof req.body.jobId !== "string")) {
      return res.status(400).json({ ok: false, error: "A job ID is required." });
    }

    const payload = req.method === "GET"
      ? { action, token }
      : { action, token, jobId: req.body.jobId, requestId: req.body.requestId || "",
          ...(action === "sendDeposit" ? {
            quoteTotal: req.body.quoteTotal,
            depositAmount: req.body.depositAmount,
            balanceDue: req.body.balanceDue,
            depositLink: req.body.depositLink,
          } : {}),
          ...(action === "completeJob" ? { actualDurationHours: req.body.actualDurationHours } : {}),
        };

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: "Could not reach the job service." });
    }
    const data = await upstream.json();
    if (data?.ok !== true) {
      return res.status(502).json({ ok: false, error: "The job service rejected the request." });
    }
    return res.status(200).json(req.method === "GET"
      ? { ok: true, jobs: Array.isArray(data.jobs) ? data.jobs : [] }
      : { ok: true, job: data.job });
  } catch {
    return res.status(502).json({ ok: false, error: "The job service is unavailable." });
  }
}
