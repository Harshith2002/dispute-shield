"""Run from backend/:  python -m pytest tests -q"""
import io
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data import read_table  # noqa: E402
from features import asof_cumsum  # noqa: E402
from policies import BY_NAME  # noqa: E402
from scoring import fight_value  # noqa: E402


def test_asof_counts_only_strictly_earlier_events():
    ev = pd.DataFrame({"team_id": ["A", "A", "B"], "t": pd.to_datetime(["2025-01-01", "2025-02-01", "2025-01-01"]),
                       "n": [1.0, 1.0, 1.0]})
    rows = pd.DataFrame({"team_id": ["A", "A", "A", "C"],
                         "t": pd.to_datetime(["2024-12-31", "2025-02-01", "2025-03-01", "2025-03-01"])})
    assert asof_cumsum(rows, ev, "team_id", ["n"])["n"].tolist() == [0, 1, 2, 0]   # same-time event excluded


def test_fight_rule_breaks_even_at_fight_cost():
    assert fight_value(0.5, 5.0) == pytest.approx(0.5 * 30 - 15)   # $5 + $25 fee at 50% -> exactly break-even
    assert fight_value(0.1, 1000.0) > 0
    assert fight_value(0.02, 100.0) < 0


def test_address_policy_removes_three_percent_of_small_jobs():
    F = pd.DataFrame({"amount_usd": [100.0] * 100 + [500.0] * 10, "f_address": [0.0] * 50 + [1.0] * 50 + [0.0] * 10})
    lost = BY_NAME["address_mandatory"].jobs_lost(F)
    assert lost.sum() == pytest.approx(3.0)          # 3% of the 100 jobs under $300
    assert lost[F.amount_usd >= 300].sum() == 0
    assert lost[F.f_address == 1].sum() == 0


def _csv(name, header, rows):
    return read_table(name, io.BytesIO((header + "\n" + "\n".join(rows)).encode()))


def test_upload_scores_and_exports_in_brief_format():
    from scoring import Scorer, dispute_export, payment_export
    s = Scorer.load()
    team = s.h.teams.team_id.iloc[0]
    inv = _csv("invoices", "invoice_id,team_id,customer_id,created_at,job_completed_at,job_type,amount_usd,"
               "line_item_count,job_description_chars,customer_address_present,customer_email_present,"
               "customer_phone_present,signed_estimate,terms_accepted,tech_gps_checkin,completion_signature,"
               "photos_before_count,photos_after_count,invoice_status,updated_at",
               [f"IN1,{team},C1,2026-09-02 10:00,2026-09-02 12:00,Repair,250,2,80,True,True,True,False,True,True,"
                "False,1,0,paid,2026-09-02 12:00",
                f"IN2,{team},C2,2026-09-03 10:00,2026-09-03 12:00,Repair,1500,1,20,False,False,True,False,False,"
                "False,False,0,0,paid,2026-09-03 12:00"])
    photos = _csv("photos", "photo_id,invoice_id,kind,uploaded_at", ["PH1,IN1,before,2026-09-02 10:30"])
    pay = _csv("payments", "payment_id,invoice_id,team_id,customer_id,collected_at,amount_usd,tip_usd,payment_method,"
               "card_fingerprint,card_country,card_type,avs_result,cvv_result,receipt_sent",
               [f"PY1,IN1,{team},C1,2026-09-02 12:05,250,10,tap,FP1,US,credit,not_checked,not_checked,True",
                f"PY2,IN2,{team},C2,2026-09-03 12:05,1500,0,keyed,FP2,GB,prepaid,no_match,no_match,False"])
    dis = _csv("disputes", "dispute_id,payment_id,invoice_id,team_id,opened_at,reason,amount_usd,merchant_responded,"
               "evidence_submitted", [f"DS1,PY2,IN2,{team},2026-10-01 09:00,fraud,1500,True,customer_address"])

    P = s.score_payments(inv, photos, pay)
    E = payment_export(P, [])
    assert list(E.columns) == ["payment_id", "invoice_win_prob", "payment_win_prob", "dispute_risk_tier",
                               "dispute_risk_score", "expected_loss_usd"]
    assert E.payment_id.tolist() == ["PY1", "PY2"]
    assert set(E.dispute_risk_tier) <= {"low", "medium", "high"}
    for c in ["invoice_win_prob", "payment_win_prob", "dispute_risk_score"]:
        assert E[c].between(0, 1).all()
    assert E.dispute_risk_score[1] > E.dispute_risk_score[0]   # keyed foreign card failing AVS/CVV vs tap

    X = dispute_export(s.score_disputes(dis, P))
    assert list(X.columns) == ["dispute_id", "win_prob", "recommendation"]
    assert X.win_prob.between(0, 1).all() and set(X.recommendation) <= {"fight", "accept"}


def test_upload_missing_column_is_reported():
    csv = io.BytesIO(b"payment_id,invoice_id\nPY1,IN1\n")
    with pytest.raises(ValueError, match="collected_at"):
        read_table("payments", csv)
