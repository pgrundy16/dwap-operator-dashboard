import { clearSession, noStore, sameOrigin, sessionExpiresAt, setSession, validPassphrase } from "../server/auth.js";

export default function handler(req, res) {
  noStore(res);

  if (req.method === "GET") {
    try {
      const expiresAt = sessionExpiresAt(req);
      return res.status(200).json({ ok: true, authenticated: expiresAt !== null, expiresAt });
    } catch {
      return res.status(503).json({ ok: false, error: "Dashboard authentication is not configured." });
    }
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: "Request origin was rejected." });
  }

  if (req.method === "DELETE") {
    clearSession(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const passphrase = req.body?.passphrase;
    if (!validPassphrase(passphrase)) {
      return res.status(401).json({ ok: false, error: "Incorrect passphrase." });
    }
    const expiresAt = setSession(res);
    return res.status(200).json({ ok: true, expiresAt });
  } catch {
    return res.status(503).json({ ok: false, error: "Dashboard authentication is not configured." });
  }
}
