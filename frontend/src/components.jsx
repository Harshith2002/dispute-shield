import React, { useEffect, useRef, useState } from "react";
import { pct } from "./api.js";

const TIER_LABEL = { high: "High risk", medium: "Medium risk", low: "Low risk" };
const REC_LABEL = { fight: "Fight", accept: "Accept" };

export const Tier = ({ tier }) => <span className={`badge tier-${tier}`}>{TIER_LABEL[tier] || tier}</span>;
export const Rec = ({ rec }) => <span className={`badge rec-${rec}`}>{REC_LABEL[rec] || rec}</span>;
export const Outcome = ({ outcome }) => <span className={`badge out-${outcome}`}>{outcome}</span>;

/* Identity motif: one slot per evidence type, filled when it is on file. For disputes a slot can be
   "held": on file but not submitted. */
export function EvidenceStrip({ evidence, present = [], submitted }) {
  if (!evidence) return null;
  const onFile = new Set(present);
  const sent = submitted ? new Set(submitted) : null;
  const state = (e) => (sent ? (sent.has(e.item) ? "on" : onFile.has(e.label) ? "held" : "") : onFile.has(e.label) ? "on" : "");
  const n = evidence.filter((e) => state(e) === "on").length;
  const held = evidence.filter((e) => state(e) === "held").length;
  const text = sent
    ? `${n} of ${evidence.length} evidence types submitted${held ? `, ${held} more on file but not submitted` : ""}`
    : `${n} of ${evidence.length} evidence types on file`;
  return (
    <span className="strip" role="img" aria-label={text} title={text}>
      {evidence.map((e) => <i key={e.item} className={state(e)} />)}
    </span>
  );
}

export function EvidenceList({ evidence, present = [], submitted }) {
  const onFile = new Set(present);
  const sent = submitted ? new Set(submitted) : null;
  return (
    <ul className="evidence-list">
      {evidence.map((e) => {
        const s = sent ? (sent.has(e.item) ? "on" : onFile.has(e.label) ? "held" : "off") : onFile.has(e.label) ? "on" : "off";
        const word = s === "on" ? (sent ? "submitted" : "on file") : s === "held" ? "on file, not submitted" : "missing";
        return (
          <li key={e.item} className={s}>
            <i aria-hidden="true" />
            <span>{e.label}<span className="sr-only">: {word}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

export function StripLegend({ dispute }) {
  return (
    <div className="legend" aria-hidden="true">
      <span><span className="strip"><i className="on" /></span>{dispute ? "Submitted" : "On file"}</span>
      {dispute && <span><span className="strip"><i className="held" /></span>On file, not submitted</span>}
      <span><span className="strip"><i /></span>Missing</span>
    </div>
  );
}

export function Meter({ value }) {
  return (
    <span className="meter">
      <span className="meter-track" aria-hidden="true"><span className="meter-fill" style={{ display: "block", width: `${Math.round((value || 0) * 100)}%` }} /></span>
      <span className="num">{pct(value)}</span>
    </span>
  );
}

export function Figure({ label, value, note, hero }) {
  return (
    <div>
      <div className="figure-label">{label}</div>
      <div className={hero ? "figure hero" : "figure"}>{value}</div>
      {note && <div className="figure-note">{note}</div>}
    </div>
  );
}

export function TierBar({ tiers }) {
  const total = tiers.high + tiers.medium + tiers.low || 1;
  const parts = [["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  return (
    <div>
      <div className="tierbar" role="img" aria-label={parts.map(([k, l]) => `${l} risk ${tiers[k]}`).join(", ")}>
        {parts.map(([k]) => <div key={k} style={{ flex: tiers[k] / total, background: `var(--tier-${k})` }} />)}
      </div>
      <div className="tierbar-legend">
        {parts.map(([k, l]) => (
          <span key={k}><span className="swatch" style={{ background: `var(--tier-${k})` }} />{l} risk <b className="num">{tiers[k].toLocaleString()}</b><span className="muted">({pct(tiers[k] / total, 1)})</span></span>
        ))}
      </div>
    </div>
  );
}

/* Horizontal bars, one series. Value labels at the bar end; tooltip on hover or keyboard focus. */
export function HBarChart({ rows, label }) {
  const [tip, setTip] = useState(null);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="hbar" role="list" aria-label={label}>
      {rows.map((r) => {
        const w = (r.value / max) * 100;
        return (
          <div className="hbar-row" role="listitem" key={r.key}>
            <span className="hbar-label">{r.label}</span>
            <div className="hbar-track" tabIndex={0} aria-label={`${r.label}: ${r.display}. ${r.tip.join(". ")}`}
                 onMouseEnter={() => setTip(r.key)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(r.key)} onBlur={() => setTip(null)}>
              <div className="hbar-fill" style={{ width: `${w}%` }} />
              <span className="hbar-value" style={w > 70 ? { right: `${100 - w}%`, marginRight: 8, color: "var(--on-brand)" } : { left: `calc(${w}% + 8px)` }}>{r.display}</span>
              {tip === r.key && <div className="chart-tip" role="tooltip">{r.tip.map((t) => <div key={t}>{t}</div>)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Pager({ data, page, setPage }) {
  if (!data || data.total === 0) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  const from = (page - 1) * data.size + 1;
  const to = Math.min(page * data.size, data.total);
  return (
    <div className="pager">
      <span className="num">{from.toLocaleString()}–{to.toLocaleString()} of {data.total.toLocaleString()}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </span>
    </div>
  );
}

export function Loading({ what }) {
  return (
    <div className="state" role="status">
      <div className="loading-line" aria-hidden="true" />
      <p>Loading {what}…</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="panel">
      <div className="state">
        <h3>{title}</h3>
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

/* Side panel dialog: Escape and the backdrop close it, focus moves in on open and back on close. */
export function Drawer({ title, subtitle, onClose, children }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus?.();
    };
  }, []);
  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <div className="muted small" style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}

export function ActionList({ items, empty }) {
  if (!items || items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="actions-list">
      {items.map((a, i) => (
        <li key={i} className={a.lift == null ? "flag" : ""}>
          <span>{a.text}</span>
          {a.lift != null && <span className="gain">+{(a.lift * 100).toFixed(1)} pts</span>}
        </li>
      ))}
    </ul>
  );
}
