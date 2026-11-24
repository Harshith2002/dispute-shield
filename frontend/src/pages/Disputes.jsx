import React, { useEffect, useState } from "react";
import { exportUrl, get, num, pct, usd } from "../api.js";
import { ActionList, Drawer, EmptyState, ErrorBox, EvidenceList, EvidenceStrip, Figure, Loading, Meter, Pager, Rec, StripLegend } from "../components.jsx";

const items = (s) => (s || "").split(";").filter((x) => x && x !== "none");

function DisputeDrawer({ r, meta, onClose, openTeam }) {
  const recover = r.amount_usd + 25;
  return (
    <Drawer title={`Dispute ${r.dispute_id}`} subtitle={`${r.reason_label} · ${usd(r.amount_usd, 2)} · opened ${r.opened_at}`} onClose={onClose}>
      <section className="kv">
        <Figure label="Chance of winning" value={pct(r.win_prob)} note="with the evidence submitted" />
        <Figure label="Advice" value={<Rec rec={r.recommendation} />} note={`expected value of fighting ${usd(r.fight_value_usd, 2)}`} />
      </section>
      <section>
        <h4>Why {r.recommendation}</h4>
        <p className="math">
          Winning recovers the amount plus the $25 fee: <b className="num">{usd(recover, 2)}</b>. At a {pct(r.win_prob)} chance that is worth <b className="num">{usd(r.win_prob * recover, 2)}</b>, against the $15 it costs to fight.
          {r.recommendation === "fight" ? " Fighting comes out ahead." : " Accepting costs less."}
        </p>
        {!r.merchant_responded && <p className="warn-text small" style={{ marginTop: 8 }}>The team has not responded to this dispute. Unanswered disputes are almost always lost.</p>}
      </section>
      <section>
        <h4>Evidence</h4>
        <EvidenceList evidence={meta.evidence} present={r.evidence_present} submitted={items(r.evidence_submitted)} />
        {!r.matched_payment && <p className="warn-text small" style={{ marginTop: 8 }}>The payment was not in the uploaded files, so only the dispute itself was scored.</p>}
      </section>
      <section>
        <h4>Raise the odds</h4>
        <ActionList items={r.evidence_actions} empty="Everything on file has already been submitted." />
      </section>
      <section>
        <h4>How to argue {r.reason_label.toLowerCase()}</h4>
        <p className="small">{r.reason_guidance}</p>
      </section>
      <button className="btn btn-secondary" onClick={() => { onClose(); openTeam(r.team_id); }}>Open team {r.team_id}</button>
    </Drawer>
  );
}

export default function Disputes({ session, meta, openTeam, goUpload }) {
  const [filters, setFilters] = useState({ team: "", reason: "", rec: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    get("disputes", { ...filters, page_no: page, size: 50 }).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (session.disputes) load(); }, [filters, page, session.disputes]);

  if (!session.disputes)
    return <EmptyState title="No disputes scored yet" action={<button className="btn btn-primary" onClick={goUpload}>Score files</button>}>
      After step 1, upload the period's disputes to see each one's win chance, whether to fight, and which evidence to submit.
    </EmptyState>;

  const s = session.disputes;
  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Disputes</h1>
          <p>{num(s.disputes)} disputes raised on the scored payments, scored with the evidence each team submitted.</p>
        </div>
        <a className="btn btn-secondary" href={exportUrl("dispute_predictions")} download>Download dispute_predictions.csv</a>
      </div>

      <section className="panel" aria-label="Summary">
        <div className="figures">
          <Figure hero label="Worth fighting" value={num(s.fight)} note={`expected ${usd(s.expected_recovery_usd)} recovered`} />
          <Figure hero label="Accept" value={num(s.accept)} note="fighting costs more than it is likely to recover" />
          <div style={{ alignSelf: "center", maxWidth: "46ch" }}>
            <p className="small">Fight when the chance of winning times (amount + $25 fee) is more than the $15 it costs. Open a dispute to see that calculation and the evidence still worth submitting.</p>
          </div>
        </div>
        {s.unmatched > 0 && <p className="warn-text small" style={{ marginTop: 10 }}>{s.unmatched} disputes had no matching payment and were scored from the dispute alone.</p>}
      </section>

      <section className="panel flush" aria-label="Disputes table">
        <div className="panel-head" style={{ padding: "16px 16px 0", marginBottom: 0 }}>
          <h2>Every dispute</h2>
          <StripLegend dispute />
        </div>
        <div className="toolbar">
          <label>Team
            <select value={filters.team} onChange={setF("team")}>
              <option value="">All teams</option>
              {meta?.teams.map((t) => <option key={t} value={t}>{meta.team_labels[t]}</option>)}
            </select>
          </label>
          <label>Reason
            <select value={filters.reason} onChange={setF("reason")}>
              <option value="">All reasons</option>
              {meta?.reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label>Advice
            <select value={filters.rec} onChange={setF("rec")}>
              <option value="">Fight and accept</option>
              <option value="fight">Fight</option>
              <option value="accept">Accept</option>
            </select>
          </label>
        </div>
        {error && <div style={{ padding: 14 }}><ErrorBox message={error} onRetry={load} /></div>}
        {!data && loading && <Loading what="disputes" />}
        {data && data.total === 0 && <div className="state"><h3>No disputes match</h3><p>Pick another team, reason or advice.</p></div>}
        {data && data.total > 0 && (
          <div className="table-wrap" aria-busy={loading}>
            <table className="wide">
              <thead>
                <tr>
                  <th>Dispute</th><th>Team</th><th>Reason</th><th className="r">Amount</th><th>Responded</th>
                  <th>Evidence</th><th>Win chance</th><th>Advice</th><th className="r">Value of fighting</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.dispute_id} className={open?.dispute_id === r.dispute_id ? "row selected" : "row"} onClick={() => setOpen(r)}>
                    <td><button className="id-btn" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.dispute_id}</button><span className="cell-sub">{r.opened_at?.slice(0, 10)}</span></td>
                    <td><button className="link-btn" onClick={(e) => { e.stopPropagation(); openTeam(r.team_id); }}>{r.team_id}</button></td>
                    <td>{r.reason_label}</td>
                    <td className="r">{usd(r.amount_usd, 2)}</td>
                    <td>{r.merchant_responded ? "Yes" : <span className="warn-text">No</span>}</td>
                    <td><EvidenceStrip evidence={meta?.evidence} present={r.evidence_present} submitted={items(r.evidence_submitted)} /></td>
                    <td><Meter value={r.win_prob} /></td>
                    <td><Rec rec={r.recommendation} /></td>
                    <td className="r">{usd(r.fight_value_usd, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager data={data} page={page} setPage={setPage} />
      </section>
      {open && meta && <DisputeDrawer r={open} meta={meta} onClose={() => setOpen(null)} openTeam={openTeam} />}
    </div>
  );
}
