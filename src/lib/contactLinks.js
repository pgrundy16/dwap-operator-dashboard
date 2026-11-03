export function phoneHref(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]{7,24}$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

export function emailHref(value) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return /^[^\s@<>?&#]+@[^\s@<>?&#]+\.[^\s@<>?&#]+$/.test(email)
    ? `mailto:${email}`
    : null;
}
