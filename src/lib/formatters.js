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
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
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
  }).format(date);
}

export function formatJobTime(dateString, timeString) {
  if (!dateString) return "Not set";
  const date = new Date(`${dateString}T${timeString || "00:00"}:00`);
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatHours(hours) {
  if (hours === null || hours === undefined || hours === "") return "Pending";
  const value = Number(hours);
  if (Number.isNaN(value)) return "Pending";
  return `${value}h`;
}
