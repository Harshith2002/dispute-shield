"""Read and validate the CSV files (training data and uploads share one format)."""
import pandas as pd

from config import DATA_DIR

COLUMNS = {
    "teams": ["team_id", "profession", "state", "onboarded_on", "team_size"],
    "invoices": ["invoice_id", "team_id", "customer_id", "created_at", "job_completed_at", "job_type", "amount_usd",
                 "line_item_count", "job_description_chars", "customer_address_present", "customer_email_present",
                 "customer_phone_present", "signed_estimate", "terms_accepted", "tech_gps_checkin",
                 "completion_signature", "photos_before_count", "photos_after_count"],
    "photos": ["photo_id", "invoice_id", "kind", "uploaded_at"],
    "payments": ["payment_id", "invoice_id", "team_id", "customer_id", "collected_at", "amount_usd", "tip_usd",
                 "payment_method", "card_fingerprint", "card_country", "card_type", "avs_result", "cvv_result",
                 "receipt_sent"],
    # outcome / closed_at are absent from uploaded disputes
    "disputes": ["dispute_id", "payment_id", "invoice_id", "team_id", "opened_at", "reason", "amount_usd",
                 "merchant_responded", "evidence_submitted"],
}
DATES = {
    "teams": ["onboarded_on"],
    "invoices": ["created_at", "job_completed_at", "updated_at"],
    "photos": ["uploaded_at"],
    "payments": ["collected_at"],
    "disputes": ["opened_at", "closed_at"],
}
BOOLS = {
    "invoices": ["customer_address_present", "customer_email_present", "customer_phone_present", "signed_estimate",
                 "terms_accepted", "tech_gps_checkin", "completion_signature"],
    "payments": ["receipt_sent"],
    "disputes": ["merchant_responded"],
}
NUMBERS = {
    "teams": ["team_size"],
    "invoices": ["amount_usd", "line_item_count", "job_description_chars", "photos_before_count", "photos_after_count"],
    "payments": ["amount_usd", "tip_usd"],
    "disputes": ["amount_usd"],
}
IDS = ["team_id", "invoice_id", "payment_id", "customer_id", "dispute_id", "photo_id", "card_fingerprint"]


def to_bool(s: pd.Series) -> pd.Series:
    return s.astype(str).str.strip().str.lower().isin(["true", "1", "yes", "t"])


def read_table(name: str, src) -> pd.DataFrame:
    """Read one table from a path or file-like object; raise ValueError naming any missing columns."""
    df = pd.read_csv(src, dtype={c: "string" for c in IDS}, keep_default_na=True)
    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in COLUMNS[name] if c not in df.columns]
    if missing:
        raise ValueError(f"{name}.csv is missing columns: {', '.join(missing)}")
    for c in IDS:
        if c in df.columns:
            df[c] = df[c].astype(object).where(df[c].notna(), None)
    for c in DATES.get(name, []):
        if c in df.columns:
            # all times are UTC (brief); accept mixed formats instead of silently dropping rows
            df[c] = pd.to_datetime(df[c], errors="coerce", format="mixed", utc=True).dt.tz_localize(None).astype("datetime64[ns]")
    for c in BOOLS.get(name, []):
        df[c] = to_bool(df[c])
    for c in NUMBERS.get(name, []):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    for c in ["payment_method", "card_country", "card_type", "avs_result", "cvv_result", "reason", "kind",
              "outcome", "evidence_submitted"]:
        if c in df.columns:
            df[c] = df[c].astype(object).where(df[c].notna(), None)
    return df


def load_training(data_dir=DATA_DIR) -> dict:
    return {name: read_table(name, f"{data_dir}/{name}.csv") for name in COLUMNS}
