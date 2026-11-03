function torontoDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

export function calculateJobMetrics(jobs, today = new Date()) {
  const todayToronto = torontoDate(today);
  const pending = jobs.filter((job) => job.status === "NEW").length;
  const confirmedToday = jobs.filter((job) => job.status === "CONFIRMED" && job.preferredDate === todayToronto).length;
  const balanceOpen = jobs.reduce((total, job) =>
    total + (["CONFIRMED", "DONE"].includes(job.status) && !job.balanceCollected ? Number(job.balanceDue || 0) : 0), 0);
  const revenueCompleted = jobs.reduce((total, job) =>
    total + (job.status === "DONE" ? Number(job.quoteTotal || 0) : 0), 0);
  return { pending, confirmedToday, balanceOpen, revenueCompleted };
}
