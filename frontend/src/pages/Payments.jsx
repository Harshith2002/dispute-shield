import React, { useEffect, useState } from "react";
import { exportUrl, get, num, pct, usd } from "../api.js";
import { ActionList, Drawer, EmptyState, ErrorBox, EvidenceList, EvidenceStrip, Figure, Loading, Meter, Pager, StripLegend, Tier, TierBar } from "../components.jsx";

function PaymentDrawer({ r, meta, onClose, openTeam }) {
  const platform = meta?.totals?.dispute_rate;
  return (
    <Drawer title={`Payment ${r.payment_id}`} subtitle={`${usd(r.amount_usd, 2)} · ${r.payment_method} · collected ${r.collected_at}`} onClose={onClose}>
      <section className="kv">
        <Figure label="Chance of a dispute" value={pct(r.dispute_risk_score, 2)} note={<><Tier tier={r.dispute_risk_tier} />{platform ? ` platform average ${pct(platform, 2)}` : ""}</>} />
        <Figure label="Expected loss" value={usd(r.expected_loss_usd, 2)} note="risk × what the team would lose if disputed" />
        <Figure label="Win chance, invoice only" value={r.invoice_win_prob == null ? "Blank" : pct(r.invoice_win_prob)} note="judged before payment" />
        <Figure label="Win chance, with payment" value={r.payment_win_prob == null ? "Blank" : pct(r.payment_win_prob)} note="once the card details are known" />
      </section>
      <section>
        <h4>Evidence on file</h4>
        <EvidenceList evidence={meta.evidence} present={r.evidence_present} />
      </section>
      <section>
        <h4>Before payment: strengthen the invoice</h4>
        <ActionList items={r.invoice_actions} empty="The invoice already has the evidence that moves the win chance." />
      </section>
      <section>
        <h4>Now that it is paid: protect it</h4>
        <ActionList items={r.payment_actions} empty="Nothing urgent for this payment." />
        <p className="muted small" style={{ marginTop: 8 }}>Points = rise in the chance of winning if this payment is disputed, estimated within teams.</p>
      </section>
      <section>
        <h4>Card</h4>
        <p className="small">{r.payment_method}{r.card_country ? ` · issued in ${r.card_country}` : ""}{r.avs_result ? ` · AVS ${r.avs_result.replace("_", " ")}` : ""}{r.cvv_result ? ` · CVV ${r.cvv_result.replace("_", " ")}` : ""}</p>
      </section>
      <button className="btn btn-secondary" onClick={() => { onClose(); openTeam(r.team_id); }}>Open team {r.team_id}</button>
    </Drawer>
  );
}

