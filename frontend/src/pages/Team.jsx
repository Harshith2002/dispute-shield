import React, { useEffect, useState } from "react";
import { get, num, pct, usd } from "../api.js";
import { ActionList, ErrorBox, Figure, Loading, Meter, Outcome, Rec, Tier } from "../components.jsx";

function Gaps({ gaps }) {
  if (!gaps.length) return <p className="muted">This team's paperwork is at or above the platform on every evidence type that moves the win chance.</p>;
  return (
    <>
      {gaps.map((g) => (
        <div className="gap-row" key={g.item}>
          <div><b>{g.label}</b><span className="cell-sub">missing on {pct(g.share_missing)} of payments</span></div>
          <div className="gap-bar" role="img" aria-label={`${g.label}: missing on ${pct(g.share_missing)} of this team's payments, platform ${pct(g.platform_missing)}`}>
            <div className="team" style={{ width: `${g.share_missing * 100}%` }} />
            <div className="plat" style={{ left: `${g.platform_missing * 100}%` }} title={`Platform ${pct(g.platform_missing)}`} />
          </div>
          <span className="gain">+{g.win_points_gain} pts</span>
          <p className="gap-fix">{g.fix}</p>
        </div>
      ))}
      <div className="legend" style={{ marginTop: 12 }}>
        <span><span className="swatch" style={{ background: "var(--tier-medium)" }} />Share of this team's payments missing it</span>
        <span><span className="swatch" style={{ background: "var(--ink)", width: 2 }} />Platform</span>
        <span>Points: rise in the team's win chance on disputes, estimated within teams</span>
      </div>
    </>
  );
}

