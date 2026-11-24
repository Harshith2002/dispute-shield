from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parent
DATA_DIR = BACKEND.parent / "data"           # raw CSVs, not committed
ARTIFACTS = BACKEND / "artifacts"            # frozen models + app data, committed
EXPERIMENTS = BACKEND / "experiments"

DISPUTE_FEE = 25.0   # lost with the dispute unless won
FIGHT_COST = 15.0    # team time to fight one dispute

DATA_START = pd.Timestamp("2024-11-01")   # dispute records start here
DATA_END = pd.Timestamp("2026-09-01")     # end of month 22 (exclusive)
SIGNATURE_LAUNCH = pd.Timestamp("2025-12-01")
MATURITY_DAYS = 90                        # longest observed payment -> dispute lag

# Time split used for every model comparison: train on the past, validate on the most recent mature period.
VALID_START = pd.Timestamp("2026-01-01")

# Categorical levels are fixed here so uploaded files always produce the same feature columns.
METHODS = ["tap", "chip", "keyed", "ach", "bnpl"]
AVS = ["match", "partial", "no_match", "not_checked"]
CVV = ["match", "no_match", "not_checked"]
CARD_TYPES = ["credit", "debit", "prepaid"]
