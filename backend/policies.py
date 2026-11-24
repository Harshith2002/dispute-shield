"""Policy registry for the what-if. Adding a policy = one Policy entry; whatif.py needs no change.

A policy says which payments it changes, how their features change, and what share of those jobs
would leave ScanPay (side effect). Features are the model columns built in features.py.
"""
from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd

from config import AVS, CVV


@dataclass(frozen=True)
class Policy:
    name: str
    label: str
    description: str
    affected: Callable[[pd.DataFrame], pd.Series]     # frame -> bool mask of payments the rule changes
    apply: Callable[[pd.DataFrame], None]              # mutates feature columns of the affected rows (a copy)
    jobs_lost: Callable[[pd.DataFrame], pd.Series]     # frame -> share of each job no longer on ScanPay
    assumption: str


def _no_loss(F):
    return pd.Series(0.0, index=F.index)


def _address_lost(F):
    # brief: ~3% of all jobs under $300 leave; they come from the customers who gave no address.
    under = F.amount_usd < 300
    pool = under & (F.f_address == 0)
    share = 0.03 * under.sum() / max(pool.sum(), 1)
    return pd.Series(np.where(pool, min(share, 1.0), 0.0), index=F.index)


def _set_address(F):
    F["f_address"] = 1.0


def _keyed_over_1000(F):
    return (F.m_keyed == 1) & (F.amount_usd > 1000)


def _to_card_present(F):
    F["m_keyed"], F["m_chip"] = 0.0, 1.0
    for a in AVS:
        F[f"avs_{a}"] = float(a == "not_checked")
    for c in CVV:
        F[f"cvv_{c}"] = float(c == "not_checked")


def _set_estimate(F):
    F["f_estimate"] = 1.0


def _set_photos(F):
    F["f_photo_before"], F["f_photo_after"] = 1.0, 1.0


POLICIES = [
    Policy("address_mandatory", "Customer address mandatory",
           "Every invoice must carry the customer's service address.",
           affected=lambda F: F.f_address == 0, apply=_set_address, jobs_lost=_address_lost,
           assumption="About 3% of jobs under $300 stop being invoiced through ScanPay (taken from no-address jobs)."),
    Policy("keyed_block_over_1000", "No keyed-in cards above $1,000",
           "Card-not-present (keyed) payments above $1,000 are blocked; the customer pays by tap/chip instead.",
           affected=_keyed_over_1000, apply=_to_card_present,
           jobs_lost=lambda F: _keyed_over_1000(F).astype(float) * 0.08,
           assumption="About 8% of those jobs are lost; the rest pay card-present."),
    Policy("signed_estimate_over_500", "Signed estimate above $500",
           "Jobs above $500 need a signed estimate before work starts.",
           affected=lambda F: (F.f_estimate == 0) & (F.amount_usd > 500), apply=_set_estimate, jobs_lost=_no_loss,
           assumption="No jobs lost (brief: no side effects unless argued otherwise)."),
    Policy("photos_required", "Before and after photos required",
           "Every job needs before and after photos attached before the payment is taken.",
           affected=lambda F: (F.f_photo_before == 0) | (F.f_photo_after == 0), apply=_set_photos,
           jobs_lost=_no_loss, assumption="No jobs lost."),
]
BY_NAME = {p.name: p for p in POLICIES}
