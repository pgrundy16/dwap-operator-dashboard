import { StatusPill } from "./StatusPill";
import { formatCurrency, formatJobTime } from "../lib/formatters";

export function JobCard({ job, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`job-card ${isActive ? "job-card--active" : ""}`}
      onClick={() => onSelect(job.jobId)}
    >
      <div className="job-card__header">
        <div className="job-card__title">
          <p className="job-card__eyebrow">{job.serviceType}</p>
          <h3>{job.customerName}</h3>
        </div>
        <StatusPill status={job.status} />
      </div>

      <div className="job-card__meta-grid">
        <span>{formatJobTime(job.preferredDate, job.preferredTime)}</span>
        <span>{job.helpersNeeded} helper{job.helpersNeeded > 1 ? "s" : ""}</span>
        <span>Quote {formatCurrency(job.quoteTotal)}</span>
        <span>Balance {formatCurrency(job.balanceDue)}</span>
      </div>

      <div className="job-card__route-grid">
        <p className="job-card__route">
          <strong>From</strong>
          <span>{job.pickupAddress}</span>
        </p>
        <p className="job-card__route">
          <strong>To</strong>
          <span>{job.dropoffAddress || "Pickup only"}</span>
        </p>
      </div>
    </button>
  );
}
