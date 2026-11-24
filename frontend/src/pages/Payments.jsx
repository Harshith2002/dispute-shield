import React, { Fragment, useEffect, useState } from "react";
import { get, usd } from "../api.js";
import { Actions, Empty, Pager, Prob, Tier } from "../components.jsx";

export default function Payments({ session, meta, openTeam, goUpload }) {
  const [filters, setFilters] = useState({ team: "", tier: "", q: "", sort: "expected_loss_usd" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session.payments) return;
    get("payments", { ...filters, page_no: page, size: 50 }).then(setData).catch((e) => setError(e.message));
  }, [filters, page, session.payments]);

  if (!session.payments)
    return <Empty action={<button className="primary" onClick={goUpload}>Go to upload</button>}>Upload invoices, photos and payments to see per-payment predictions.</Empty>;

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="stack">
      <div className="card">
        <h2>Payments</h2>
        <p className="muted">
          <b>Invoice win</b>: chance of winning a dispute judged from the invoice before payment. <b>Payment win</b>: the same once the payment is collected.
          <b> Risk</b>: chance this payment is disputed. <b>Expected loss</b> = risk × what the team would lose if disputed.
        </p>
        <div className="filters">
          <select value={filters.team} onChange={setF("team")} aria-label="Team">
            <option value="">All teams</option>
            {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
          </select>
          <select value={filters.tier} onChange={setF("tier")} aria-label="Risk tier">
            <option value="">All tiers</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
          <select value={filters.sort} onChange={setF("sort")} aria-label="Sort">
            <option value="expected_loss_usd">Sort: expected loss</option>
            <option value="dispute_risk_score">Sort: dispute risk</option>
            <option value="amount_usd">Sort: amount</option>
            <option value="payment_win_prob">Sort: weakest paperwork</option>
          </select>
          <input placeholder="Search payment or invoice ID" value={filters.q} onChange={setF("q")} aria-label="Search" />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Payment</th><th>Team</th><th className="num">Amount</th><th>Method</th><th>Risk</th>
              <th className="num">Risk %</th><th className="num">Invoice win</th><th className="num">Payment win</th><th className="num">Expected loss</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <Fragment key={r.payment_id}>
                <tr className="clickable" onClick={() => setOpen(open === r.payment_id ? null : r.payment_id)}
                    aria-expanded={open === r.payment_id}>
                  <td className="mono">{r.payment_id}</td>
                  <td><button className="link" onClick={(e) => { e.stopPropagation(); openTeam(r.team_id); }}>{r.team_id}</button></td>
                  <td className="num">{usd(r.amount_usd, 2)}</td>
                  <td>{r.payment_method}</td>
                  <td><Tier tier={r.dispute_risk_tier} /></td>
                  <td className="num">{(r.dispute_risk_score * 100).toFixed(2)}%</td>
                  <td className="num"><Prob v={r.invoice_win_prob} /></td>
                  <td className="num"><Prob v={r.payment_win_prob} /></td>
                  <td className="num">{usd(r.expected_loss_usd, 2)}</td>
                </tr>
                {open === r.payment_id && (
                  <tr className="detail">
                    <td colSpan={9}>
                      <div className="detail-grid">
                        <div>
                          <h4>Evidence on file</h4>
                          <p>{r.evidence_present.length ? r.evidence_present.join(" · ") : "None"}</p>
                          <p className="muted small">
                            Card: {r.payment_method}{r.card_country ? ` · ${r.card_country}` : ""}{r.avs_result ? ` · AVS ${r.avs_result}` : ""}{r.cvv_result ? ` · CVV ${r.cvv_result}` : ""}
                          </p>
                        </div>
                        <div>
                          <h4>Before payment: strengthen the invoice</h4>
                          <Actions items={r.invoice_actions} empty="Invoice already has the evidence that matters." />
                        </div>
                        <div>
                          <h4>Now that it's paid: protect it</h4>
                          <Actions items={r.payment_actions} empty="Nothing urgent." />
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