export default function Team({ meta, team, setTeam }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!team && meta?.teams.length) setTeam(meta.teams[0]); }, [meta]);
  const load = () => {
    if (!team) return;
    setLoading(true); setError("");
    get(`teams/${encodeURIComponent(team)}`).then(setData).catch((e) => { setData(null); setError(e.message); }).finally(() => setLoading(false));
  };
  useEffect(load, [team]);

  const h = data?.history, u = data?.uploaded, plat = meta?.totals;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Teams</h1>
          <p>One team's record over months 1–22, the paperwork gaps that cost it disputes, and its uploaded payments.</p>
        </div>
        <div className="toolbar" style={{ padding: 0, border: 0 }}>
          <label>Team
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && !h && <div className="panel"><Loading what="team" /></div>}

      {h && (
        <>
          <section className="panel" aria-labelledby="team-name">
            <div className="team-hero">
              <div>
                <h2 id="team-name">{h.team_id}</h2>
                <p className="muted">{h.profession} · {h.state} · {h.team_size} people · on ScanPay since {h.onboarded_on}</p>
              </div>
              <p className="small muted">{num(h.payments)} payments · {usd(h.volume_usd)} collected</p>
            </div>
            <div className="figures" style={{ marginTop: 18 }}>
              <Figure label="Dispute rate" value={pct(h.dispute_rate, 2)} note={`platform ${pct(plat?.dispute_rate, 2)} · ${h.disputes} disputes`} />
              <Figure label="Win rate" value={h.win_rate == null ? "No decided disputes" : pct(h.win_rate)} note={`${h.won} won, ${h.lost} lost · platform ${pct(plat?.win_rate)}`} />
              <Figure label="Lost to disputes" value={usd(h.usd_lost)} note="amount + $25 fee per lost dispute" />
              <Figure label="Responded to" value={h.disputes ? pct(h.responded_rate) : "No disputes"} note="unanswered disputes are almost always lost" />
              <Figure label="Keyed-in cards" value={pct(h.keyed_share)} note={`platform ${pct(plat?.platform_keyed_share)}`} />
            </div>
          </section>

          <section className="panel" aria-labelledby="gaps">
            <div className="panel-head"><h2 id="gaps">Biggest fixes</h2><p>Evidence this team leaves off, ranked by how much adding it would raise its win chance.</p></div>
            <Gaps gaps={h.gaps} />
          </section>

          <div className="grid-2">
            <section className="panel flush" aria-labelledby="recent">
              <div className="panel-head" style={{ padding: "16px 16px 0" }}><h3 id="recent">Recent disputes</h3></div>
              {h.recent_disputes.length === 0 ? <div className="state"><p>No disputes in months 1–22.</p></div> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Dispute</th><th>Reason</th><th className="r">Amount</th><th>Responded</th><th>Outcome</th></tr></thead>
                    <tbody>
                      {h.recent_disputes.map((d) => (
                        <tr key={d.dispute_id}>
                          <td><span className="mono">{d.dispute_id}</span><span className="cell-sub">{d.opened_at}</span></td>
                          <td>{d.reason}</td><td className="r">{usd(d.amount_usd, 2)}</td>
                          <td>{d.responded ? "Yes" : <span className="warn-text">No</span>}</td>
                          <td><Outcome outcome={d.outcome} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel flush" aria-labelledby="reasons">
              <div className="panel-head" style={{ padding: "16px 16px 0" }}><h3 id="reasons">By reason</h3></div>
              {h.by_reason.length === 0 ? <div className="state"><p>No disputes in months 1–22.</p></div> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Reason</th><th className="r">Disputes</th><th className="r">Win rate</th><th className="r">Lost</th></tr></thead>
                    <tbody>
                      {h.by_reason.map((r) => (
                        <tr key={r.reason}><td>{r.label}</td><td className="r">{r.disputes}</td><td className="r">{r.win_rate == null ? "–" : pct(r.win_rate)}</td><td className="r">{usd(r.usd_lost)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {data && (
        <section className="panel flush" aria-labelledby="uploaded">
          <div className="panel-head" style={{ padding: "16px 16px 0" }}>
            <h2 id="uploaded">Uploaded payments for this team</h2>
            {u?.summary && <p className="num">{num(u.summary.payments)} payments · {num(u.summary.tiers.high)} high risk · {usd(u.summary.expected_loss_usd)} expected loss</p>}
          </div>
          {!u ? <div className="state"><p>No files scored in this browser tab yet. Scored payments for {team} appear here, costliest exposure first.</p></div>
            : !u.summary ? <div className="state"><p>The uploaded files have no payments for {team}.</p></div> : (
            <div className="table-wrap">
              <table className="wide">
                <thead><tr><th>Payment</th><th className="r">Amount</th><th>Dispute risk</th><th>Win if disputed</th><th className="r">Expected loss</th><th>Most useful action</th></tr></thead>
                <tbody>
                  {u.payments.slice(0, 25).map((r) => (
                    <tr key={r.payment_id}>
                      <td><span className="mono">{r.payment_id}</span><span className="cell-sub">{r.collected_at?.slice(0, 10)}</span></td>
                      <td className="r">{usd(r.amount_usd, 2)}</td>
                      <td><Tier tier={r.dispute_risk_tier} /></td>
                      <td>{r.payment_win_prob == null ? "Blank" : <Meter value={r.payment_win_prob} />}</td>
                      <td className="r">{usd(r.expected_loss_usd, 2)}</td>
                      <td style={{ minWidth: 260 }}><ActionList items={(r.payment_actions || []).concat(r.invoice_actions || []).slice(0, 1)} empty="Nothing to add" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {u?.disputes?.length > 0 && (
            <div className="table-wrap" style={{ borderTop: "1px solid var(--line)" }}>
              <table>
                <thead><tr><th>Uploaded dispute</th><th>Reason</th><th className="r">Amount</th><th>Win chance</th><th>Advice</th></tr></thead>
                <tbody>
                  {u.disputes.map((d) => (
                    <tr key={d.dispute_id}><td className="mono">{d.dispute_id}</td><td>{d.reason_label}</td><td className="r">{usd(d.amount_usd, 2)}</td><td><Meter value={d.win_prob} /></td><td><Rec rec={d.recommendation} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
