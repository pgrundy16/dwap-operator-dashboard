// Isolated test variant. The live website and its booking function are unchanged.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter (per-IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // max requests
const RATE_WINDOW_MS = 60_000; // per minute

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validatePayload(body: any): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";

  const validServices = ["move", "junk", "delivery"];
  if (!validServices.includes(body.serviceType))
    return `serviceType must be one of: ${validServices.join(", ")}`;

  // Contact
  const c = body.contact;
  if (!c || typeof c !== "object") return "Missing contact object";
  if (typeof c.fullName !== "string" || c.fullName.trim().split(/\s+/).length < 2)
    return "contact.fullName must include first and last name";
  if (typeof c.phone !== "string" || c.phone.replace(/\D/g, "").length !== 10)
    return "contact.phone must be 10 digits";
  if (typeof c.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()))
    return "contact.email is invalid";
  if (!/^sample\b/i.test(c.fullName) || !/^[^@]+@example\.com$/i.test(c.email))
    return "Test bookings require a Sample name and example.com email";
  if (!/^55501\d{5}$/.test(c.phone.replace(/\D/g, "")))
    return "Test bookings require a 55501xxxxx test phone";

  // Preferred
  const p = body.preferred;
  if (!p || typeof p !== "object") return "Missing preferred object";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return "preferred.date must be YYYY-MM-DD";
  if (!/^\d{2}:\d{2}$/.test(p.time)) return "preferred.time must be HH:mm";

  // Addresses
  const a = body.addresses;
  if (!a || typeof a !== "object") return "Missing addresses object";
  if (!a.pickup?.placeId) return "addresses.pickup must include placeId";
  if ((body.serviceType === "move" || body.serviceType === "delivery") && !a.dropoff?.placeId)
    return "addresses.dropoff must include placeId for this service";

  // Helpers
  if (![1, 2].includes(body.helpersNeeded)) return "helpersNeeded must be 1 or 2";

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // Rate limit by IP
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (isRateLimited(clientIp)) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  // Validate
  const validationError = validatePayload(body);
  if (validationError) {
    return jsonError(validationError);
  }

  // Business logic: delivery must have 120 min duration
  if (body.serviceType === "delivery") {
    body.estimatedDurationMinutes = 120;
  }

  // Rate limit by email too
  if (body.contact?.email && isRateLimited(`email:${body.contact.email}`)) {
    return jsonError("Too many requests from this email. Please try again later.", 429);
  }

  // Forward to Apps Script
  const webhookUrl = Deno.env.get("TEST_BOOKING_WEBHOOK_URL");
  const webhookToken = Deno.env.get("TEST_BOOKING_WEBHOOK_TOKEN");

  if (!webhookUrl || !webhookToken) {
    console.error("Missing test booking webhook configuration");
    return jsonError("Server configuration error", 500);
  }

  try {
    const appsScriptResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, gclid: "", testToken: webhookToken }),
      redirect: "follow",
    });

    const responseData = await appsScriptResponse.text();

    let parsed: any;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = { ok: false, error: "Test booking service returned an invalid response" };
    }

    return new Response(JSON.stringify(parsed), {
      status: appsScriptResponse.ok && parsed.ok === true ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error forwarding to Apps Script:", err);
    return jsonError("Failed to process booking request", 502);
  }
});
