"""Dispute reason registry. Adding a reason = one entry here, then re-run train.py."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Reason:
    key: str                 # value in disputes.reason
    label: str
    key_evidence: tuple      # evidence items that matter most for this reason (adds reason x evidence features)
    guidance: str            # what the team should argue


REASONS = [
    Reason("fraud", "Fraud / unauthorized",
           ("card_present", "avs_cvv_match", "completion_signature", "gps_checkin"),
           "Show the cardholder was there: card-present payment, AVS/CVV match, signature, GPS check-in."),
    Reason("service_not_provided", "Service not provided",
           ("gps_checkin", "job_photos", "completion_signature", "customer_address"),
           "Prove the job happened: GPS check-in at the address, after-photos, completion signature."),
    Reason("not_as_described", "Not as described",
           ("signed_estimate", "job_photos", "itemized_invoice", "customer_address"),
           "Show the customer agreed to the scope: signed estimate, itemized invoice, before/after photos."),
    Reason("duplicate", "Duplicate charge",
           ("receipt", "itemized_invoice"),
           "Show the charges are for different work: separate itemized invoices and receipts."),
    Reason("credit_not_processed", "Credit not processed",
           ("terms_accepted", "receipt"),
           "Show the refund terms the customer accepted and that no refund was owed or it was issued."),
]
REASON_KEYS = [r.key for r in REASONS]
BY_KEY = {r.key: r for r in REASONS}


def label(key) -> str:
    return BY_KEY[key].label if key in BY_KEY else str(key)
