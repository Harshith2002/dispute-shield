"""Score payments and disputes with the frozen months 1-22 models, and turn gaps into actions."""
import joblib
import numpy as np
import pandas as pd

from config import ARTIFACTS, DISPUTE_FEE, FIGHT_COST
from evidence import EVIDENCE_RULES
from features import build_dispute_frame, build_payment_frame, derive
from reasons import BY_KEY
from whatif import add_team_means

MIN_LIFT = 0.005  # only suggest actions worth at least half a point of win probability


def set_evidence(X: pd.DataFrame, feature: str) -> pd.DataFrame:
    """Turn one evidence flag on and refresh derived features."""
    X = X.copy()
    if feature == "f_photo_any":
        X["f_photo_after"] = 1.0
        X["f_log_photos"] = np.maximum(X.f_log_photos, np.log1p(1))
    else:
        X[feature] = 1.0
    return derive(X)


def fight_value(win_prob, amount):
    """Expected dollars gained by fighting vs accepting: win recovers amount + fee, fighting costs $15."""
    return win_prob * (amount + DISPUTE_FEE) - FIGHT_COST


class Scorer:
    def __init__(self, bundle: dict):
        self.b = bundle
        self.h = bundle["history"]

    @classmethod
    def load(cls, path=ARTIFACTS / "models.joblib"):
        return cls(joblib.load(path))

    def p(self, target, X) -> np.ndarray:
        return self.b["models"][target].predict_proba(X)[:, 1]

    def tier(self, score):
        lo, hi = self.b["tier_thresholds"]
        return np.where(score >= hi, "high", np.where(score >= lo, "medium", "low"))

    def evidence_lift(self, P, rule):
        """(missing mask, lift) for one evidence rule: drop in P(lost | disputed) from the within-team
        policy model if the team added it. Same model as the what-if, so actions and policies agree."""
        a = self.b["action"]
        missing = (P[rule.feature] == 0).values
        if rule.feature == "f_signature":
            missing = missing & (P.f_sig_available.values == 1)
        lift = np.zeros(len(P))
        if missing.any():
            X = add_team_means(P.loc[missing], a["team_means"])
            lost = lambda Z: a["loss"].predict_proba(Z[a["features"]].values)[:, 1]  # noqa: E731
            lift[missing] = lost(X) - lost(set_evidence(X, rule.feature))
        return missing, lift

    def _actions(self, P, moment):
        """Per row: up to 3 evidence items the team can still add at this moment, largest gain first."""
        out = [[] for _ in range(len(P))]
        for rule in EVIDENCE_RULES:
            if moment in rule.fixable_at and rule.feature in P:
                missing, lift = self.evidence_lift(P, rule)
                for i in np.flatnonzero(missing & (lift >= MIN_LIFT)):
                    out[i].append({"text": rule.fix, "evidence": rule.label, "lift": round(float(lift[i]), 3)})
        return [sorted(a, key=lambda d: -d["lift"])[:3] for a in out]

    def score_payments(self, invoices, photos, payments) -> pd.DataFrame:
        P = build_payment_frame(invoices, photos, payments, self.h)
        P["invoice_win_prob"] = self.p("win_invoice", P)
        P["payment_win_prob"] = self.p("win_payment", P)
        P["dispute_risk_score"] = self.p("risk", P)
        P["dispute_risk_tier"] = self.tier(P.dispute_risk_score.values)
        amount = P.amount_usd.values + DISPUTE_FEE
        # loss if disputed, assuming the team then fights only when it is worth it
        loss_if_disputed = np.minimum(amount, (1 - P.payment_win_prob.values) * amount + FIGHT_COST)
        P["expected_loss_usd"] = P.dispute_risk_score.values * loss_if_disputed
        inv_actions = self._actions(P, "invoice")
        pay_actions = self._actions(P, "payment")
        P["invoice_actions"] = inv_actions
        P["payment_actions"] = [a + self._risk_flags(r) for a, r in zip(pay_actions, P.itertuples())]
        return P

    @staticmethod
    def _risk_flags(r) -> list:
        flags = []
        if r.avs_no_match or r.cvv_no_match:
            flags.append({"text": "Card failed AVS/CVV checks: confirm the job and cardholder with the customer "
                                  "now, and prefer a tap/chip payment next time.", "evidence": "Card checks"})
        if r.f_foreign and r.m_keyed:
            flags.append({"text": "Foreign card keyed in: high fraud-dispute rate (about 7%). Keep the signed "
                                  "estimate, GPS check-in and photos ready.", "evidence": "Card origin"})
        if r.f_card_prior_disputes > 0:
            flags.append({"text": "This card has disputed payments before (any ScanPay team).",
                          "evidence": "Card history"})
        return flags

    def score_disputes(self, disputes, P) -> pd.DataFrame:
        D = build_dispute_frame(disputes, P.drop(columns=[c for c in P.columns if c.endswith(
            ("_win_prob", "_actions")) or c.startswith(("dispute_risk", "expected_loss"))]))
        D["win_prob"] = self.p("win_dispute", D)
        D["fight_value_usd"] = fight_value(D.win_prob.values, D.amount_usd.values)
        D["recommendation"] = np.where(D.fight_value_usd > 0, "fight", "accept")
        D["evidence_actions"] = self._dispute_actions(D)
        D["reason_guidance"] = D.reason.map(lambda k: BY_KEY[k].guidance if k in BY_KEY else "")
        return D

    def _dispute_actions(self, D) -> list:
        """Evidence the payment supports but that was not submitted, plus responding at all."""
        base = self.p("win_dispute", D)
        out = [[] for _ in range(len(D))]
        options = [(f"ev_{r.item}", (D[r.feature] == 1).values & (D[f"ev_{r.item}"] == 0).values,
                    f"Submit: {r.label}") for r in EVIDENCE_RULES if r.feature in D]
        options.append(("f_responded", (D.f_responded == 0).values,
                        "Respond to the dispute: unanswered disputes are almost always lost."))
        for col, mask, text in options:
            if not mask.any():
                continue
            X = D.loc[mask].copy()
            X[col] = 1.0
            if col.startswith("ev_"):
                X["f_n_evidence"] += 1
            lift = self.p("win_dispute", derive(X)) - base[mask]
            for i, l in zip(np.flatnonzero(mask), lift):
                if l >= MIN_LIFT:
                    out[i].append({"text": text, "lift": round(float(l), 3)})
        return [sorted(a, key=lambda d: -d["lift"]) for a in out]


def payment_export(P: pd.DataFrame, blank: list) -> pd.DataFrame:
    cols = ["payment_id", "invoice_win_prob", "payment_win_prob", "dispute_risk_tier", "dispute_risk_score",
            "expected_loss_usd"]
    E = P[cols].copy()
    for c in ["invoice_win_prob", "payment_win_prob", "dispute_risk_score"]:
        E[c] = E[c].round(4)
    E["expected_loss_usd"] = E.expected_loss_usd.round(2)
    for c in blank:
        E[c] = ""
    return E


def dispute_export(D: pd.DataFrame) -> pd.DataFrame:
    return D[["dispute_id", "win_prob", "recommendation"]].assign(win_prob=D.win_prob.round(4))

