"""Candidate approaches (3 per prediction), metrics and the selection rule."""
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


class SegmentRate:
    """Rules baseline: smoothed outcome rate per segment (a lookup table ops can read)."""
    explain = "lookup table"

    def __init__(self, segment_fn, alpha=20.0):
        self.segment_fn, self.alpha = segment_fn, alpha

    def fit(self, X: pd.DataFrame, y):
        y = np.asarray(y, dtype=float)
        self.base_ = y.mean()
        g = pd.DataFrame({"k": self.segment_fn(X).values, "y": y}).groupby("k").y.agg(["sum", "count"])
        self.table_ = ((g["sum"] + self.alpha * self.base_) / (g["count"] + self.alpha)).to_dict()
        return self

    def predict_proba(self, X: pd.DataFrame):
        p = self.segment_fn(X).map(self.table_).fillna(self.base_).values
        return np.column_stack([1 - p, p])


class Columns:
    """Selects a fixed feature list so every model takes the full frame."""

    def __init__(self, model, features):
        self.model, self.features = model, list(features)

    def fit(self, X, y):
        self.model.fit(X[self.features].astype(float).values, np.asarray(y))
        return self

    def predict_proba(self, X):
        return self.model.predict_proba(X[self.features].astype(float).values)


# Segment functions are module-level so fitted models pickle.
def seg_risk(X):
    mismatch = ((X.avs_no_match + X.cvv_no_match) > 0).astype(int).astype(str)
    method = X[[c for c in X.columns if c.startswith("m_")]].idxmax(axis=1)
    return method + "|" + mismatch + "|" + X.f_foreign.astype(int).astype(str)


def seg_invoice(X):
    return X.f_evidence_count.clip(upper=5).astype(int).astype(str)


def seg_payment(X):
    return seg_invoice(X) + "|" + X.f_card_present.astype(int).astype(str)


def seg_dispute(X):
    reason = X[[c for c in X.columns if c.startswith("rs_")]].idxmax(axis=1).where(
        X[[c for c in X.columns if c.startswith("rs_")]].sum(axis=1) > 0, "rs_other")
    n_ev = pd.cut(X.f_n_evidence, [-1, 1, 3, 5, 99], labels=["0-1", "2-3", "4-5", "6+"]).astype(str)
    return reason + "|" + X.f_responded.astype(int).astype(str) + "|" + n_ev


SEGMENTS = {"risk": seg_risk, "win_invoice": seg_invoice, "win_payment": seg_payment, "win_dispute": seg_dispute}
EXPLAIN_RANK = {"lookup": 0, "logreg": 1, "gbm": 2}


def candidates(target: str, features: list) -> dict:
    small = target != "risk"   # win models have ~1.3k rows: stronger regularisation, fewer trees
    return {
        "lookup": SegmentRate(SEGMENTS[target]),
        "logreg": Columns(make_pipeline(StandardScaler(), LogisticRegression(C=0.05 if small else 0.1,
                                                                             max_iter=2000)), features),
        "gbm": Columns(CalibratedClassifierCV(HistGradientBoostingClassifier(
            max_depth=3, learning_rate=0.05, max_iter=150 if small else 300, l2_regularization=1.0,
            min_samples_leaf=20 if small else 200, random_state=0), method="sigmoid", cv=5), features),
    }


def ece(y, p, bins=10) -> float:
    """Expected calibration error over equal-count bins."""
    order = np.argsort(p)
    err = 0.0
    for idx in np.array_split(order, bins):
        if len(idx):
            err += len(idx) * abs(p[idx].mean() - y[idx].mean())
    return err / len(p)


def metrics(y, p) -> dict:
    y, p = np.asarray(y, dtype=float), np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return {"n": int(len(y)), "positives": int(y.sum()), "auc": roc_auc_score(y, p),
            "avg_precision": average_precision_score(y, p), "log_loss": log_loss(y, p),
            "brier": brier_score_loss(y, p), "ece": ece(y, p), "pred_over_actual": p.mean() / max(y.mean(), 1e-9)}


def choose(results: dict) -> str:
    """Lowest validation log loss; within 1% of the best, prefer the more explainable approach."""
    best = min(r["log_loss"] for r in results.values())
    ok = [k for k, r in results.items() if r["log_loss"] <= best * 1.01]
    return min(ok, key=EXPLAIN_RANK.get)


def top_coefficients(model: Columns, k=12) -> list:
    """Standardised logistic-regression coefficients, largest first (for the approach doc and the app)."""
    lr = model.model[-1]
    coef = pd.Series(lr.coef_[0], index=model.features)
    return [(f, round(float(c), 3)) for f, c in coef.reindex(coef.abs().sort_values(ascending=False).index)[:k].items()]
