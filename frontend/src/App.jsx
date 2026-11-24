import React, { useEffect, useState } from "react";
import { clearCache, get, getCached, num } from "./api.js";
import { ErrorBox } from "./components.jsx";
import Upload from "./pages/Upload.jsx";
import Payments from "./pages/Payments.jsx";
import Disputes from "./pages/Disputes.jsx";
import Team from "./pages/Team.jsx";
import AllTeams from "./pages/AllTeams.jsx";
import WhatIf from "./pages/WhatIf.jsx";

// Two sections: the period being scored (upload and its results), and the months 1-22 history the models learned from.
const SECTIONS = [
  { key: "period", label: "Score files", views: [["upload", "Upload"], ["payments", "Payments"], ["disputes", "Disputes"]] },
  { key: "history", label: "Months 1–22", views: [["team", "Teams"], ["all", "Dispute reasons"], ["whatif", "Policy what-if"]] },
];
const sectionOf = (view) => SECTIONS.find((s) => s.views.some(([v]) => v === view));

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [tab, setTab] = useState("upload");
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState("");
  const [session, setSession] = useState({ payments: null, disputes: null });
  const [team, setTeam] = useState("");
  const [paymentTier, setPaymentTier] = useState("");
  const [theme, setTheme] = useState(currentTheme);
  // remember the last sub-tab per section, so switching sections returns where you were
  const [lastView, setLastView] = useState({ period: "upload", history: "team" });

  const loadMeta = () => { setMetaError(""); getCached("meta").then(setMeta).catch((e) => setMetaError(e.message)); };
  const refresh = () => { clearCache(); return get("session").then(setSession).catch(() => {}); };
  useEffect(() => { loadMeta(); get("session").then(setSession).catch(() => {}); }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("ds-theme", next); } catch {}
    setTheme(next);
  };

  const go = (k) => { setTab(k); setLastView((l) => ({ ...l, [sectionOf(k).key]: k })); window.scrollTo(0, 0); };
  const openTeam = (id) => { setTeam(id); go("team"); };
  const openPayments = (tier = "") => { setPaymentTier(tier); go("payments"); };
  // after scoring, take the user straight to what was just scored
  const onScored = (step) => (step === "payments" ? openPayments("") : go("disputes"));

  const p = session.payments, d = session.disputes;
  const section = sectionOf(tab);
  const ready = { upload: true, payments: !!p, disputes: !!d, team: true, all: true, whatif: true };
  const why = { payments: "Score payments first", disputes: "Score disputes first" };
  const count = { payments: p && num(p.payments), disputes: d && num(d.disputes) };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <div className="wordmark">
              <strong>Dispute Shield</strong>
              <span>Chargeback risk and evidence for ScanPay teams · models trained on Nov 2024 – Aug 2026</span>
            </div>
            <div className="top-actions">
              <span className="session-pill" aria-live="polite">
                {p ? <><b className="num">{num(p.payments)}</b> payments{d ? <> · <b className="num">{num(d.disputes)}</b> disputes</> : null} scored</> : "No files scored yet"}
              </span>
              <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
                {theme === "dark" ? "Light theme" : "Dark theme"}
              </button>
            </div>
          </div>
          <nav className="nav" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => go(lastView[s.key])} aria-current={section.key === s.key ? "page" : undefined}>
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <nav className="subnav" aria-label={`${section.label} views`}>
          {section.views.map(([k, label]) => (
            <button key={k} onClick={() => go(k)} disabled={!ready[k]} title={ready[k] ? undefined : why[k]}
                    aria-current={tab === k ? "page" : undefined}>
              {label}
              {count[k] && <span className="count num">{count[k]}</span>}
              {!ready[k] && <span className="sr-only"> ({why[k]})</span>}
            </button>
          ))}
        </nav>
        {metaError && <div style={{ marginBottom: 16 }}><ErrorBox message={`Could not reach the Dispute Shield server (${metaError}).`} onRetry={loadMeta} /></div>}
        {tab === "upload" && <Upload session={session} onChange={refresh} onScored={onScored} meta={meta} openPayments={openPayments} openDisputes={() => go("disputes")} />}
        {tab === "payments" && <Payments session={session} meta={meta} openTeam={openTeam} goUpload={() => go("upload")} tier={paymentTier} setTier={setPaymentTier} />}
        {tab === "disputes" && <Disputes session={session} meta={meta} openTeam={openTeam} goUpload={() => go("upload")} />}
        {tab === "team" && <Team meta={meta} team={team} setTeam={setTeam} />}
        {tab === "all" && <AllTeams session={session} />}
        {tab === "whatif" && <WhatIf />}
      </main>
      <footer className="topbar-inner muted small" style={{ paddingBottom: 32 }}>
        Uploaded files are held in server memory for this browser tab only and are never used to retrain the models.
      </footer>
    </>
  );
}
