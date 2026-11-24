"""Counterfactual estimate of each policy over months 1-22.

Two logistic models on payment-level features:
  P(disputed)              fitted on mature payments,
  P(lost | disputed)       fitted on closed disputes (won / withdrawn = not lost).
Both add team averages of each flag (Mundlak controls), so a flag's coefficient is read as a
within-team effect rather than "teams that fill in addresses are better teams".
Per payment: expected disputes = d, expected losses = d * l. A policy changes features of affected
payments and removes the share of jobs it would lose; we sum the change, rescale so the baseline
matches what actually happened, and weight each payment by how much of its dispute window had elapsed
by end of August 2026. Range = 5th-95th percentile of a team-cluster bootstrap that refits both models
and draws the side-effect size from 50%-150% of the brief's assumption.
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import AVS, CARD_TYPES, CVV, DATA_END, DATA_START, DISPUTE_FEE, MATURITY_DAYS, METHODS
from features import derive
from policies import POLICIES

ROW_FEATURES = (["f_log_amount", "f_itemized", "f_log_desc", "f_address", "f_email", "f_phone", "f_estimate",
                 "f_terms", "f_gps", "f_signature", "f_sig_available", "f_photo_before", "f_photo_after",
                 "f_team_size_log", "f_foreign", "f_receipt", "f_tip", "f_paid_before_complete"]
                + [f"m_{m}" for m in METHODS] + [f"avs_{a}" for a in AVS] + [f"cvv_{c}" for c in CVV]
                + [f"ct_{c}" for c in CARD_TYPES])
TEAM_MEAN_OF = ["f_address", "f_estimate", "f_terms", "f_gps", "f_signature", "f_photo_any", "f_itemized",
                "f_receipt", "m_keyed"]


def _lr():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=3000))


def prepare(P: pd.DataFrame, disputes: pd.DataFrame) -> dict:
    """Population (payments in months 1-22) with labels, team-mean controls and maturity weights."""
    P = P[P.collected_at >= DATA_START].reset_index(drop=True).copy()
    tm = P.groupby("team_id")[TEAM_MEAN_OF].transform("mean").add_prefix("tm_")
    P = pd.concat([P, tm], axis=1)
    dis = disputes.drop_duplicates("payment_id").set_index("payment_id")
    P["disputed"] = P.payment_id.isin(dis.index).astype(float)
    P["outcome"] = P.payment_id.map(dis.outcome)
    P["dispute_amount"] = P.payment_id.map(dis.amount_usd).fillna(P.amount_usd)
    lag = (disputes.opened_at - disputes.merge(P[["payment_id", "collected_at"]], on="payment_id",
                                                how="left").collected_at.values).dt.days.dropna().sort_values()
    observed_days = (DATA_END - P.collected_at).dt.days.clip(lower=0)
    P["maturity"] = np.searchsorted(lag.values, observed_days.values, side="right") / len(lag)
    mature = (P.collected_at < DATA_END - pd.Timedelta(days=MATURITY_DAYS)).values
    closed = P.outcome.isin(["won", "lost", "withdrawn"]).values
    return {"P": P, "mature": mature, "closed": closed, "lost": (P.outcome == "lost").astype(float).values}


def _fit(S, idx_d, idx_l, features):
    P = S["P"]
    md = _lr().fit(P.loc[idx_d, features].values, P.disputed.values[idx_d])
    ml = _lr().fit(P.loc[idx_l, features].values, S["lost"][idx_l])
    return md, ml


def _effects(S, md, ml, features, side_scale=1.0) -> dict:
    P = S["P"]
    X0 = P[features].values
    d0, l0 = md.predict_proba(X0)[:, 1], ml.predict_proba(X0)[:, 1]
    w, usd = P.maturity.values, P.dispute_amount.values + DISPUTE_FEE
    # anchor the model baseline to what happened (open disputes count at their predicted loss chance)
    is_open = (P.disputed.values == 1) & ~S["closed"]
    actual_d = P.disputed.sum()
    actual_l = S["lost"].sum() + l0[is_open].sum()
    actual_u = (S["lost"] * usd).sum() + (l0 * usd)[is_open].sum()
    s_d, s_l, s_u = actual_d / (w * d0).sum(), actual_l / (w * d0 * l0).sum(), actual_u / (w * d0 * l0 * usd).sum()
    out = {"_baseline": {"disputes": float(actual_d), "disputes_lost": float(actual_l), "usd_lost": float(actual_u)}}
    for pol in POLICIES:
        mask = pol.affected(P).values
        F = P.copy()
        sub = F.loc[mask].copy()
        pol.apply(sub)
        F.loc[mask, sub.columns] = derive(sub)
        keep = 1 - np.clip(pol.jobs_lost(P).values * side_scale, 0, 1)
        X1 = F[features].values
        d1 = (md.predict_proba(X1)[:, 1] if pol.changes_dispute_rate else d0) * keep
        l1 = ml.predict_proba(X1)[:, 1]
        out[pol.name] = {
            "disputes": s_d * (w * (d1 - d0)).sum(),
            "disputes_lost": s_l * (w * (d1 * l1 - d0 * l0)).sum(),
            "usd_lost": s_u * (w * (d1 * l1 - d0 * l0) * usd).sum(),
            "_affected": int(mask.sum()),
            "_jobs_lost": float((1 - keep).sum()),
        }
    return out


def run(P: pd.DataFrame, disputes: pd.DataFrame, n_boot=30, seed=0, log=print) -> dict:
    S = prepare(P, disputes)
    features = ROW_FEATURES + [f"tm_{c}" for c in TEAM_MEAN_OF]
    all_idx = np.arange(len(S["P"]))
    md, ml = _fit(S, all_idx[S["mature"]], all_idx[S["closed"]], features)
    point = _effects(S, md, ml, features)
    naive = _effects(S, *_fit(S, all_idx[S["mature"]], all_idx[S["closed"]], ROW_FEATURES), ROW_FEATURES)

    rng = np.random.default_rng(seed)
    groups = S["P"].groupby("team_id").indices
    teams = np.array(list(groups))
    draws = []
    for b in range(n_boot):
        idx = np.concatenate([groups[t] for t in rng.choice(teams, len(teams))])
        draws.append(_effects(S, *_fit(S, idx[S["mature"][idx]], idx[S["closed"][idx]], features), features,
                              side_scale=rng.uniform(0.5, 1.5)))
        log(f"  what-if bootstrap {b + 1}/{n_boot}")

    rows, meta = [], {}
    for pol in POLICIES:
        meta[pol.name] = {"label": pol.label, "description": pol.description, "assumption": pol.assumption,
                          "affected_payments": point[pol.name]["_affected"],
                          "jobs_lost": round(point[pol.name]["_jobs_lost"]), "metrics": {}}
        for metric in ["disputes", "disputes_lost", "usd_lost"]:
            est = point[pol.name][metric]
            bs = np.array([d[pol.name][metric] for d in draws])
            lo, hi = np.percentile(bs, [5, 95])
            lo, hi = min(lo, est), max(hi, est)
            same_sign = float(np.mean(np.sign(bs) == np.sign(est)))
            rel = (hi - lo) / 2 / max(abs(est), 1e-9)
            conf = "high" if same_sign >= 0.95 and rel <= 0.35 else "medium" if same_sign >= 0.9 else "low"
            if metric == "disputes" and not pol.changes_dispute_rate:
                conf = "assumed"
            rnd = 0 if metric == "usd_lost" else 1
            rows.append({"policy": pol.name, "metric": metric, "estimated_change": round(est, rnd),
                         "low": round(lo, rnd), "high": round(hi, rnd)})
            meta[pol.name]["metrics"][metric] = {
                "baseline": round(point["_baseline"][metric], rnd), "estimate": round(est, rnd),
                "low": round(lo, rnd), "high": round(hi, rnd), "confidence": conf,
                "draws_same_sign": round(same_sign, 2), "naive_no_team_controls": round(naive[pol.name][metric], rnd)}
    team_means = S["P"].groupby("team_id")[[f"tm_{c}" for c in TEAM_MEAN_OF]].first()
    action = {"dispute": md, "loss": ml, "features": features, "team_means": team_means}
    return {"rows": rows, "meta": meta, "baseline": point["_baseline"], "action": action}


def add_team_means(P: pd.DataFrame, team_means: pd.DataFrame) -> pd.DataFrame:
    """Attach months 1-22 team averages (Mundlak controls); unseen teams get the platform average."""
    tm = team_means.reindex(P.team_id.values).fillna(team_means.mean())
    return pd.concat([P.drop(columns=[c for c in tm.columns if c in P]), tm.set_axis(P.index)], axis=1)
