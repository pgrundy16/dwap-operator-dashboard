import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "dwap_dashboard_session";
const SESSION_SECONDS = 12 * 60 * 60;

export function noStore(res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function requireConfig(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing server configuration: ${missing.join(", ")}`);
  if (names.includes("DASHBOARD_SESSION_SECRET") && process.env.DASHBOARD_SESSION_SECRET.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 32 characters.");
  }
  if (names.includes("DASHBOARD_PASSPHRASE") && process.env.DASHBOARD_PASSPHRASE.length < 16) {
    throw new Error("DASHBOARD_PASSPHRASE must be at least 16 characters.");
  }
}

function sign(value) {
  return createHmac("sha256", process.env.DASHBOARD_SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function secureEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validPassphrase(input) {
  requireConfig(["DASHBOARD_PASSPHRASE"]);
  if (typeof input !== "string" || !input || input.length > 1024) return false;
  const salt = "dwap-dashboard-passphrase-v1";
  const expected = scryptSync(process.env.DASHBOARD_PASSPHRASE, salt, 32);
  const candidate = scryptSync(input, salt, 32);
  return timingSafeEqual(expected, candidate);
}

export function setSession(res) {
  requireConfig(["DASHBOARD_SESSION_SECRET"]);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = String(expires);
  const token = `${value}.${sign(value)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_SECONDS}${secure}`);
}

export function clearSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure}`);
}

export function isAuthenticated(req) {
  requireConfig(["DASHBOARD_SESSION_SECRET"]);
  const cookies = String(req.headers.cookie || "").split(";").map((part) => part.trim());
  const raw = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return false;
  const token = raw.slice(COOKIE_NAME.length + 1);
  const [expires, signature, extra] = token.split(".");
  if (extra || !/^\d+$/.test(expires || "") || !signature) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return secureEqual(signature, sign(expires));
}
