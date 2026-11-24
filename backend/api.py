"""FastAPI app: upload months 23-24, score with frozen models, serve views and CSV exports.

Run (from backend/):  uvicorn api:app --port 8000
"""
import io
import json
import threading
from collections import OrderedDict

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from config import ARTIFACTS, BACKEND
from data import read_table
from evidence import EVIDENCE_RULES
from policies import POLICIES
from reasons import REASONS, label as reason_label
from scoring import Scorer, dispute_export, payment_export

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_SESSIONS = 20   # shortcut: in-memory sessions, lost on restart; use a store (Redis/S3) if multi-instance

scorer = Scorer.load()
APP = json.loads((ARTIFACTS / "app_data.json").read_text(encoding="utf-8"))
WHATIF_CSV = (ARTIFACTS / "whatif_results.csv").read_text(encoding="utf-8")
sessions: "OrderedDict[str, dict]" = OrderedDict()
lock = threading.Lock()

app = FastAPI(title="Dispute Shield")


def get_session(sid: str | None, create=False) -> dict | None:
    if not sid:
        if create:
            raise HTTPException(400, "Missing session id.")
        return None
    with lock:
        if sid in sessions:
            sessions.move_to_end(sid)
            return sessions[sid]
        if not create:
            return None
        sessions[sid] = {}
        while len(sessions) > MAX_SESSIONS:
            sessions.popitem(last=False)
        return sessions[sid]


async def read_upload(name: str, f: UploadFile) -> pd.DataFrame:
    raw = await f.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, f"{name}.csv is larger than {MAX_FILE_BYTES // 2**20} MB.")
    try:
        return read_table(name, io.BytesIO(raw))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:  # malformed CSV
        raise HTTPException(422, f"Could not read {name}.csv: {e}")


def clean(v):
    if isinstance(v, (pd.Timestamp,)):
        return None if pd.isna(v) else v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, (np.floating, float)):
        return None if np.isnan(v) else round(float(v), 4)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.bool_):
        return bool(v)
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def records(df: pd.DataFrame, cols) -> list:
    return [{c: clean(v) for c, v in zip(cols, row)} for row in df[cols].itertuples(index=False, name=None)]


PAY_COLS = ["payment_id", "invoice_id", "team_id", "collected_at", "amount_usd", "payment_method", "card_country",
            "avs_result", "cvv_result", "invoice_win_prob", "payment_win_prob", "dispute_risk_score",
            "dispute_risk_tier", "expected_loss_usd", "evidence_present", "invoice_actions", "payment_actions"]
DIS_COLS = ["dispute_id", "payment_id", "team_id", "opened_at", "reason", "reason_label", "amount_usd",
            "merchant_responded", "evidence_submitted", "win_prob", "recommendation", "fight_value_usd",
            "evidence_actions", "reason_guidance", "matched_payment"]


def present_evidence(P: pd.DataFrame) -> list:
    rules = [r for r in EVIDENCE_RULES if r.feature in P]
    flags = np.column_stack([P[r.feature].values == 1 for r in rules])
    return [[r.label for r, on in zip(rules, row) if on] for row in flags]


def page(df, cols, page_no, size):
    size = max(1, min(size, 200))
    start = max(0, page_no - 1) * size
    return {"total": int(len(df)), "page": page_no, "size": size, "rows": records(df.iloc[start:start + size], cols)}


def payment_summary(P):
    tiers = P.dispute_risk_tier.value_counts()
    return {"payments": int(len(P)), "teams": int(P.team_id.nunique()),
            "tiers": {t: int(tiers.get(t, 0)) for t in ["high", "medium", "low"]},
            "expected_loss_usd": round(float(P.expected_loss_usd.sum()), 2),
            "expected_disputes": round(float(P.dispute_risk_score.sum()), 1),
            "volume_usd": round(float(P.amount_usd.sum()), 2),
            "period": [clean(P.collected_at.min()), clean(P.collected_at.max())],
            "blank_columns": scorer.b["blank"]}


def dispute_summary(D):
    by_reason = []
    for r, g in D.groupby("reason"):
        by_reason.append({"reason": r, "label": reason_label(r), "disputes": int(len(g)),
                          "avg_win_prob": round(float(g.win_prob.mean()), 3),
                          "fight": int((g.recommendation == "fight").sum()),
                          "amount_usd": round(float(g.amount_usd.sum()), 2),
                          "expected_usd_lost_if_fought": round(float(((1 - g.win_prob) * g.amount_usd).sum()), 2)})
    return {"disputes": int(len(D)), "fight": int((D.recommendation == "fight").sum()),
            "accept": int((D.recommendation == "accept").sum()), "unmatched": int((~D.matched_payment).sum()),
            "by_reason": sorted(by_reason, key=lambda x: -x["disputes"])}


# ---------- API ----------

@app.get("/api/meta")
def meta():
    return {"teams": sorted(APP["teams"].keys()),
            "team_labels": {k: f"{k} · {v['profession']} · {v['state']}" for k, v in APP["teams"].items()},
            "policies": [{"name": p.name, "label": p.label} for p in POLICIES],
            "reasons": [{"key": r.key, "label": r.label, "guidance": r.guidance} for r in REASONS],
            "totals": APP["totals"], "models": APP["models"],
            "trained_through": scorer.b["trained_through"]}


