import React, { useEffect, useState } from "react";
import { get, num, pct, usd } from "../api.js";
import { Actions, Prob, Rec, Stat, Tier } from "../components.jsx";

export default function Team({ meta, team, setTeam }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!team && meta?.teams.length) setTeam(meta.teams[0]);
  }, [meta]);

  useEffect(() => {
    if (!team) return;
    setError("");
    get(`teams/${encodeURIComponent(team)}`).then(setData).catch((e) => { setData(null); setError(e.message); });
  }, [team]);

  const h = data?.history;
  const u = data?.uploaded;
  const platform = meta?.totals;

  return (
    <div className="stack">
      <div className="card">
        <h2>By team</h2>
        <div className="filters">
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      {h && (
        <>
          <section className="card">
            <h3>{h.team_id} · {h.profession} · {h.state} · {h.team_size} people</h3>
            <p className="muted small">Months 1–22 history. On ScanPay since {h.onboarded_on}.</p>
            <div className="stats">
              <Stat label="Payments" value={num(h.payments)} hint={usd(h.volume_usd)} />
              <Stat label="Disputes" value={num(h.disputes)} hint={`${pct(h.dispute_rate, 2)} of payments · platform ${pct(platform?.dispute_rate, 2)}`} />
              <Stat label="Win rate" value={pct(h.win_rate)} hint={`${h.won} won · ${h.lost} lost · platform ${pct(platform?.win_rate)}`} />
              <Stat label="Lost to disputes" value={usd(h.usd_lost)} hint="amount + $25 fee per lost dispute" />
              <Stat label="Responded" value={pct(h.responded_rate)} hint="unanswered disputes are almost always lost" />
              <Stat label="Keyed-in cards" value={pct(h.keyed_share)} hint={`platform ${pct(platform?.platform_keyed_share)}`} />
            </div>
          </section>

          <section className="card">
            <h3>Main gaps</h3>
            {h.gaps.length === 0 ? <p className="muted">No significant paperwork gaps compared with the platform.</p> : (
              <table>
                <thead><tr><th>Evidence</th><th className="num">Missing on</th><th className="num">Platform</th><th className="num">Win-chance gain</th><th>What to do</th></tr></thead>
                <tbody>
                  {h.gaps.map((g) => (
                    <tr key={g.item}>
                      <td>{g.label}</td>
                      <td className="num">{pct(g.share_missing)}</td>
                      <td className="num">{pct(g.platform_missing)}</td>
                      <td className="num">+{g.win_points_gain} pts</td>
                      <td>{g.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">Gain = average rise in the chance of winning a dispute across all the team's payments, estimated within teams (not by comparing careful teams with careless ones).</p>
          </section>

          <section className="card">
            <h3>Disputes by reason</h3>
            <table>
              <thead><tr><th>Reason</th><th className="num">Disputes</th><th className="num">Won</th><th className="num">Lost</th><th className="num">Win rate</th><th className="num">$ lost</th></tr></thead>
              <tbody>
                {h.by_reason.map((r) => (
                  <tr key={r.reason}><td>{r.label}</td><td className="num">{r.disputes}</td><td className="num">{r.won}</td><td className="num">{r.lost}</td><td className="num">{pct(r.win_rate)}</td><td className="num">{usd(r.usd_lost)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h3>Recent disputes</h3>
            <table>
              <thead><tr><th>Dispute</th><th>Opened</th><th>Reason</th><th className="num">Amount</th><th>Responded</th><th>Outcome</th><th>Evidence submitted</th></tr></thead>
              <tbody>
                {h.recent_disputes.map((d) => (
                  <tr key={d.dispute_id}>
                    <td className="mono">{d.dispute_id}</td><td>{d.opened_at}</td><td>{d.reason}</td><td className="num">{usd(d.amount_usd, 2)}</td>
                    <td>{d.responded ? "Yes" : <span className="warn">No</span>}</td>
                    <td><span className={`badge out-${d.outcome}`}>{d.outcome}</span></td>
                    <td className="small">{d.evidence.split(";").join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {u?.summary && (
        <section className="card">
          <h3>Uploaded payments for this team</h3>
          <div className="stats">
            <Stat label="Payments" value={num(u.summary.payments)} />
            <Stat label="High risk" value={num(u.summary.tiers.high)} />
            <Stat label="Expected loss" value={usd(u.summary.expected_loss_usd)} />
          </div>
          <table>
            <thead><tr><th>Payment</th><th className="num">Amount</th><th>Risk</th><th className="num">Payment win</th><th className="num">Expected loss</th><th>Top action</th></tr></thead>
            <tbody>
              {u.payments.slice(0, 25).map((r) => (
                <tr key={r.payment_id}>
                  <td className="mono">{r.payment_id}</td><td className="num">{usd(r.amount_usd, 2)}</td><td><Tier tier={r.dispute_risk_tier} /></td>
                  <td className="num"><Prob v={r.payment_win_prob} /></td><td className="num">{usd(r.expected_loss_usd, 2)}</td>
                  <td><Actions items={(r.payment_actions || []).concat(r.invoice_actions || []).slice(0, 1)} empty="—" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {u.disputes && u.disputes.length > 0 && (
            <>
              <h3>Uploaded disputes</h3>
              <table>
                <thead><tr><th>Dispute</th><th>Reason</th><th className="num">Amount</th><th className="num">Win chance</th><th>Advice</th></tr></thead>
                <tbody>
                  {u.disputes.map((d) => (
                    <tr key={d.dispute_id}><td className="mono">{d.dispute_id}</td><td>{d.reason_label}</td><td className="num">{usd(d.amount_usd, 2)}</td><td className="num">{pct(d.win_prob)}</td><td><Rec rec={d.recommendation} /></td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </div>
  );
}
