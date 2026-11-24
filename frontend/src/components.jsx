import React from "react";
import { pct } from "./api.js";

export const Tier = ({ tier }) => <span className={`badge tier-${tier}`}>{tier}</span>;

export const Rec = ({ rec }) => <span className={`badge rec-${rec}`}>{rec}</span>;

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Actions({ items, empty = "Nothing to add." }) {
  if (!items || items.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="actions">
      {items.map((a, i) => (
        <li key={i}>
          <span>{a.text}</span>
          {a.lift != null && <span className="lift">+{(a.lift * 100).toFixed(1)} pts win chance</span>}
        </li>
      ))}
    </ul>
  );
}

export function Pager({ data, page, setPage }) {
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
      <span className="muted">Page {page} of {pages} · {data.total.toLocaleString()} rows</span>
      <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
    </div>
  );
}

export function Bar({ value, max, tone = "accent" }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" aria-hidden="true">
      <div className={`bar-fill ${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export const Prob = ({ v }) => (v == null ? <span className="muted">blank</span> : pct(v));

export function Empty({ children, action }) {
  return (
    <div className="card empty">
      <p>{children}</p>
      {action}
    </div>
  );
}
