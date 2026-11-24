import React, { useEffect, useState } from "react";
import { get, num, pct, usd } from "../api.js";
import { Bar, Stat } from "../components.jsx";

export default function AllTeams() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { get("overview").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const t = data.history.totals;
  const rows = data.history.by_reason;
  const maxLost = Math.max(...rows.map((r) => r.usd_lost));
  const up = data.uploaded_disputes;

  return (
    <div className="stack">
      <section className="card">
        <h2>All teams · months 1–22</h2>
        <div className="stats">
          <Stat label="Payments" value={num(t.payments)} />
          <Stat label="Disputes" value={num(t.disputes)} hint={`${pct(t.dispute_rate, 2)} of payments`} />
          <Stat label="Win rate" value={pct(t.win_rate)} hint={`${num(t.won)} won · ${num(t.lost)} lost · ${num(t.withdrawn)} withdrawn · ${num(t.open)} open`} />
          <Stat label="Lost to disputes" value={usd(t.usd_lost)} hint="amount + $25 fee per lost dispute" />
          <Stat label="Responded" value={pct(t.responded_rate)} />
        </div>
      </section>

      <section className="card">
        <h3>By dispute reason</h3>
        <table>
          <thead>
            <tr><th>Reason</th><th className="num">Disputes</th><th className="num">Win rate</th><th className="num">Responded</th><th className="num">Avg amount</th><th className="num">$ lost</th><th className="bar-col"></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reason}>
                <td>{r.label}</td>
                <td className="num">{num(r.disputes)}</td>
                <td className="num">{pct(r.win_rate)}</td>
                <td className="num">{pct(r.responded_rate)}</td>
                <td className="num">{usd(r.avg_amount)}</td>
                <td className="num">{usd(r.usd_lost)}</td>
                <td className="bar-col"><Bar value={r.usd_lost} max={maxLost} tone="danger" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Win rate = won ÷ (won + lost). Withdrawn and still-open disputes are left out.</p>
      </section>

      {up && (
        <section className="card">
          <h3>Uploaded disputes by reason</h3>
          <table>
            <thead><tr><th>Reason</th><th className="num">Disputes</th><th className="num">Avg win chance</th><th className="num">Fight</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {up.by_reason.map((r) => (
                <tr key={r.reason}><td>{r.label}</td><td className="num">{r.disputes}</td><td className="num">{pct(r.avg_win_prob)}</td><td className="num">{r.fight}</td><td className="num">{usd(r.amount_usd)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
