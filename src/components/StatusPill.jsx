const statusLabels = {
  NEW: "New",
  DEPOSIT_SENT: "Deposit Sent",
  CONFIRMED: "Confirmed",
  DONE: "Done",
};

export function StatusPill({ status }) {
  return (
    <span className={`status-pill status-pill--${status.toLowerCase()}`}>
      {statusLabels[status] || status}
    </span>
  );
}
