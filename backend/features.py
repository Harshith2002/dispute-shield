"""As-of features for the three moments.

Leakage rules (see APPROACH.md):
- invoice_status and updated_at are never used (both change when a dispute arrives).
- Photo counts are rebuilt from photos.csv using only photos uploaded by the time the payment was collected,
  because the invoice snapshot counts include photos added after disputes.
- Team and card history only use disputes opened (counts) or closed (outcomes) strictly before the moment.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from config import AVS, CARD_TYPES, CVV, METHODS, SIGNATURE_LAUNCH
from evidence import EVIDENCE_ITEMS
from reasons import REASON_KEYS, REASONS

import warnings

warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)  # many small column inserts; frames are small

PRIOR_PAYMENTS = 500   # pseudo-counts for smoothing team rates towards the platform rate
PRIOR_DISPUTES = 10


@dataclass
class History:
    """Months 1-22 events used for as-of team/card features, both in training and when scoring uploads."""
    payments: pd.DataFrame   # team_id, t
    disputes: pd.DataFrame   # team_id, card_fingerprint, opened_at, closed_at, outcome, merchant_responded
    teams: pd.DataFrame
    professions: list
    base_dispute_rate: float
    base_win_rate: float
    base_response_rate: float

    @classmethod
    def from_tables(cls, t: dict) -> "History":
        pay, dis = t["payments"], t["disputes"]
        dis = dis.merge(pay[["payment_id", "card_fingerprint"]], on="payment_id", how="left")
        decided = dis[dis.outcome.isin(["won", "lost"])]
        return cls(
            payments=pay[["team_id", "collected_at"]].rename(columns={"collected_at": "t"}),
            disputes=dis[["team_id", "card_fingerprint", "opened_at", "closed_at", "outcome", "merchant_responded"]],
            teams=t["teams"],
            professions=sorted(t["teams"].profession.dropna().unique().tolist()),
            base_dispute_rate=len(dis) / max(len(pay), 1),
            base_win_rate=float((decided.outcome == "won").mean()),
            base_response_rate=float(decided.merchant_responded.mean()),
        )


def asof_cumsum(rows: pd.DataFrame, events: pd.DataFrame, by: str, cols: list) -> pd.DataFrame:
    """For each row (by, t), the sum of event `cols` with event t strictly before row t."""
    ev = events.dropna(subset=["t"])
    ev = ev[ev[by].notna()].sort_values("t", kind="stable").copy()
    ev[cols] = ev.groupby(by)[cols].cumsum()
    left = pd.DataFrame({by: rows[by].fillna("__none__").astype("string").values, "t": rows["t"].values,
                         "_i": np.arange(len(rows))}).dropna(subset=["t"]).sort_values("t", kind="stable")
    ev[by] = ev[by].astype("string")
    out = pd.merge_asof(left, ev[[by, "t"] + cols], on="t", by=by, allow_exact_matches=False)
    res = np.zeros((len(rows), len(cols)))
    res[out["_i"].values] = out[cols].fillna(0).values
    return pd.DataFrame(res, index=rows.index, columns=cols)


def photo_counts_asof(photos: pd.DataFrame, ref: pd.DataFrame) -> pd.DataFrame:
    """ref: payment_id, invoice_id, t -> before/after photo counts uploaded by t, indexed by payment_id."""
    m = photos[["invoice_id", "kind", "uploaded_at"]].merge(ref, on="invoice_id")
    m = m[m.uploaded_at <= m.t]
    c = m.groupby(["payment_id", "kind"]).size().unstack(fill_value=0)
    return c.reindex(columns=["before", "after"], fill_value=0)


def _onehot(F, s: pd.Series, levels, prefix):
    for lv in levels:
        F[f"{prefix}_{lv}"] = (s == lv).astype(float)


def team_history(rows: pd.DataFrame, h: History) -> pd.DataFrame:
    """rows: team_id, t. Smoothed team dispute rate, win rate and response rate as of t."""
    pays = h.payments.assign(n=1.0)
    n_pay = asof_cumsum(rows, pays, "team_id", ["n"])["n"]
    opened = h.disputes[["team_id", "opened_at"]].rename(columns={"opened_at": "t"}).assign(n=1.0)
    n_dis = asof_cumsum(rows, opened, "team_id", ["n"])["n"]
    dec = h.disputes[h.disputes.outcome.isin(["won", "lost"])]
    closed = pd.DataFrame({"team_id": dec.team_id, "t": dec.closed_at, "won": (dec.outcome == "won").astype(float),
                           "dec": 1.0, "resp": dec.merchant_responded.astype(float)})
    c = asof_cumsum(rows, closed, "team_id", ["won", "dec", "resp"])
    return pd.DataFrame({
        "f_team_log_payments": np.log1p(n_pay),
        "f_team_dispute_rate": 100 * (n_dis + PRIOR_PAYMENTS * h.base_dispute_rate) / (n_pay + PRIOR_PAYMENTS),
        "f_team_win_rate": (c.won + PRIOR_DISPUTES * h.base_win_rate) / (c.dec + PRIOR_DISPUTES),
        "f_team_response_rate": (c.resp + PRIOR_DISPUTES * h.base_response_rate) / (c.dec + PRIOR_DISPUTES),
    }, index=rows.index)


def card_history(rows: pd.DataFrame, h: History) -> pd.Series:
    """rows: card_fingerprint, t. Disputes already opened on the same physical card (any team)."""
    ev = h.disputes[["card_fingerprint", "opened_at"]].rename(columns={"opened_at": "t"}).assign(n=1.0)
    return asof_cumsum(rows, ev, "card_fingerprint", ["n"])["n"].clip(upper=3)


def derive(F: pd.DataFrame) -> pd.DataFrame:
    """Recompute features that depend on other features (used after policy/evidence toggles)."""
    F["f_photo_any"] = np.maximum(F.f_photo_before, F.f_photo_after)
    F["f_evidence_count"] = F[["f_address", "f_estimate", "f_terms", "f_gps", "f_signature", "f_photo_any",
                               "f_itemized"]].sum(axis=1)
    if "m_tap" in F:
        F["f_card_present"] = F.m_tap + F.m_chip
        F["f_avs_cvv_match"] = F.avs_match * F.cvv_match
    if "rs_fraud" in F:
        for r in REASONS:
            for item in r.key_evidence:
                F[f"ix_{r.key}_{item}"] = F[f"rs_{r.key}"] * F[f"ev_{item}"]
    return F


def build_payment_frame(invoices: pd.DataFrame, photos: pd.DataFrame, payments: pd.DataFrame,
                        h: History) -> pd.DataFrame:
    """One row per payment with raw columns used by the app and all invoice- and payment-moment features."""
    inv_cols = ["invoice_id", "created_at", "job_completed_at", "job_type", "line_item_count",
                "job_description_chars", "customer_address_present", "customer_email_present",
                "customer_phone_present", "signed_estimate", "terms_accepted", "tech_gps_checkin",
                "completion_signature"]
    P = payments.merge(invoices[inv_cols].drop_duplicates("invoice_id"), on="invoice_id", how="left")
    P = P.merge(h.teams[["team_id", "profession", "onboarded_on", "team_size"]], on="team_id", how="left")
    P = P.reset_index(drop=True)
    ph = photo_counts_asof(photos, P[["payment_id", "invoice_id"]].assign(t=P.collected_at))
    P["photos_before"] = P.payment_id.map(ph["before"]).fillna(0)
    P["photos_after"] = P.payment_id.map(ph["after"]).fillna(0)

    F = pd.DataFrame(index=P.index)
    b = lambda c: P[c].fillna(False).astype(float)  # noqa: E731
    F["f_log_amount"] = np.log1p(P.amount_usd.clip(lower=0))
    F["f_line_items"] = P.line_item_count.fillna(1).clip(upper=10)
    F["f_itemized"] = (P.line_item_count.fillna(1) > 1).astype(float)
    F["f_log_desc"] = np.log1p(P.job_description_chars.fillna(0))
    F["f_address"] = b("customer_address_present")
    F["f_email"] = b("customer_email_present")
    F["f_phone"] = b("customer_phone_present")
    F["f_estimate"] = b("signed_estimate")
    F["f_terms"] = b("terms_accepted")
    F["f_gps"] = b("tech_gps_checkin")
    F["f_signature"] = b("completion_signature")
    F["f_sig_available"] = (P.created_at.fillna(P.collected_at) >= SIGNATURE_LAUNCH).astype(float)
    F["f_photo_before"] = (P.photos_before > 0).astype(float)
    F["f_photo_after"] = (P.photos_after > 0).astype(float)
    F["f_log_photos"] = np.log1p(P.photos_before + P.photos_after)
    F["f_team_size_log"] = np.log1p(P.team_size.fillna(1))
    tenure = (P.created_at.fillna(P.collected_at) - P.onboarded_on).dt.days
    F["f_team_tenure_log"] = np.log1p(tenure.fillna(0).clip(lower=0))
    _onehot(F, P.profession, h.professions, "prof")

    t_inv = P.created_at.where(P.created_at < P.collected_at, P.collected_at)
    F = F.join(team_history(pd.DataFrame({"team_id": P.team_id, "t": t_inv}), h))

    _onehot(F, P.payment_method, METHODS, "m")
    _onehot(F, P.avs_result, AVS, "avs")
    _onehot(F, P.cvv_result, CVV, "cvv")
    _onehot(F, P.card_type, CARD_TYPES, "ct")
    F["f_foreign"] = (P.card_country.notna() & (P.card_country != "US")).astype(float)
    F["f_receipt"] = b("receipt_sent")
    F["f_tip"] = (P.tip_usd > 0).astype(float)
    F["f_paid_before_complete"] = (P.collected_at < P.job_completed_at).astype(float)
    F["f_card_prior_disputes"] = card_history(pd.DataFrame({"card_fingerprint": P.card_fingerprint,
                                                            "t": P.collected_at}), h)
    return pd.concat([P, derive(F)], axis=1)


def build_dispute_frame(disputes: pd.DataFrame, P: pd.DataFrame) -> pd.DataFrame:
    """One row per dispute: payment-frame features plus what is known once the dispute arrives."""
    pcols = [c for c in P.columns if c not in ("invoice_id", "team_id", "amount_usd")]
    D = disputes.merge(P[pcols].rename(columns={"customer_id": "customer_id_pay"}), on="payment_id", how="left")
    D = D.reset_index(drop=True)
    D["matched_payment"] = D.collected_at.notna()
    feat = [c for c in P.columns if c.startswith(("f_", "m_", "avs_", "cvv_", "ct_", "prof_"))]
    D[feat] = D[feat].fillna(0.0)
    _onehot(D, D.reason, REASON_KEYS, "rs")
    D["f_responded"] = D.merchant_responded.fillna(False).astype(float)
    items = D.evidence_submitted.fillna("").str.split(";")
    for it in EVIDENCE_ITEMS:
        D[f"ev_{it}"] = items.apply(lambda l, it=it: it in l).astype(float)
    D["f_n_evidence"] = D[[f"ev_{it}" for it in EVIDENCE_ITEMS]].sum(axis=1)
    days = (D.opened_at - D.collected_at).dt.days
    D["f_log_days_to_dispute"] = np.log1p(days.fillna(30).clip(lower=0))
    D["f_log_dispute_amount"] = np.log1p(D.amount_usd.clip(lower=0))
    return derive(D)


def feature_lists(h: History) -> dict:
    invoice = (["f_log_amount", "f_line_items", "f_itemized", "f_log_desc", "f_address", "f_email", "f_phone",
                "f_estimate", "f_terms", "f_gps", "f_signature", "f_sig_available", "f_photo_before",
                "f_photo_after", "f_photo_any", "f_log_photos", "f_evidence_count", "f_team_size_log",
                "f_team_tenure_log", "f_team_log_payments", "f_team_dispute_rate", "f_team_win_rate",
                "f_team_response_rate"] + [f"prof_{p}" for p in h.professions])
    payment = (invoice + [f"m_{m}" for m in METHODS] + [f"avs_{a}" for a in AVS] + [f"cvv_{c}" for c in CVV]
               + [f"ct_{c}" for c in CARD_TYPES]
               + ["f_foreign", "f_receipt", "f_tip", "f_paid_before_complete", "f_card_prior_disputes",
                  "f_card_present", "f_avs_cvv_match"])
    dispute = (payment + [f"rs_{r}" for r in REASON_KEYS] + ["f_responded"]
               + [f"ev_{it}" for it in EVIDENCE_ITEMS]
               + ["f_n_evidence", "f_log_days_to_dispute", "f_log_dispute_amount"]
               + [f"ix_{r.key}_{it}" for r in REASONS for it in r.key_evidence])
    return {"invoice": invoice, "payment": payment, "dispute": dispute}
