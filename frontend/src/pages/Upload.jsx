import React, { useState } from "react";
import { exportUrl, num, upload } from "../api.js";
import { ErrorBox } from "../components.jsx";

const STEP1 = ["invoices", "photos", "payments"];
const ALL = [...STEP1, "disputes"];

const size = (f) => (f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${(f.size / 1e6).toFixed(1)} MB`);
const MAX_BYTES = 20 * 1024 * 1024; // matches the server's per-file limit
const tooBig = (fs) => Object.entries(fs).filter(([, f]) => f && f.size > MAX_BYTES).map(([k, f]) => `${k}.csv (${size(f)})`);

function Slot({ name, hint, file, onPick }) {
  return (
    <label className={file ? "drop has-file" : "drop"}>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onPick(e.target.files[0] || null)} />
      <span className="drop-name">{name}.csv</span>
      <span className="drop-meta">{file ? `${file.name} · ${size(file)}` : hint}</span>
    </label>
  );
}

export default function Upload({ session, onChange, onScored, openPayments, openDisputes }) {
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [redo, setRedo] = useState(false);
  const pick = (k) => (f) => setFiles((s) => ({ ...s, [k]: f }));

  // Dropping several CSVs at once: match each to its slot by file name.
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const next = { ...files };
    const unmatched = [];
    for (const f of e.dataTransfer.files) {
      const key = ALL.find((k) => f.name.toLowerCase().includes(k));
      key ? (next[key] = f) : unmatched.push(f.name);
    }
    setFiles(next);
    setError(unmatched.length ? `Not recognised: ${unmatched.join(", ")}. File names must contain invoices, photos, payments or disputes.` : "");
  };

  const run = async (step) => {
    const big = tooBig(step === "payments" ? { invoices: files.invoices, photos: files.photos, payments: files.payments } : { disputes: files.disputes });
    if (big.length) {
      setError(`Too large: ${big.join(", ")}. The limit is 20 MB per file. Upload one period's files (about 4 MB each for two months), not the full months 1–22 training data.`);
      return;
    }
    setError("");
    setBusy(step);
    try {
      if (step === "payments") {
        await upload("upload/payments", { invoices: files.invoices, photos: files.photos, payments: files.payments });
      } else {
        // re-send step 1 files when we still have them, in case the server restarted between steps
        const extra = STEP1.every((k) => files[k]) ? { invoices: files.invoices, photos: files.photos, payments: files.payments } : {};
        await upload("upload/disputes", { disputes: files.disputes, ...extra });
      }
      await onChange();
      if (step === "payments") setRedo(false);
      onScored(step);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const p = session.payments, d = session.disputes;
  const step1Ready = STEP1.every((k) => files[k]);
  // which step is in front of the user: redoing step 1 always wins, then whatever is not done yet
  const stage = redo || !p ? 1 : !d ? 2 : 3;

  const step1 = (
    <section className="panel step" aria-labelledby="step1">
      <div className="step-num">Step 1 of 2</div>
      <h2 id="step1">Upload invoices, photos and payments</h2>
      <p className="muted small" style={{ marginTop: 6 }}>Gives every payment a dispute risk, a win chance if disputed, an expected loss and the evidence still worth adding. Tip: drop all four CSVs on this page at once and each goes to the right place.</p>
      <div className="drop-list">
        <Slot name="invoices" hint="One row per job" file={files.invoices} onPick={pick("invoices")} />
        <Slot name="photos" hint="One row per job photo" file={files.photos} onPick={pick("photos")} />
        <Slot name="payments" hint="One row per payment" file={files.payments} onPick={pick("payments")} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" disabled={!step1Ready || !!busy} onClick={() => run("payments")}>
          {busy === "payments" ? "Scoring payments…" : "Score payments"}
        </button>
        {redo && p && <button className="btn btn-secondary" disabled={!!busy} onClick={() => setRedo(false)}>Keep current results</button>}
        {!step1Ready && !busy && <span className="muted small">Choose all three files to continue.</span>}
      </div>
      {busy === "payments" && <p className="muted small" role="status" style={{ marginTop: 8 }}>A two-month file takes about five seconds.</p>}
    </section>
  );

  const step2 = (
    <section className="panel step" aria-labelledby="step2">
      <div className="step-num">Step 2 of 2</div>
      <h2 id="step2">Upload disputes</h2>
      <p className="muted small" style={{ marginTop: 6 }}>Gives every dispute raised on these payments a win chance with the evidence submitted, and whether fighting is worth the $15 it costs. If the disputes are not in yet, the payment results are ready on the Payments tab.</p>
      <div className="drop-list">
        <Slot name="disputes" hint="Disputes raised on the step 1 payments, without outcomes" file={files.disputes} onPick={pick("disputes")} />
      </div>
      <button className="btn btn-primary" disabled={!files.disputes || !!busy} onClick={() => run("disputes")}>
        {busy === "disputes" ? "Scoring disputes…" : "Score disputes"}
      </button>
    </section>
  );

  return (
    <div className={dragging ? "dropzone-page dragging stack" : "dropzone-page stack"}
         onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="page-head">
        <div>
          <h1>Score a new period</h1>
          <p>Upload a period's files in the same format as the training data. Payments are scored first, then the disputes raised on them, all with the frozen months 1–22 models.</p>
        </div>
        {stage > 1 && <button className="btn btn-secondary" onClick={() => setRedo(true)}>Upload different files</button>}
      </div>

      <ol className="stepper" aria-label="Progress">
        {[["Upload payments", p && !redo ? `${num(p.payments)} scored` : ""], ["Upload disputes", d && !redo ? `${num(d.disputes)} scored` : ""], ["Review results", ""]].map(([label, note], i) => {
          const n = i + 1;
          const state = n < stage || (n === 3 && stage === 3) ? "done" : n === stage ? "current" : "todo";
          return (
            <li key={label} className={state} aria-current={n === stage ? "step" : undefined}>
              <span className="stepper-dot" aria-hidden="true">{state === "done" ? "✓" : n}</span>
              <span><span className="stepper-label">{label}</span>{note && <span className="cell-sub">{note}</span>}</span>
            </li>
          );
        })}
      </ol>

      {error && <ErrorBox message={error} />}

      {stage === 1 && step1}
      {stage === 1 && !p && (
        <p className="muted small">The policy what-if needs no upload: it is under Months 1–22, or <a href={exportUrl("whatif_results")} download>download whatif_results.csv</a> now.</p>
      )}
      {stage === 2 && step2}

      {stage === 3 && (
        <section className="panel" aria-labelledby="done">
          <h2 id="done">Both steps scored</h2>
          <p className="muted small" style={{ marginTop: 6 }}>{num(p.payments)} payments and {num(d.disputes)} disputes, {p.period[0]?.slice(0, 10)} to {p.period[1]?.slice(0, 10)}. Results and CSV exports are on the Payments and Disputes tabs.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => openPayments("")}>Open payments</button>
            <button className="btn btn-secondary" onClick={openDisputes}>Open disputes</button>
          </div>
        </section>
      )}
    </div>
  );
}
