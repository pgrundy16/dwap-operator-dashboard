import { formatCurrency, formatDateTime, formatHours, formatJobTime } from "../lib/formatters";
import { StatusPill } from "./StatusPill";

function Field({ label, value, className = "" }) {
  return (
    <div className={`detail-field ${className}`.trim()}>
      <span>{label}</span>
      <strong>{value || "Not set"}</strong>
    </div>
  );
}

export function JobDetail({
  job,
  quoteDraft,
  onQuoteChange,
  onSendDeposit,
  onSave,
  onConfirm,
  onComplete,
  isSaving,
  isDemoMode = false,
}) {
  const accessSummary = [
    job.elevatorAtPickup ? "Elevator at pickup" : "No pickup elevator",
    job.elevatorAtDropoff ? "Elevator at dropoff" : "No dropoff elevator",
    job.stairsInvolved ? "Stairs involved" : "No stairs",
  ];

  return (
    <section className="detail-panel">
      <div className="detail-panel__header">
        <div>
          <p className="detail-panel__eyebrow">Live job control</p>
          <h2>{job.customerName}</h2>
        </div>
        <div className="detail-panel__header-meta">
          <span className="detail-panel__job-id">{job.jobId}</span>
          <StatusPill status={job.status} />
        </div>
      </div>

      <div className="detail-panel__hero">
        <div className="detail-panel__hero-copy">
          <p className="detail-panel__service">{job.serviceType}</p>
          <h3>{formatJobTime(job.preferredDate, job.preferredTime)}</h3>
          <p className="detail-panel__route">
            {job.pickupAddress}
            {job.dropoffAddress ? ` -> ${job.dropoffAddress}` : ""}
          </p>
        </div>
        <div className="detail-panel__hero-grid">
          <Field label="Request ID" value={job.requestId} className="detail-field--card" />
          <Field label="Helpers" value={job.helpersNeeded} className="detail-field--card" />
          <Field
            label="Estimated Time"
            value={formatHours(job.estimatedTimeHours)}
            className="detail-field--card"
          />
          <Field
            label="Actual Time"
            value={formatHours(job.actualDurationHours)}
            className="detail-field--card"
          />
          <Field label="Quote" value={formatCurrency(job.quoteTotal)} className="detail-field--card" />
          <Field
            label="Balance"
            value={formatCurrency(job.balanceDue)}
            className="detail-field--card"
          />
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-stack">
          <article className="detail-section">
            <div className="detail-section__title-row">
              <h3>Customer</h3>
            </div>
            <div className="detail-meta-grid">
              <div className="detail-field detail-field--card"><span>Phone</span><strong>{/^\\+?[\\d ()-]{7,24}$/.test(job.phone || "") ? <a href={`tel:${job.phone.replace(/[^+\\d]/g, "")}`}>{job.phone}</a> : job.phone || "Not set"}</strong></div>
              <div className="detail-field detail-field--card"><span>Email</span><strong>{/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(job.email || "") ? <a href={`mailto:${job.email}`}>{job.email}</a> : job.email || "Not set"}</strong></div>
              <Field
                label="Submitted"
                value={formatDateTime(job.submittedAt)}
                className="detail-field--card"
              />
              <Field
                label="Deposit Paid"
                value={job.depositPaid ? "Paid" : "Pending"}
                className="detail-field--card"
              />
            </div>
            <div className="flag-list flag-list--compact">
              {accessSummary.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </article>

          <article className="detail-section">
            <div className="detail-section__title-row">
              <h3>Scope and Notes</h3>
            </div>
            <div className="flag-list">
              {job.riskFlags?.length ? (
                job.riskFlags.map((flag) => <span key={flag}>{flag}</span>)
              ) : (
                <span>No special risks flagged</span>
              )}
            </div>
            <div className="detail-notes-grid">
              <Field
                label="Customer Notes"
                value={job.additionalNotes}
                className="detail-field--card detail-field--note"
              />
              <label className="quote-grid__wide">Operator Notes
                <textarea value={quoteDraft.operatorNotes} onChange={(event) => onQuoteChange("operatorNotes", event.target.value)} maxLength={5000} rows={4} disabled={isSaving || isDemoMode} />
              </label>
            </div>
            <div className="service-detail-grid">
              <Field label="Pickup" value={job.pickupAddress} className="detail-field--card" />
              <Field
                label="Dropoff"
                value={job.dropoffAddress || "Pickup only"}
                className="detail-field--card"
              />
              {Object.entries(job.serviceDetails || {}).map(([key, value]) => (
                <Field
                  key={key}
                  label={key}
                  value={String(value)}
                  className="detail-field--card"
                />
              ))}
            </div>
          </article>
        </div>

        <div className="detail-stack">
          <article className="detail-section detail-section--quote">
            <div className="detail-section__title-row">
              <h3>Quote and Deposit</h3>
              <p>Record details prepared outside the dashboard.</p>
            </div>
            <div className="quote-grid">
              <label>Proposed booking date
                <input type="date" value={quoteDraft.preferredDate} onChange={(e) => onQuoteChange("preferredDate", e.target.value)} disabled={isSaving || isDemoMode} />
              </label>
              <label>Proposed booking time
                <input type="time" value={quoteDraft.preferredTime} onChange={(e) => onQuoteChange("preferredTime", e.target.value)} disabled={isSaving || isDemoMode} />
              </label>
              <label>Actual duration (hours)
                <input type="number" min="0" max="1000" step="0.25" value={quoteDraft.actualDurationHours} onChange={(e) => onQuoteChange("actualDurationHours", e.target.value)} disabled={isSaving || isDemoMode} />
              </label>
              <label className="quote-grid__wide">
                <input type="checkbox" checked={quoteDraft.balanceCollected} onChange={(e) => onQuoteChange("balanceCollected", e.target.checked)} disabled={isSaving || isDemoMode || job.status !== "DONE"} />
                Balance collected (operator-verified; not Square verified)
              </label>
              <label>
                Quote Total
                <input
                  type="number"
                  inputMode="decimal"
                  value={quoteDraft.quoteTotal}
                  onChange={(event) => onQuoteChange("quoteTotal", event.target.value)}
                  disabled={isDemoMode}
                  placeholder="650"
                />
              </label>
              <label>
                Deposit Amount
                <input
                  type="number"
                  inputMode="decimal"
                  value={quoteDraft.depositAmount}
                  onChange={(event) => onQuoteChange("depositAmount", event.target.value)}
                  disabled={isDemoMode}
                  placeholder="200"
                />
              </label>
              <label>
                Balance Due
                <input
                  type="number"
                  inputMode="decimal"
                  value={quoteDraft.balanceDue}
                  onChange={(event) => onQuoteChange("balanceDue", event.target.value)}
                  disabled={isDemoMode}
                  placeholder="450"
                />
              </label>
              <label className="quote-grid__wide">
                Deposit Link
                <input
                  type="url"
                  value={quoteDraft.depositLink}
                  onChange={(event) => onQuoteChange("depositLink", event.target.value)}
                  disabled={isDemoMode}
                  placeholder="https://square.link/..."
                />
              </label>
            </div>

            <div className="quote-actions">
              <button className="button button--primary" type="button" onClick={onSave} disabled={isSaving || isDemoMode}>Save booking edits</button>
              <button className="button button--secondary" type="button" onClick={onSendDeposit} disabled={isSaving || isDemoMode || job.status !== "NEW"}>
                Record Quote and Deposit
              </button>
              <button className="button button--secondary" type="button" onClick={onConfirm} disabled={isSaving || isDemoMode || job.status !== "DEPOSIT_SENT"}>
                Mark Confirmed
              </button>
              <button className="button button--ghost" type="button" onClick={onComplete} disabled={isSaving || isDemoMode || job.status !== "CONFIRMED"}>
                Mark Done
              </button>
            </div>

            <div className="quote-summary">
              <Field label="Quote" value={formatCurrency(job.quoteTotal)} className="detail-field--card" />
              <Field
                label="Deposit"
                value={formatCurrency(job.depositAmount)}
                className="detail-field--card"
              />
              <Field label="Balance" value={formatCurrency(job.balanceDue)} className="detail-field--card" />
              <Field
                label="Deposit Details Recorded"
                value={formatDateTime(job.depositSentAt)}
                className="detail-field--card"
              />
              <Field
                label="Confirmed"
                value={formatDateTime(job.confirmedAt)}
                className="detail-field--card"
              />
              <Field
                label="Completed"
                value={formatDateTime(job.completedAt)}
                className="detail-field--card"
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
