export function StatCard({ label, value, helper, accent }) {
  return (
    <article className={`stat-card stat-card--${accent}`}>
      <p className="stat-card__label">{label}</p>
      <strong className="stat-card__value">{value}</strong>
      <p className="stat-card__helper">{helper}</p>
    </article>
  );
}
