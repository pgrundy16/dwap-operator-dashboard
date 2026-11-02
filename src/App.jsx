import { useCallback, useEffect, useMemo, useState } from "react";
import {
  completeJob,
  confirmBooking,
  fetchJobs,
  getSession,
  login,
  logout,
  sendDeposit,
} from "./lib/api";
import { LoginGate } from "./components/LoginGate";
import { StatCard } from "./components/StatCard";
import { JobCard } from "./components/JobCard";
import { JobDetail } from "./components/JobDetail";
import { formatCurrency } from "./lib/formatters";

function buildQuoteDraft(job) {
  return {
    quoteTotal: job?.quoteTotal ?? "",
    depositAmount: job?.depositAmount ?? "",
    balanceDue: job?.balanceDue ?? "",
    depositLink: job?.depositLink ?? "",
  };
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [quoteDraft, setQuoteDraft] = useState(buildQuoteDraft(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState("");
  const [actionError, setActionError] = useState("");

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
        const data = await fetchJobs();
        if (!isMounted) return;
        setJobs(data);
        setSelectedJobId((current) =>
          data.some((job) => job.jobId === current) ? current : data[0]?.jobId || "",
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
  }, [isUnlocked, lockDashboard]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId) || jobs[0],
    [jobs, selectedJobId],
  );

  useEffect(() => {
    setQuoteDraft(buildQuoteDraft(selectedJob));
  }, [selectedJob]);

  const stats = useMemo(() => {
    const pending = jobs.filter((job) => job.status === "NEW").length;
    const confirmedToday = jobs.filter(
      (job) =>
        job.status === "CONFIRMED" &&
        job.preferredDate === new Date().toISOString().slice(0, 10),
    ).length;
    const balanceOpen = jobs.reduce(
      (total, job) => total + (job.status === "CONFIRMED" ? Number(job.balanceDue || 0) : 0),
      0,
    );
    const revenueCompleted = jobs.reduce(
      (total, job) => total + (job.status === "DONE" ? Number(job.quoteTotal || 0) : 0),
      0,
    );

    return { pending, confirmedToday, balanceOpen, revenueCompleted };
  }, [jobs]);

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

  function replaceJob(updatedJob) {
    setJobs((currentJobs) => {
      const exists = currentJobs.some((job) => job.jobId === updatedJob.jobId);
      if (!exists) return [updatedJob, ...currentJobs];
      return currentJobs.map((job) =>
        job.jobId === updatedJob.jobId ? updatedJob : job,
      );
    });
    setSelectedJobId(updatedJob.jobId);
  }

  function handleQuoteChange(key, value) {
    setQuoteDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSendDeposit() {
    const quoteTotal = Number(quoteDraft.quoteTotal || 0);
    const depositAmount = Number(quoteDraft.depositAmount || 0);
    const balanceDue =
      Number(quoteDraft.balanceDue || 0) || Math.max(quoteTotal - depositAmount, 0);

    setIsSaving(true);
    setActionError("");
    try {
      const updatedJob = await sendDeposit({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
        quoteTotal,
        depositAmount,
        balanceDue,
        depositLink: quoteDraft.depositLink,
      });

      replaceJob({
        ...selectedJob,
        ...updatedJob,
      });
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirm() {
    setIsSaving(true);
    setActionError("");
    try {
      const updatedJob = await confirmBooking({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
      });

      replaceJob({
        ...selectedJob,
        ...updatedJob,
      });
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) lockDashboard("Your session expired. Sign in again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComplete() {
    setIsSaving(true);
    setActionError("");
    try {
      const updatedJob = await completeJob({
        jobId: selectedJob.jobId,
        requestId: selectedJob.requestId,
        actualDurationHours:
          selectedJob.actualDurationHours || selectedJob.estimatedTimeHours,
      });

      replaceJob({
        ...selectedJob,
        ...updatedJob,
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
      <section className="hero-header">
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
                  : "Jobs loaded"}
          </strong>
        </div>
      </section>
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
                  : "Jobs loaded"}
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
        <button type="button" onClick={handleLogout}>Sign out</button>
        {dataError ? <p role="alert">Could not load jobs: {dataError}</p> : null}
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
            {!isLoading && !dataError && jobs.length === 0 ? (
              <p>No jobs found.</p>
            ) : jobs.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                isActive={job.jobId === selectedJob?.jobId}
                onSelect={setSelectedJobId}
              />
            ))}
          </div>
        </aside>

        {selectedJob ? (
          <JobDetail
            job={selectedJob}
            quoteDraft={quoteDraft}
            onQuoteChange={handleQuoteChange}
            onSendDeposit={handleSendDeposit}
            onConfirm={handleConfirm}
            onComplete={handleComplete}
            isSaving={isSaving}
          />
        ) : null}
      </section>
    </main>
  );
}
