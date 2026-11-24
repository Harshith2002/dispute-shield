import React, { Fragment, useEffect, useState } from "react";
import { get, pct, usd } from "../api.js";
import { Actions, Empty, Pager, Rec } from "../components.jsx";

export default function Disputes({ session, meta, openTeam, goUpload }) {
  const [filters, setFilters] = useState({ team: "", reason: "", rec: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session.disputes) return;
    get("disputes", { ...filters, page_no: page, size: 50 }).then(setData).catch((e) => setError(e.message));
  }, [filters, page, session.disputes]);

  if (!session.disputes)
    return <Empty action={<button className="primary" onClick={goUpload}>Go to upload</button>}>Upload disputes (step 2) to see win chances and fight/accept advice.</Empty>;

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="stack">
      <div className="card">
        <h2>Disputes</h2>
        <p className="muted">
          <b>Fight</b> when win chance × (amount + $25 fee) is more than the $15 it costs to fight. The value column is that difference.
        </p>
        <div className="filters">
          <select value={filters.team} onChange={setF("team")} aria-label="Team">
            <option value="">All teams</option>
            {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
          </select>
          <select value={filters.reason} onChange={setF("reason")} aria-label="Reason">
            <option value="">All reasons</option>
            {meta?.reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select value={filters.rec} onChange={setF("rec")} aria-label="Recommendation">
            <option value="">Fight and accept</option>
            <option value="fight">Fight</option>
            <option value="accept">Accept</option>
          </select>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Dispute</th><th>Team</th><th>Reason</th><th className="num">Amount</th><th>Responded</th>
              <th className="num">Win chance</th><th>Advice</th><th className="num">Value of fighting</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <Fragment key={r.dispute_id}>
                <tr className="clickable" onClick={() => setOpen(open === r.dispute_id ? null : r.dispute_id)}
                    aria-expanded={open === r.dispute_id}>
                  <td className="mono">{r.dispute_id}</td>
                  <td><button className="link" onClick={(e) => { e.stopPropagation(); openTeam(r.team_id); }}>{r.team_id}</button></td>
                  <td>{r.reason_label}</td>
                  <td className="num">{usd(r.amount_usd, 2)}</td>
                  <td>{r.merchant_responded ? "Yes" : <span className="warn">No</span>}</td>
                  <td className="num">{pct(r.win_prob)}</td>
                  <td><Rec rec={r.recommendation} /></td>
                  <td className="num">{usd(r.fight_value_usd, 2)}</td>
                </tr>
                {open === r.dispute_id && (
                  <tr className="detail">
                    <td colSpan={8}>
                      <div className="detail-grid">
                        <div>
                          <h4>Submitted</h4>
                          <p>{(r.evidence_submitted || "none").split(";").join(" · ")}</p>
                          {!r.matched_payment && <p className="warn small">Payment not found in the uploaded payments: scored from the dispute alone.</p>}
                        </div>
                        <div>
                          <h4>What to submit to improve the odds</h4>
                          <Actions items={r.evidence_actions} empty="Everything on file is already submitted." />
                        </div>
                        <div>
                          <h4>How to argue this reason</h4>
                          <p>{r.reason_guidance}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} setPage={setPage} />
      </div>
    </div>
  );
}