export default function Payments({ session, meta, openTeam, goUpload, tier, setTier }) {
  const [filters, setFilters] = useState({ team: "", q: "", sort: "expected_loss_usd" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    get("payments", { ...filters, tier, page_no: page, size: 50 })
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (session.payments) load(); }, [filters, tier, page, session.payments]);

  if (!session.payments)
    return <EmptyState title="No payments scored yet" action={<button className="btn btn-primary" onClick={goUpload}>Score files</button>}>
      Upload a period's invoices, photos and payments to see each payment's dispute risk, win chance and the evidence worth adding.
    </EmptyState>;

  const s = session.payments;
  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="num">{num(s.payments)} payments from {s.teams} teams, {s.period[0]?.slice(0, 10)} to {s.period[1]?.slice(0, 10)}, scored with the months 1–22 models.</p>
        </div>
        <a className="btn btn-secondary" href={exportUrl("payment_predictions")} download>Download payment_predictions.csv</a>
      </div>

      <section className="panel" aria-label="Summary">
        <div className="grid-2">
          <Figure hero label="Expected dispute losses on these payments" value={usd(s.expected_loss_usd)}
                  note={`${num(s.expected_disputes)} disputes expected (${pct(s.expected_disputes / s.payments, 2)} of payments, ${usd(s.volume_usd)} collected)`} />
          <div>
            <div className="figure-label">Payments by dispute risk</div>
            <TierBar tiers={s.tiers} />
            <p className="small" style={{ marginTop: 10 }}>The {num(s.tiers.high)} high-risk payments are where checking the card and adding paperwork pays off most.{" "}
              {tier !== "high" && <button className="link-btn" onClick={() => { setPage(1); setTier("high"); }}>Show only high risk</button>}
            </p>
          </div>
        </div>
        {s.blank_columns?.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>Left blank on purpose in the export: {s.blank_columns.join(", ")}.</p>}
      </section>

      {!session.disputes && (
        <div className="next-step" role="note">
          <span><b>Next:</b> upload this period's disputes for fight-or-accept advice on each one. They can come later; these payment scores are final.</span>
          <button className="btn btn-primary" onClick={goUpload}>Upload disputes</button>
        </div>
      )}

      <section className="panel flush" aria-label="Payments table">
        <div className="panel-head" style={{ padding: "16px 16px 0", marginBottom: 0 }}>
          <h2>Every payment</h2>
          <StripLegend />
        </div>
        <div className="toolbar">
          <label>Team
            <select value={filters.team} onChange={setF("team")}>
              <option value="">All teams</option>
              {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
            </select>
          </label>
          <label>Risk tier
            <select value={tier} onChange={(e) => { setPage(1); setTier(e.target.value); }}>
              <option value="">All tiers</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
            </select>
          </label>
          <label>Sort by
            <select value={filters.sort} onChange={setF("sort")}>
              <option value="expected_loss_usd">Expected loss</option>
              <option value="dispute_risk_score">Dispute risk</option>
              <option value="amount_usd">Amount</option>
              <option value="payment_win_prob">Weakest paperwork first</option>
            </select>
          </label>
          <label>Find
            <input type="search" placeholder="Payment or invoice ID" value={filters.q} onChange={setF("q")} />
          </label>
        </div>
        {error && <div style={{ padding: 14 }}><ErrorBox message={error} onRetry={load} /></div>}
        {!data && loading && <Loading what="payments" />}
        {data && data.total === 0 && <div className="state"><h3>No payments match</h3><p>Clear the search or pick another team or tier.</p></div>}
        {data && data.total > 0 && (
          <div className="table-wrap" aria-busy={loading}>
            <table className="wide">
              <thead>
                <tr>
                  <th>Payment</th><th>Team</th><th className="r">Amount</th><th>Method</th><th>Evidence</th>
                  <th>Dispute risk</th><th>Win if disputed</th><th className="r">Expected loss</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.payment_id} className={open?.payment_id === r.payment_id ? "row selected" : "row"} onClick={() => setOpen(r)}>
                    <td><button className="id-btn" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.payment_id}</button><span className="cell-sub">{r.collected_at?.slice(0, 10)}</span></td>
                    <td><button className="link-btn" onClick={(e) => { e.stopPropagation(); openTeam(r.team_id); }}>{r.team_id}</button></td>
                    <td className="r">{usd(r.amount_usd, 2)}</td>
                    <td>{r.payment_method}{(r.avs_result === "no_match" || r.cvv_result === "no_match") && <span className="cell-sub warn-text">card check failed</span>}</td>
                    <td><EvidenceStrip evidence={meta?.evidence} present={r.evidence_present} /></td>
                    <td><Tier tier={r.dispute_risk_tier} /><span className="cell-sub num">{pct(r.dispute_risk_score, 2)}</span></td>
                    <td>{r.payment_win_prob == null ? <span className="muted">Blank</span> : <Meter value={r.payment_win_prob} />}</td>
                    <td className="r"><b>{usd(r.expected_loss_usd, 2)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager data={data} page={page} setPage={setPage} />
      </section>
      {open && meta && <PaymentDrawer r={open} meta={meta} onClose={() => setOpen(null)} openTeam={openTeam} />}
    </div>
  );
}
