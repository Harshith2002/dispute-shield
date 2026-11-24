import React, { useState } from "react";
import { exportUrl, num, pct, upload, usd } from "../api.js";
import { Stat } from "../components.jsx";

function FilePick({ name, file, setFile }) {
  return (
    <label className="file">
      <span className="file-name">{name}.csv</span>
      <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} />
      <span className={file ? "file-chosen" : "muted small"}>{file ? `${file.name} · ${file.size < 1e6 ? `${Math.max(1, Math.round(file.size / 1e3))} KB` : `${(file.size / 1e6).toFixed(1)} MB`}` : "Choose file"}</span>
    </label>
  );
}

export default function Upload({ session, onChange, meta }) {
  const [files, setFiles] = useState({ invoices: null, photos: null, payments: null, disputes: null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (k) => (f) => setFiles((s) => ({ ...s, [k]: f }));

  const run = async (step) => {
    setError("");
    setBusy(step);
    try {
      if (step === "payments") {
        await upload("upload/payments", { invoices: files.invoices, photos: files.photos, payments: files.payments });
      } else {
        // send step-1 files again when we still have them, in case the server restarted between steps
        const extra = files.invoices && files.photos && files.payments
          ? { invoices: files.invoices, photos: files.photos, payments: files.payments } : {};
        await upload("upload/disputes", { disputes: files.disputes, ...extra });
      }
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const p = session.payments;
  const d = session.disputes;
  const step1Ready = files.invoices && files.photos && files.payments;

  return (
    <div className="stack">
      <section className="card">
        <h2>Step 1 · Invoices, photos and payments</h2>
        <p className="muted">Scores every payment: chance of winning if disputed (from the invoice alone, then with the payment), dispute risk and expected loss.</p>
        <div className="files">
          <FilePick name="invoices" file={files.invoices} setFile={set("invoices")} />
          <FilePick name="photos" file={files.photos} setFile={set("photos")} />
          <FilePick name="payments" file={files.payments} setFile={set("payments")} />
        </div>
        <button className="primary" disabled={!step1Ready || busy} onClick={() => run("payments")}>
          {busy === "payments" ? "Scoring payments…" : "Score payments"}
        </button>
        {p && (
          <div className="result">
            <div className="stats">
              <Stat label="Payments scored" value={num(p.payments)} hint={`${p.teams} teams · ${p.period[0]?.slice(0, 10)} to ${p.period[1]?.slice(0, 10)}`} />
              <Stat label="High risk" value={num(p.tiers.high)} hint={`${num(p.tiers.medium)} medium · ${num(p.tiers.low)} low`} />
              <Stat label="Expected disputes" value={num(p.expected_disputes)} hint={`${pct(p.expected_disputes / p.payments, 2)} of payments`} />
              <Stat label="Expected dispute loss" value={usd(p.expected_loss_usd)} hint={`on ${usd(p.volume_usd)} collected`} />
            </div>
            <a className="button" href={exportUrl("payment_predictions")}>Download payment_predictions.csv</a>
            {p.blank_columns.length > 0 && <p className="muted small">Left blank on purpose: {p.blank_columns.join(", ")} (see approach document).</p>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Step 2 · Disputes</h2>
        <p className="muted">Scores every dispute: chance of winning with the evidence submitted, and whether fighting is worth the $15 it costs.</p>
        <div className="files">
          <FilePick name="disputes" file={files.disputes} setFile={set("disputes")} />
        </div>
        <button className="primary" disabled={!files.disputes || busy || (!p && !step1Ready)} onClick={() => run("disputes")}>
          {busy === "disputes" ? "Scoring disputes…" : "Score disputes"}
        </button>
        {!p && <p className="muted small">Run step 1 first.</p>}
        {d && (
          <div className="result">
            <div className="stats">
              <Stat label="Disputes scored" value={num(d.disputes)} hint={d.unmatched ? `${d.unmatched} without a matching payment` : "all matched to a payment"} />
              <Stat label="Fight" value={num(d.fight)} hint="win chance × (amount + $25) > $15" />
              <Stat label="Accept" value={num(d.accept)} />
            </div>
            <a className="button" href={exportUrl("dispute_predictions")}>Download dispute_predictions.csv</a>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Policy what-if</h2>
        <p className="muted">Estimated change over months 1–22 for each policy, with ranges. Does not need an upload.</p>
        <a className="button" href={exportUrl("whatif_results")}>Download whatif_results.csv</a>
      </section>

      {error && <div className="error" role="alert">{error}</div>}
      {meta && (
        <p className="muted small">
          Models in use: risk = {meta.models.chosen.risk}, invoice win = {meta.models.chosen.win_invoice}, payment win = {meta.models.chosen.win_payment}, dispute win = {meta.models.chosen.win_dispute}.
        </p>
      )}
    </div>
  );
}
