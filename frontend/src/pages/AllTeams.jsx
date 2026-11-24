import React, { useEffect, useState } from "react";
import { get, num, pct, usd } from "../api.js";
import { ErrorBox, Figure, HBarChart, Loading } from "../components.jsx";

export default function AllTeams({ session }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = () => { setError(""); get("overview").then(setData).catch((e) => setError(e.message)); };
  useEffect(load, [session.disputes]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <div className="panel"><Loading what="dispute history" /></div>;

  const t = data.history.totals;
  const rows = data.history.by_reason;
  const top = rows[0];
  const up = data.uploaded_disputes;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Where dispute dollars are lost</h1>
          <p>All 200 teams, months 1–22. {top.label} disputes cost the most: <b className="num">{usd(top.usd_lost)}</b> of <b className="num">{usd(t.usd_lost)}</b> lost, with a {pct(top.win_rate)} win rate.</p>
        </div>
      </div>

      <section className="panel">
        <div className="figures">
          <Figure label="Disputes" value={num(t.disputes)} note={`${pct(t.dispute_rate, 2)} of ${num(t.payments)} payments`} />
          <Figure label="Win rate" value={pct(t.win_rate)} note={`${num(t.won)} won · ${num(t.lost)} lost · ${num(t.withdrawn)} withdrawn · ${num(t.open)} still open`} />
          <Figure label="Lost to disputes" value={usd(t.usd_lost)} note="amount + $25 fee per lost dispute" />
          <Figure label="Disputes answered" value={pct(t.responded_rate)} note="unanswered ones win under 3%" />
        </div>
      </section>

      <section className="panel" aria-labelledby="by-reason">
        <div className="panel-head"><h2 id="by-reason">Dollars lost by dispute reason</h2><p>Hover or tab onto a bar for its win rate and volume.</p></div>
        <HBarChart label="Dollars lost by dispute reason" rows={rows.map((r) => ({
          key: r.reason, label: r.label, value: r.usd_lost, display: usd(r.usd_lost),
          tip: [`${num(r.disputes)} disputes, ${num(r.lost)} lost`, `Win rate ${pct(r.win_rate)}`, `Average amount ${usd(r.avg_amount)}`],
        }))} />
      </section>

      <section className="panel flush" aria-labelledby="reason-table">
        <div className="panel-head" style={{ padding: "16px 16px 0" }}><h3 id="reason-table">By reason, in full</h3><p>Win rate = won ÷ (won + lost); withdrawn and open disputes are left out.</p></div>
        <div className="table-wrap">
          <table className="wide">
            <thead><tr><th>Reason</th><th className="r">Disputes</th><th className="r">Won</th><th className="r">Lost</th><th className="r">Win rate</th><th className="r">Answered</th><th className="r">Average amount</th><th className="r">Dollars lost</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reason}>
                  <td>{r.label}</td><td className="r">{num(r.disputes)}</td><td className="r">{num(r.won)}</td><td className="r">{num(r.lost)}</td>
                  <td className="r">{pct(r.win_rate)}</td><td className="r">{pct(r.responded_rate)}</td><td className="r">{usd(r.avg_amount)}</td><td className="r"><b>{usd(r.usd_lost)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flush" aria-labelledby="uploaded-reasons">
        <div className="panel-head" style={{ padding: "16px 16px 0" }}><h3 id="uploaded-reasons">Uploaded disputes by reason</h3></div>
        {!up ? <div className="state"><p>Score a period's disputes on the Score files page to compare them with the history above.</p></div> : (
          <div className="table-wrap">
            <table className="wide">
              <thead><tr><th>Reason</th><th className="r">Disputes</th><th className="r">Average win chance</th><th className="r">Worth fighting</th><th className="r">Amount disputed</th></tr></thead>
              <tbody>
                {up.by_reason.map((r) => (
                  <tr key={r.reason}><td>{r.label}</td><td className="r">{r.disputes}</td><td className="r">{pct(r.avg_win_prob)}</td><td className="r">{r.fight}</td><td className="r">{usd(r.amount_usd)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