@app.get("/api/session")
def session_state(session: str | None = None):
    s = get_session(session) or {}
    return {"payments": payment_summary(s["P"]) if "P" in s else None,
            "disputes": dispute_summary(s["D"]) if "D" in s else None}


@app.post("/api/upload/payments")
async def upload_payments(session: str = Form(...), invoices: UploadFile = File(...),
                          photos: UploadFile = File(...), payments: UploadFile = File(...)):
    t = {"invoices": await read_upload("invoices", invoices), "photos": await read_upload("photos", photos),
         "payments": await read_upload("payments", payments)}
    if t["payments"].empty:
        raise HTTPException(422, "payments.csv has no rows.")
    P = scorer.score_payments(t["invoices"], t["photos"], t["payments"])
    P["evidence_present"] = present_evidence(P)
    s = get_session(session, create=True)
    s.clear()
    s.update(tables=t, P=P)
    return payment_summary(P)


@app.post("/api/upload/disputes")
async def upload_disputes(session: str = Form(...), disputes: UploadFile = File(...),
                          invoices: UploadFile | None = File(None), photos: UploadFile | None = File(None),
                          payments: UploadFile | None = File(None)):
    s = get_session(session, create=True)
    if invoices and photos and payments:   # re-supplied step-1 files (e.g. after a server restart)
        await upload_payments(session, invoices, photos, payments)
    if "P" not in s:
        raise HTTPException(409, "Upload step 1 (invoices, photos, payments) first, or include them with the disputes.")
    d = await read_upload("disputes", disputes)
    D = scorer.score_disputes(d, s["P"])
    D["reason_label"] = D.reason.map(reason_label)
    s["D"] = D
    return dispute_summary(D)


def need(s, key, step):
    if not s or key not in s:
        raise HTTPException(409, f"Nothing scored yet: upload {step} first.")
    return s[key]


@app.get("/api/payments")
def list_payments(session: str, team: str | None = None, tier: str | None = None, q: str | None = None,
                  sort: str = "expected_loss_usd", page_no: int = 1, size: int = 50):
    P = need(get_session(session), "P", "step 1")
    if team:
        P = P[P.team_id == team]
    if tier:
        P = P[P.dispute_risk_tier == tier]
    if q:
        P = P[P.payment_id.str.contains(q, case=False, na=False) | P.invoice_id.str.contains(q, case=False, na=False)]
    if sort in ("expected_loss_usd", "dispute_risk_score", "amount_usd"):
        P = P.sort_values(sort, ascending=False)
    elif sort in ("invoice_win_prob", "payment_win_prob"):
        P = P.sort_values(sort)
    return page(P, PAY_COLS, page_no, size)


@app.get("/api/disputes")
def list_disputes(session: str, team: str | None = None, reason: str | None = None, rec: str | None = None,
                  page_no: int = 1, size: int = 50):
    D = need(get_session(session), "D", "step 2")
    if team:
        D = D[D.team_id == team]
    if reason:
        D = D[D.reason == reason]
    if rec:
        D = D[D.recommendation == rec]
    return page(D.sort_values("amount_usd", ascending=False), DIS_COLS, page_no, size)


@app.get("/api/overview")
def overview(session: str | None = None):
    s = get_session(session) or {}
    return {"history": {"totals": APP["totals"], "by_reason": APP["by_reason"]},
            "uploaded_payments": payment_summary(s["P"]) if "P" in s else None,
            "uploaded_disputes": dispute_summary(s["D"]) if "D" in s else None}


@app.get("/api/teams/{team_id}")
def team(team_id: str, session: str | None = None):
    s = get_session(session) or {}
    hist = APP["teams"].get(team_id)
    out = {"history": hist, "uploaded": None}
    if "P" in s:
        P = s["P"][s["P"].team_id == team_id]
        D = s["D"][s["D"].team_id == team_id] if "D" in s else None
        out["uploaded"] = {"summary": payment_summary(P) if len(P) else None,
                           "payments": records(P.sort_values("expected_loss_usd", ascending=False).head(100), PAY_COLS),
                           "disputes": records(D, DIS_COLS) if D is not None else None}
    if hist is None and not (out["uploaded"] and out["uploaded"]["summary"]):
        raise HTTPException(404, f"Unknown team {team_id}.")
    return out


@app.get("/api/whatif")
def whatif():
    return APP["whatif"]


@app.get("/api/export/{name}.csv")
def export(name: str, session: str | None = None):
    if name == "whatif_results":
        body = WHATIF_CSV
    elif name == "payment_predictions":
        body = payment_export(need(get_session(session), "P", "step 1"), scorer.b["blank"]).to_csv(index=False)
    elif name == "dispute_predictions":
        body = dispute_export(need(get_session(session), "D", "step 2")).to_csv(index=False)
    else:
        raise HTTPException(404, "Unknown export.")
    return StreamingResponse(iter([body]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------- frontend ----------
DIST = BACKEND.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (DIST / path).resolve()
        inside = DIST.resolve() in f.parents   # block ../ path traversal
        return FileResponse(f if path and inside and f.is_file() else DIST / "index.html")
