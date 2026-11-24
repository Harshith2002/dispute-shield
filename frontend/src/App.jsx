import React, { useEffect, useState } from "react";
import { get, num } from "./api.js";
import { ErrorBox } from "./components.jsx";
import Upload from "./pages/Upload.jsx";
import Payments from "./pages/Payments.jsx";
import Disputes from "./pages/Disputes.jsx";
import Team from "./pages/Team.jsx";
import AllTeams from "./pages/AllTeams.jsx";
import WhatIf from "./pages/WhatIf.jsx";

const TABS = [
  ["upload", "Score files"],
  ["payments", "Payments"],
  ["disputes", "Disputes"],
  ["team", "Teams"],
  ["all", "Dispute reasons"],
  ["whatif", "Policy what-if"],
];

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

  const loadMeta = () => { setMetaError(""); get("meta").then(setMeta).catch((e) => setMetaError(e.message)); };
  const refresh = () => get("session").then(setSession).catch(() => {});
  useEffect(() => { loadMeta(); refresh(); }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("ds-theme", next); } catch {}
    setTheme(next);
  };

  const go = (k) => { setTab(k); window.scrollTo(0, 0); };
  const openTeam = (id) => { setTeam(id); go("team"); };
  const openPayments = (tier = "") => { setPaymentTier(tier); go("payments"); };

  const p = session.payments, d = session.disputes;

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
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}>
                {label}
                {k === "payments" && p && <span className="count num">{num(p.payments)}</span>}
                {k === "disputes" && d && <span className="count num">{num(d.disputes)}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {metaError && <div style={{ marginBottom: 16 }}><ErrorBox message={`Could not reach the Dispute Shield server (${metaError}).`} onRetry={loadMeta} /></div>}
        {tab === "upload" && <Upload session={session} onChange={refresh} meta={meta} openPayments={openPayments} openDisputes={() => go("disputes")} />}
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
