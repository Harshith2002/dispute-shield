import React, { useEffect, useState } from "react";
import { exportUrl, getCached, num, peek, signed, usd } from "../api.js";
import { ErrorBox, Loading } from "../components.jsx";

const METRICS = [
  ["usd_lost", "Dollars lost", (v) => usd(v)],
  ["disputes_lost", "Disputes lost", (v) => num(v)],
  ["disputes", "Disputes", (v) => num(v)],
];
const CONF_WHY = {
  high: "the direction holds in almost every resample and the range is tight",
  medium: "the direction holds in most resamples but the size is uncertain",
  low: "resamples disagree on the direction, so treat this as no reliable effect",
};
const CONF_TITLE = { assumed: "Assumed, not estimated" };

function RangeChart({ meta, metric, fmt, selected, onSelect }) {
  const rows = Object.entries(meta).map(([k, v]) => ({ key: k, label: v.label, ...v.metrics[metric] }));
  const lo = Math.min(0, ...rows.map((r) => r.low)), hi = Math.max(0, ...rows.map((r) => r.high));
  const span = hi - lo || 1;
  const x = (v) => `${((v - lo) / span) * 100}%`;
  return (
    <>
      <div className="range-chart">
        {rows.map((r) => (
          <div key={r.key} className={r.key === selected ? "range-row active" : "range-row"}>
            <button className="range-label" onClick={() => onSelect(r.key)} aria-pressed={r.key === selected}>{r.label}</button>
            <div className="range-track" role="img" aria-label={`${r.label}: estimate ${signed(r.estimate, fmt)}, range ${signed(r.low, fmt)} to ${signed(r.high, fmt)}, ${r.confidence} confidence`}
                 title={`Estimate ${signed(r.estimate, fmt)} · range ${signed(r.low, fmt)} to ${signed(r.high, fmt)} · ${r.confidence} confidence`}>
              <div className="range-zero" style={{ left: x(0) }} />
              <div className="range-band" style={{ left: x(r.low), width: `calc(${((r.high - r.low) / span) * 100}% + 2px)` }} />
              <div className="range-dot" style={{ left: x(r.estimate) }} />
            </div>
            <span className="range-value">{signed(r.estimate, fmt)}</span>
          </div>
        ))}
      </div>
      <div className="range-chart" aria-hidden="true">
        <span />
        <div className="axis-note"><span>{signed(lo, fmt)}</span><span>0 = no change</span><span>{signed(hi, fmt)}</span></div>
        <span />
      </div>
    </>
  );
}

export default function WhatIf() {
  const [data, setData] = useState(() => peek("whatif"));
  const [policy, setPolicy] = useState(() => Object.keys(peek("whatif")?.meta || {})[0] || "");
  const [metric, setMetric] = useState("usd_lost");
  const [error, setError] = useState("");
  const load = () => { setError(""); getCached("whatif").then((d) => { setData(d); setPolicy((p) => p || Object.keys(d.meta)[0]); }).catch((e) => setError(e.message)); };
  useEffect(load, []);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <div className="panel"><Loading what="policy estimates" /></div>;

  const fmt = METRICS.find((m) => m[0] === metric)[2];
  const best = Object.values(data.meta).reduce((a, b) => (b.metrics.usd_lost.estimate < a.metrics.usd_lost.estimate ? b : a));
  const p = data.meta[policy];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Policy what-if</h1>
          <p>What each policy would have changed had it applied from November 2024 to August 2026. {best.label} saves the most: an estimated <b className="num">{usd(-best.metrics.usd_lost.estimate)}</b> fewer dollars lost to disputes. Negative means fewer.</p>
        </div>
        <a className="btn btn-secondary" href={exportUrl("whatif_results")} download>Download whatif_results.csv</a>
      </div>

      <section className="panel" aria-labelledby="compare">
        <div className="panel-head">
          <h2 id="compare">Estimated change, with 90% range</h2>
          <div className="seg" role="group" aria-label="Measure">
            {METRICS.map(([k, label]) => <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}>{label}</button>)}
          </div>
        </div>
        <RangeChart meta={data.meta} metric={metric} fmt={fmt} selected={policy} onSelect={setPolicy} />
        <div className="legend" style={{ marginTop: 14 }}>
          <span><span className="swatch" style={{ background: "var(--chart)", borderRadius: "50%" }} />Estimate</span>
          <span><span className="swatch" style={{ background: "var(--chart-soft)", border: "1px solid var(--chart)", width: 18 }} />Range (5th to 95th percentile)</span>
          <span>Pick a policy for its detail</span>
        </div>
      </section>

      <section className="panel" aria-labelledby="policy">
        <div className="panel-head">
          <div>
            <h2 id="policy">{p.label}</h2>
            <p className="small" style={{ color: "var(--ink-2)", marginTop: 4 }}>{p.description}</p>
          </div>
          <p>Applies to {num(p.affected_payments)} payments · {p.assumption}</p>
        </div>
        <div className="grid-3">
          {METRICS.map(([k, label, f]) => {
            const m = p.metrics[k];
            return (
              <div className="metric-card" key={k}>
                <div className="figure-label">{label}</div>
                <div className="figure">{signed(m.estimate, f)}</div>
                <div className="small num">range {signed(m.low, f)} to {signed(m.high, f)}</div>
                <div className="small muted num">baseline {f(m.baseline)}</div>
                <div className={`small conf-${m.confidence}`} style={{ fontWeight: 700 }}>{CONF_TITLE[m.confidence] || m.confidence[0].toUpperCase() + m.confidence.slice(1) + " confidence"}</div>
                <div className="small muted">{m.confidence === "assumed"
                  ? "Held fixed by the policy's assumption above."
                  : `${Math.round(m.draws_same_sign * 100)}% of resamples agree on the direction: ${CONF_WHY[m.confidence]}. Without team controls the estimate would be ${signed(m.naive_no_team_controls, f)}.`}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <details className="method">
          <summary>How these estimates are made</summary>
          <ul>
            <li>Two models on months 1–22: the chance a payment is disputed, and the chance a dispute is lost. Both control for each team's average paperwork habits, so a policy gets credit only for the effect seen within teams, not for the fact that careful teams fill in more fields.</li>
            <li>The policy changes the affected payments (for example, adds the address), removes the jobs the brief says would leave ScanPay, and the change in expected disputes, losses and dollars (amount + $25 fee) is added up.</li>
            <li>Totals are scaled so the no-policy baseline matches what happened. The baseline counts still-open disputes at their predicted chance of being lost, so it is higher than the closed-only totals on the Dispute reasons page. Recent payments count only for the part of their 90-day dispute window that had passed.</li>
            <li>Range: 5th to 95th percentile over 30 refits on teams resampled with replacement, with the side-effect size varied from 50% to 150%.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
