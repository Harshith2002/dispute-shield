import React, { useEffect, useState } from "react";
import { get } from "./api.js";
import Upload from "./pages/Upload.jsx";
import Payments from "./pages/Payments.jsx";
import Disputes from "./pages/Disputes.jsx";
import Team from "./pages/Team.jsx";
import AllTeams from "./pages/AllTeams.jsx";
import WhatIf from "./pages/WhatIf.jsx";

const TABS = [
  ["upload", "Upload & export"],
  ["payments", "Payments"],
  ["disputes", "Disputes"],
  ["team", "By team"],
  ["all", "All teams"],
  ["whatif", "What-if"],
];

export default function App() {
  const [tab, setTab] = useState("upload");
  const [meta, setMeta] = useState(null);
  const [session, setSession] = useState({ payments: null, disputes: null });
  const [team, setTeam] = useState("");
  const [error, setError] = useState("");

  const refresh = () => get("session").then(setSession).catch(() => {});
  useEffect(() => {
    get("meta").then(setMeta).catch((e) => setError(e.message));
    refresh();
  }, []);

  const openTeam = (id) => {
    setTeam(id);
    setTab("team");
    window.scrollTo(0, 0);
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">◆</span>
          <div>
            <h1>Dispute Shield</h1>
            <p className="muted small">
              Models trained on months 1–22{meta ? ` (through ${meta.trained_through})` : ""}. Uploads are scored, never used for training.
            </p>
          </div>
        </div>
        <nav aria-label="Sections">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "tab active" : "tab"} onClick={() => setTab(k)}
                    aria-current={tab === k ? "page" : undefined}>
              {label}
              {k === "payments" && session.payments ? <span className="count">{session.payments.payments}</span> : null}
              {k === "disputes" && session.disputes ? <span className="count">{session.disputes.disputes}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      {error && <div className="error">Could not reach the server: {error}</div>}
      <main>
        {tab === "upload" && <Upload session={session} onChange={refresh} meta={meta} />}
        {tab === "payments" && <Payments session={session} meta={meta} openTeam={openTeam} goUpload={() => setTab("upload")} />}
        {tab === "disputes" && <Disputes session={session} meta={meta} openTeam={openTeam} goUpload={() => setTab("upload")} />}
        {tab === "team" && <Team meta={meta} team={team} setTeam={setTeam} />}
        {tab === "all" && <AllTeams />}
        {tab === "whatif" && <WhatIf />}
      </main>
    </div>
  );
}
