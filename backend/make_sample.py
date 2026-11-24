"""Cut a test upload out of the training data, shaped like the months 23-24 files the brief describes:
invoices and photos as they were when the payment was collected, disputes without outcome or closed_at.

Usage (from backend/):  python make_sample.py [--start 2026-07-01] [--out ../data/sample_upload]
The models were trained on these months, so scores are in-sample: use it to test the app, not the models.
"""
import argparse
from pathlib import Path

import pandas as pd

from config import DATA_DIR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DATA_DIR))
    ap.add_argument("--start", default="2026-07-01", help="first collected_at day to include")
    ap.add_argument("--out", default=str(DATA_DIR / "sample_upload"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    pay = pd.read_csv(f"{a.data}/payments.csv", dtype=str)
    pay = pay[pay.collected_at >= a.start]
    inv = pd.read_csv(f"{a.data}/invoices.csv", dtype=str)
    inv = inv[inv.invoice_id.isin(pay.invoice_id)]
    # photos as at payment: keep those uploaded by the invoice's latest payment in the period
    paid = pay.groupby("invoice_id").collected_at.max().rename("paid_at")
    ph = pd.read_csv(f"{a.data}/photos.csv", dtype=str).join(paid, on="invoice_id", how="inner")
    ph = ph[ph.uploaded_at <= ph.paid_at].drop(columns="paid_at")
    dis = pd.read_csv(f"{a.data}/disputes.csv", dtype=str)
    dis = dis[dis.payment_id.isin(pay.payment_id)].drop(columns=["outcome", "closed_at"])

    for name, df in [("invoices", inv), ("photos", ph), ("payments", pay), ("disputes", dis)]:
        path = out / f"{name}.csv"
        df.to_csv(path, index=False)
        print(f"{path}  {len(df):>6} rows  {path.stat().st_size / 2**20:.1f} MB")


if __name__ == "__main__":
    main()
