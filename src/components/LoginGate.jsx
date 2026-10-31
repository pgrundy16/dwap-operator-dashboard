import { useState } from "react";

export function LoginGate({ onUnlock, errorMessage }) {
  const [value, setValue] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onUnlock(value);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-card__brand">
          <div className="brand-chip">Montreal Operator Dashboard</div>
          <h1>Dude With A Pickup</h1>
          <p className="login-card__copy">
            Montreal operator dashboard for management of bookings, deposits, confirmations, and
            completion of jobs.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="passphrase">Dashboard passphrase</label>
          <input
            id="passphrase"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Enter passphrase"
            autoComplete="current-password"
          />
          {errorMessage ? <p className="login-form__error">{errorMessage}</p> : null}
          <button type="submit">Unlock Dashboard</button>
        </form>
      </section>
    </main>
  );
}
