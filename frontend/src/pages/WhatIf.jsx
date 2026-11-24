import React, { useEffect, useState } from "react";
import { get, num, signed, usd } from "../api.js";

const METRICS = [
  ["disputes", "Disputes", (v) => num(v)],
  ["disputes_lost", "Disputes lost", (v) => num(v)],
  ["usd_lost", "Dollars lost", (v) => usd(v)],
];

function Range({ m }) {
  // position estimate and range on a scale that always includes zero
  const lo = Math.min(m.low, 0), hi = Math.max(m.high, 0);
  const span = hi - lo || 1;
  const x = (v) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="range" aria-hidden="true">
      <div className="range-zero" style={{ left: x(0) }} />
      <div className="range-band" style={{ left: x(m.low), width: `${((m.high - m.low) / span) * 100}%` }} />
      <div className="range-dot" style={{ left: x(m.estimate) }} />
    </div>
  );
}

export default function WhatIf() {
  const [data, setData] = useState(null);
  const [policy, setPolicy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    get("whatif").then((d) => { setData(d); setPolicy(Object.keys(d.meta)[0]); }).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const p = data.meta[policy];

  return (
    <div className="stack">
      <section className="card">
        <h2>What-if · months 1–22</h2>
        <p className="muted">How disputes and losses would have changed if the policy had applied from November 2024. Negative means fewer.</p>
        <div className="policy-picker" role="tablist">
          {Object.entries(data.meta).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={k === policy} className={k === policy ? "tab active" : "tab"} onClick={() => setPolicy(k)}>{v.label}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>{p.label}</h3>
        <p>{p.description}</p>
        <p className="muted small">Applies to {num(p.affected_payments)} payments · side effect: {p.assumption} ({num(p.jobs_lost)} jobs).</p>
        <div className="metric-grid">
          {METRICS.map(([key, label, fmt]) => {
            const m = p.metrics[key];
            return (
              <div className="metric" key={key}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{signed(m.estimate, fmt)}</div>
                <div className="muted small">range {signed(m.low, fmt)} to {signed(m.high, fmt)} · baseline {fmt(m.baseline)}</div>
                <Range m={m} />
                <div className={`conf conf-${m.confidence}`}>{m.confidence} confidence</div>
                <div className="muted small">{Math.round(m.draws_same_sign * 100)}% of bootstrap draws agree on the direction. Without team controls: {signed(m.naive_no_team_controls, fmt)}.</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>How this is estimated</h3>
        <ul className="plain">
          <li>Two models on months 1–22: chance a payment is disputed, and chance a dispute is lost. Both control for each team's average paperwork habits, so a policy is credited only with the effect seen <i>within</i> teams, not with the fact that careful teams fill in more fields.</li>
          <li>The policy changes the affected payments (e.g. adds the address), removes the jobs the brief says would be lost, and we add up the change in expected disputes, losses and dollars (amount + $25 fee).</li>
          <li>Totals are scaled so the no-policy baseline matches what actually happened. The baseline counts still-open disputes at their predicted chance of being lost, so it is higher than the closed-only totals on the All teams page. Recent payments count only for the part of their 90-day dispute window that had passed.</li>
          <li>Range: 5th–95th percentile over 30 refits on teams resampled with replacement, with the side-effect size varied 50%–150%.</li>
        </ul>
      </section>

      <section className="card">
        <h3>All policies</h3>
        <table>
          <thead><tr><th>Policy</th><th className="num">Disputes</th><th className="num">Disputes lost</th><th className="num">Dollars lost</th></tr></thead>
          <tbody>
            {Object.entries(data.meta).map(([k, v]) => (
              <tr key={k}>
                <td>{v.label}</td>
                {METRICS.map(([key, , fmt]) => (
                  <td className="num" key={key}>{signed(v.metrics[key].estimate, fmt)} <span className="muted small">({signed(v.metrics[key].low, fmt)} to {signed(v.metrics[key].high, fmt)})</span></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
