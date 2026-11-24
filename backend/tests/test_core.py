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


def test_upload_missing_column_is_reported():
    csv = io.BytesIO(b"payment_id,invoice_id\nPY1,IN1\n")
    with pytest.raises(ValueError, match="collected_at"):
        read_table("payments", csv)
