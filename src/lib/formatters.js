export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDate(dateString) {
  if (!dateString) return "Not scheduled";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T12:00:00Z`)
    : new Date(dateString);
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? "UTC" : "America/Toronto",
  }).format(date);
}

export function formatDateTime(dateString) {
  if (!dateString) return "Pending";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(date);
}

export function formatJobTime(dateString, timeString) {
  if (!dateString) return "Not set";
  const date = localTorontoInstant(dateString, timeString || "00:00");
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(date);
}

function localTorontoInstant(dateString, timeString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant += target - observed;
  }
  return new Date(instant);
}

export function formatHours(hours) {
  if (hours === null || hours === undefined || hours === "") return "Pending";
  const value = Number(hours);
  if (Number.isNaN(value)) return "Pending";
  return `${value}h`;
}
