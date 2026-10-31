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
  onConfirm,
  onComplete,
  isSaving,
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
              <Field label="Phone" value={job.phone} className="detail-field--card" />
              <Field label="Email" value={job.email} className="detail-field--card" />
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
              <Field
                label="Operator Notes"
                value={job.operatorNotes}
                className="detail-field--card detail-field--note"
              />
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
              <label>
                Quote Total
                <input
                  type="number"
                  inputMode="decimal"
                  value={quoteDraft.quoteTotal}
                  onChange={(event) => onQuoteChange("quoteTotal", event.target.value)}
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
                  placeholder="450"
                />
              </label>
              <label className="quote-grid__wide">
                Deposit Link
                <input
                  type="url"
                  value={quoteDraft.depositLink}
                  onChange={(event) => onQuoteChange("depositLink", event.target.value)}
                  placeholder="https://square.link/..."
                />
              </label>
            </div>

            <div className="quote-actions">
              <button className="button button--primary" type="button" onClick={onSendDeposit} disabled={isSaving}>
                Record Quote and Deposit
              </button>
              <button className="button button--secondary" type="button" onClick={onConfirm} disabled={isSaving}>
                Mark Confirmed
              </button>
              <button className="button button--ghost" type="button" onClick={onComplete} disabled={isSaving}>
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
