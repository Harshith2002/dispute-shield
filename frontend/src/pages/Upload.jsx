import React, { useState } from "react";
import { exportUrl, num, pct, upload, usd } from "../api.js";
import { ErrorBox, Figure, TierBar } from "../components.jsx";

const STEP1 = ["invoices", "photos", "payments"];
const ALL = [...STEP1, "disputes"];

const size = (f) => (f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${(f.size / 1e6).toFixed(1)} MB`);

function Slot({ name, hint, file, onPick }) {
  return (
    <label className={file ? "drop has-file" : "drop"}>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onPick(e.target.files[0] || null)} />
      <span className="drop-name">{name}.csv</span>
      <span className="drop-meta">{file ? `${file.name} · ${size(file)}` : hint}</span>
    </label>
  );
}

export default function Upload({ session, onChange, meta, openPayments, openDisputes }) {
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const p = session.payments, d = session.disputes;
  const step1Ready = STEP1.every((k) => files[k]);

  return (
    <div className={dragging ? "dropzone-page dragging stack" : "dropzone-page stack"}
         onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="page-head">
        <div>
          <h1>Score a new period</h1>
          <p>Upload the period's files in the same format as the training data. Every payment, then every dispute, is scored with the frozen models. Drop all four CSVs anywhere on this page and they go to the right slot.</p>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="steps">
        <section className="panel step" aria-labelledby="step1">
          <div className="step-num">Step 1</div>
          <h2 id="step1">Invoices, photos and payments</h2>
          <p className="muted small" style={{ marginTop: 6 }}>Gives every payment a dispute risk, a win chance if disputed, an expected loss and the evidence still worth adding.</p>
          <div className="drop-list">
            <Slot name="invoices" hint="One row per job" file={files.invoices} onPick={pick("invoices")} />
            <Slot name="photos" hint="One row per job photo" file={files.photos} onPick={pick("photos")} />
            <Slot name="payments" hint="One row per payment" file={files.payments} onPick={pick("payments")} />
          </div>
          <button className="btn btn-primary" disabled={!step1Ready || !!busy} onClick={() => run("payments")}>
            {busy === "payments" ? "Scoring payments…" : p ? "Score payments again" : "Score payments"}
          </button>
          {busy === "payments" && <p className="muted small" role="status" style={{ marginTop: 8 }}>A two-month file takes about five seconds.</p>}
        </section>

        <section className={p ? "panel step" : "panel step locked"} aria-labelledby="step2">
          <div className="step-num">Step 2</div>
          <h2 id="step2">Disputes</h2>
          <p className="muted small" style={{ marginTop: 6 }}>Gives every dispute a win chance with the evidence submitted, and whether fighting is worth the $15 it costs.</p>
          <div className="drop-list">
            <Slot name="disputes" hint="Disputes raised on the step 1 payments, without outcomes" file={files.disputes} onPick={pick("disputes")} />
          </div>
          <button className="btn btn-primary" disabled={!files.disputes || !!busy || (!p && !step1Ready)} onClick={() => run("disputes")}>
            {busy === "disputes" ? "Scoring disputes…" : "Score disputes"}
          </button>
          {!p && <p className="muted small" style={{ marginTop: 8 }}>Disputes are scored against the step 1 payments, so run step 1 first.</p>}
        </section>
      </div>

      {p && (
        <section className="panel" aria-labelledby="res1">
          <div className="panel-head">
            <h2 id="res1">Payments scored</h2>
            <p className="num">{p.period[0]?.slice(0, 10)} to {p.period[1]?.slice(0, 10)} · {p.teams} teams</p>
          </div>
          <div className="grid-2">
            <div>
              <Figure hero label="Expected dispute losses on these payments" value={usd(p.expected_loss_usd)}
                      note={`${num(p.expected_disputes)} disputes expected (${pct(p.expected_disputes / p.payments, 2)} of ${num(p.payments)} payments, ${usd(p.volume_usd)} collected)`} />
              <div style={{ marginTop: 18 }}>
                <div className="figure-label">Payments by dispute risk</div>
                <TierBar tiers={p.tiers} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              <p className="small">The high-risk {num(p.tiers.high)} are where checking the card and adding paperwork pays off most.</p>
              <button className="btn btn-primary" onClick={() => openPayments("high")}>Review high-risk payments</button>
              <button className="btn btn-secondary" onClick={() => openPayments("")}>See all payments</button>
            </div>
          </div>
        </section>
      )}

      {d && (
        <section className="panel" aria-labelledby="res2">
          <div className="panel-head">
            <h2 id="res2">Disputes scored</h2>
            {d.unmatched > 0 && <p className="warn-text">{d.unmatched} disputes had no matching payment and were scored from the dispute alone.</p>}
          </div>
          <div className="figures">
            <Figure label="Worth fighting" value={num(d.fight)} note="win chance × (amount + $25 fee) > $15" />
            <Figure label="Accept" value={num(d.accept)} note="fighting costs more than it is likely to recover" />
            <div style={{ alignSelf: "center" }}><button className="btn btn-primary" onClick={openDisputes}>Review disputes</button></div>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="exp">
        <div className="panel-head"><h2 id="exp">Exports</h2><p>CSV files in the brief's formats.</p></div>
        <div className="exports">
          {[
            ["payment_predictions", "One row per uploaded payment: win chances, risk tier and score, expected loss.", p, "Run step 1 first"],
            ["dispute_predictions", "One row per uploaded dispute: win chance and fight or accept.", d, "Run step 2 first"],
            ["whatif_results", "One row per policy and metric for months 1–22, with ranges.", true, ""],
          ].map(([name, text, ready, why]) => (
            <div className="export-row" key={name}>
              <div><div className="mono">{name}.csv</div><p>{text}</p></div>
              {ready ? <a className="btn btn-secondary" href={exportUrl(name)} download>Download {name}.csv</a>
                     : <button className="btn btn-secondary" disabled title={why}>{why}</button>}
            </div>
          ))}
        </div>
        {p?.blank_columns?.length > 0 && <p className="muted small">Left blank on purpose: {p.blank_columns.join(", ")}.</p>}
        {meta && <p className="muted small" style={{ marginTop: 10 }}>Models: risk {meta.models.chosen.risk}, invoice win {meta.models.chosen.win_invoice}, payment win {meta.models.chosen.win_payment}, dispute win {meta.models.chosen.win_dispute}. Comparison tables are in the repository's experiments folder.</p>}
      </section>
    </div>
  );
}
