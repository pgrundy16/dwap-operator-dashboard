import { useCallback, useEffect, useMemo, useState } from "react";
import {
  completeJob,
  confirmBooking,
  fetchJobs,
  getSession,
  login,
  logout,
  sendDeposit,
  updateBooking,
} from "./lib/api";
import { LoginGate } from "./components/LoginGate";
import { StatCard } from "./components/StatCard";
import { JobCard } from "./components/JobCard";
import { JobDetail } from "./components/JobDetail";
import { formatCurrency } from "./lib/formatters";
import { demoJobs } from "./lib/demoJobs";
import { calculateJobMetrics } from "./lib/jobMetrics";

const isDemoMode = new URLSearchParams(window.location.search).get("demo") === "1";

function buildQuoteDraft(job) {
  const quoteTotal = job?.quoteTotal ?? "";
  const depositAmount = job?.depositAmount ?? "";
  return {
    quoteTotal,
    depositAmount,
    balanceDue: quoteTotal === "" ? "" : Math.max(Number(quoteTotal) - Number(depositAmount || 0), 0),
    depositLink: job?.depositLink ?? "",
    preferredDate: job?.preferredDate ?? "",
    preferredTime: job?.preferredTime ?? "",
    operatorNotes: job?.operatorNotes ?? "",
    actualDurationHours: job?.actualDurationHours ?? "",
    balanceCollected: job?.balanceCollected === true,
  };
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(isDemoMode);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(!isDemoMode);
  const [loginError, setLoginError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [quoteDraft, setQuoteDraft] = useState(buildQuoteDraft(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState("");
  const [actionError, setActionError] = useState("");
  const [malformedCount, setMalformedCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const lockDashboard = useCallback((message = "") => {
    setIsUnlocked(false);
    setSessionExpiresAt(null);
    setJobs([]);
    setSelectedJobId("");
    setQuoteDraft(buildQuoteDraft(null));
    setDataError("");
    setActionError("");
    setLoginError(message);
  }, []);

  useEffect(() => {
    if (isDemoMode) return undefined;
    let active = true;
    getSession()
      .then((session) => {
        if (!active) return;
        setIsUnlocked(session.authenticated);
        setSessionExpiresAt(session.expiresAt);
      })
      .catch((error) => {
        if (active) setLoginError(error.message);
      })
      .finally(() => {
        if (active) setIsCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isUnlocked || !sessionExpiresAt) return undefined;
    const expiresInMs = sessionExpiresAt * 1000 - Date.now();
    if (expiresInMs <= 0) {
      lockDashboard("Your session expired. Sign in again.");
      return undefined;
    }

    const timer = window.setTimeout(
      () => lockDashboard("Your session expired. Sign in again."),
      expiresInMs,
    );
    function checkExpiryOnReturn() {
      if (Date.now() >= sessionExpiresAt * 1000) {
        lockDashboard("Your session expired. Sign in again.");
      }
    }
    document.addEventListener("visibilitychange", checkExpiryOnReturn);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkExpiryOnReturn);
    };
  }, [isUnlocked, sessionExpiresAt, lockDashboard]);

  useEffect(() => {
    if (!isUnlocked) return;
    let isMounted = true;

    async function loadJobs() {
      setIsLoading(true);
      setDataError("");
      try {
        const result = isDemoMode ? { jobs: demoJobs, rejectedCount: 0 } : await fetchJobs();
        if (!isMounted) return;
        setJobs(result.jobs);
        setMalformedCount(result.rejectedCount);
        setSelectedJobId((current) =>
          result.jobs.some((job) => job.jobId === current) ? current : result.jobs[0]?.jobId || "",
        );
      } catch (error) {
        if (!isMounted) return;
        setDataError(error.message);
        if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadJobs();

    return () => {
      isMounted = false;
    };
  }, [isUnlocked, lockDashboard, reloadKey]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId) || jobs[0],
    [jobs, selectedJobId],
  );

  useEffect(() => {
    setQuoteDraft(buildQuoteDraft(selectedJob));
  }, [selectedJob]);

  const stats = useMemo(() => calculateJobMetrics(jobs), [jobs]);

  async function handleUnlock(input) {
    setLoginError("");
    try {
      const session = await login(input);
      setIsUnlocked(true);
      setSessionExpiresAt(session.expiresAt);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      lockDashboard();
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function reloadAndVerifyJob(requestId, expectedFields) {
    const result = await fetchJobs();
    const persisted = result.jobs.find((job) => job.requestId === requestId);
    if (!persisted) throw new Error("The update was sent, but the booking could not be found after reloading. Refresh and check its saved state.");
    for (const [field, expected] of Object.entries(expectedFields)) {
      if ((persisted[field] ?? null) !== (expected ?? null)) {
        throw new Error(`The update was sent, but the saved ${field} could not be verified. Refresh and reconcile before retrying.`);
      }
    }
    setJobs(result.jobs);
    setMalformedCount(result.rejectedCount);
    setSelectedJobId(persisted.jobId);
    return persisted;
  }

  function handleQuoteChange(key, value) {
    setQuoteDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "quoteTotal" || key === "depositAmount") {
        next.balanceDue = next.quoteTotal === "" ? "" : Math.max(Number(next.quoteTotal) - Number(next.depositAmount || 0), 0);
      }
      return next;
    });
  }

  async function handleSave() {
    if (isDemoMode || !selectedJob) return;
    const quoteTotal = quoteDraft.quoteTotal === "" ? null : Number(quoteDraft.quoteTotal);
    const depositAmount = quoteDraft.depositAmount === "" ? null : Number(quoteDraft.depositAmount);
    const actualDurationHours = quoteDraft.actualDurationHours === "" ? null : Number(quoteDraft.actualDurationHours);
    if ([quoteTotal, depositAmount, actualDurationHours].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setActionError("Amounts and duration must be valid nonnegative numbers."); return;
    }
    if (quoteTotal !== null && quoteTotal > 100_000_000 || depositAmount !== null && depositAmount > 100_000_000 || actualDurationHours !== null && actualDurationHours > 1000) {
      setActionError("Amounts or duration exceed the allowed limit."); return;
    }
    if (!quoteDraft.preferredDate || !quoteDraft.preferredTime || !/^\d{4}-\d{2}-\d{2}$/.test(quoteDraft.preferredDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(quoteDraft.preferredTime)) {
      setActionError("Enter a valid proposed date and time."); return;
    }
    if (quoteTotal === null && depositAmount !== null) {
      setActionError("A quote is required before recording a deposit."); return;
    }
    if (quoteTotal !== null && depositAmount !== null && depositAmount > quoteTotal) {
      setActionError("Deposit cannot exceed the quote."); return;
    }
    const payload = {
      jobId: selectedJob.jobId, requestId: selectedJob.requestId,
      preferredDate: quoteDraft.preferredDate, preferredTime: quoteDraft.preferredTime,
      quoteTotal, depositAmount, actualDurationHours,
      operatorNotes: quoteDraft.operatorNotes,
      balanceCollected: quoteDraft.balanceCollected,
    };
    if (!window.confirm("Save these booking changes? This updates the operator record" +
      (selectedJob.status === "CONFIRMED" ? " and reschedules its calendar event." : "."))) return;
    setIsSaving(true); setActionError("");
    try {
      await updateBooking(payload);
      await reloadAndVerifyJob(selectedJob.requestId, {
        preferredDate: payload.preferredDate,
        preferredTime: payload.preferredTime,
        quoteTotal: payload.quoteTotal,
        depositAmount: payload.depositAmount,
        balanceDue: quoteTotal === null ? null : Math.max(quoteTotal - (depositAmount || 0), 0),
        operatorNotes: payload.operatorNotes,
        actualDurationHours: payload.actualDurationHours,
        balanceCollected: payload.balanceCollected,
      });
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally { setIsSaving(false); }
  }

  async function handleSendDeposit() {
    if (isDemoMode || !selectedJob) return;
    if (quoteDraft.quoteTotal === "" || quoteDraft.depositAmount === "") {
      setActionError("Enter both a quote total and deposit amount before recording the deposit."); return;
    }
    const quoteTotal = Number(quoteDraft.quoteTotal);
    const depositAmount = Number(quoteDraft.depositAmount);
    if (![quoteTotal, depositAmount].every((value) => Number.isFinite(value) && value >= 0 && value <= 100_000_000)) {
      setActionError("Quote and deposit must be valid nonnegative amounts."); return;
    }
    if (depositAmount > quoteTotal) {
      setActionError("Deposit cannot exceed the quote."); return;
    }
    const balanceDue =
      Math.max(quoteTotal - depositAmount, 0);

    if (selectedJob.status !== "NEW") return setActionError("Quote recording requires a new request.");
    if (!window.confirm("Record the quote and deposit as manually sent? This does not send a customer message.")) return;
    setIsSaving(true);
    setActionError("");
    let scheduleAndNotesSaved = false;
    let quoteRequestCompleted = false;
    try {
      await updateBooking({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
        preferredDate: quoteDraft.preferredDate,
        preferredTime: quoteDraft.preferredTime,
        operatorNotes: quoteDraft.operatorNotes,
      });
      scheduleAndNotesSaved = true;
      await sendDeposit({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
        quoteTotal,
        depositAmount,
        balanceDue,
        depositLink: quoteDraft.depositLink,
      });
      quoteRequestCompleted = true;
      await reloadAndVerifyJob(selectedJob.requestId, {
        status: "DEPOSIT_SENT",
        preferredDate: quoteDraft.preferredDate,
        preferredTime: quoteDraft.preferredTime,
        operatorNotes: quoteDraft.operatorNotes,
        quoteTotal, depositAmount, balanceDue,
        depositLink: quoteDraft.depositLink || "",
      });
    } catch (error) {
      const message = quoteRequestCompleted
        ? `The quote/deposit request completed, but the saved state could not be verified. Refresh and reconcile before retrying: ${error.message}`
        : scheduleAndNotesSaved
          ? `Schedule and notes saved, but the quote/deposit was not recorded: ${error.message}`
          : error.message;
      setActionError(message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirm() {
    if (isDemoMode || selectedJob.status !== "DEPOSIT_SENT") return;
    if (!window.confirm("Have you manually verified customer acceptance, payment, and schedule? Confirm booking and create a calendar event?")) return;
    setIsSaving(true);
    setActionError("");
    try {
      const updatedJob = await confirmBooking({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
      });
      await reloadAndVerifyJob(selectedJob.requestId, {
        status: "CONFIRMED", calendarEventId: updatedJob.calendarEventId,
      });
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComplete() {
    if (isDemoMode || selectedJob.status !== "CONFIRMED") return;
    if (Number(quoteDraft.actualDurationHours) <= 0 || Number(quoteDraft.actualDurationHours) !== selectedJob.actualDurationHours) return setActionError("Save the actual duration before completing.");
    if (!window.confirm("Mark this job complete? Verify job completion and outstanding payment separately.")) return;
    setIsSaving(true);
    setActionError("");
    try {
      const updatedJob = await completeJob({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
        actualDurationHours: selectedJob.actualDurationHours,
      });
      await reloadAndVerifyJob(selectedJob.requestId, {
        status: "DONE", actualDurationHours: updatedJob.actualDurationHours,
      });
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isCheckingSession) {
    return <main className="login-shell"><section className="login-card">Checking session…</section></main>;
  }

  if (!isUnlocked) {
    return <LoginGate onUnlock={handleUnlock} errorMessage={loginError} />;
  }

  return (
    <main className="app-shell">
      <div className="app-backdrop" />
      <section className="hero">
        <div className="brand-chip brand-chip--solid">Montreal Operator Dashboard</div>

        <div className="hero__callout-dashboard">
          <span className="hero__callout-label-dashboard">Dashboard status</span>
          <strong>
            {isLoading
              ? "Syncing live jobs..."
              : isSaving
                ? "Saving live job updates..."
                : dataError
                  ? "Unable to load jobs"
                  : isDemoMode ? "Demo data" : "Jobs loaded"}
          </strong>
        </div>

        <div className="hero__copy">
          <h1>Dude With A Pickup</h1>
          <p className="hero__body">
            Review booking requests, record quote details, and track job status.
          </p>
          <h2>Current workflow</h2>
          <p className="hero__body">
            Review the request and availability, prepare the quote and deposit link externally,
            then record those details here. Confirm a job only after checking the client and payment.
          </p>
          <p className="hero__body">
            Confirming records the status and creates a Jobs calendar event. Completing records
            the job as done. Customer messages and invoices are handled outside this dashboard.
          </p>
        </div>
      </section>

      <div className="dashboard-notices">
        {isDemoMode ? <p role="status">Demonstration mode: synthetic records only. Remove ?demo=1 for live data.</p> : null}
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={isLoading}>Refresh jobs</button>
        {!isDemoMode ? <button type="button" onClick={handleLogout}>Sign out</button> : null}
        {dataError ? <p role="alert">Could not load jobs: {dataError}</p> : null}
        {malformedCount ? <p role="alert">Skipped {malformedCount} malformed booking record{malformedCount === 1 ? "" : "s"}; check the source sheet mapping.</p> : null}
        {actionError ? <p role="alert">Could not save job: {actionError}</p> : null}
      </div>

      <section className="stats-grid">
        <StatCard
          label="New requests"
          value={stats.pending}
          helper="Needs quote and deposit"
          accent="gold"
        />
        <StatCard
          label="Confirmed today"
          value={stats.confirmedToday}
          helper="Jobs locked for dispatch"
          accent="white"
        />
        <StatCard
          label="Balance to collect"
          value={formatCurrency(stats.balanceOpen)}
          helper="Outstanding on-site total"
          accent="slate"
        />
        <StatCard
          label="Completed revenue"
          value={formatCurrency(stats.revenueCompleted)}
          helper="Closed jobs in this view"
          accent="gold"
        />
      </section>

      <section className="dashboard-grid">
        <aside className="list-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-heading__eyebrow">Job pipeline</p>
              <h2>Active jobs</h2>
            </div>
            <span>{jobs.length} records</span>
          </div>

          <div className="job-list">
            {isLoading ? <p role="status">Loading jobs…</p> : null}
            {!isLoading && dataError ? <div role="alert"><p>Jobs could not be loaded.</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></div> : null}
            {!isLoading && !dataError && jobs.length === 0 ? (
              <p role="status">No jobs found. New booking requests will appear here when received.</p>
            ) : null}
            {!isLoading && !dataError ? jobs.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                isActive={job.jobId === selectedJob?.jobId}
                onSelect={setSelectedJobId}
              />
            )) : null}
          </div>
        </aside>

        {selectedJob && !isLoading && !dataError ? (
          <JobDetail
            job={selectedJob}
            quoteDraft={quoteDraft}
            onQuoteChange={handleQuoteChange}
            onSendDeposit={handleSendDeposit}
            onSave={handleSave}
            onConfirm={handleConfirm}
            onComplete={handleComplete}
            isSaving={isSaving}
            isDemoMode={isDemoMode}
          />
        ) : null}
      </section>
    </main>
  );
}
