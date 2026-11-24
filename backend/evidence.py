"""Evidence registry: which evidence a payment can support, and what a team can still do about gaps.

Each rule ties an `evidence_submitted` item to the invoice/payment flag that makes it available
(verified on months 1-22: an item is only ever submitted when its flag is present).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class EvidenceRule:
    item: str           # value in disputes.evidence_submitted
    label: str
    feature: str        # 0/1 feature column that says the evidence exists
    fix: str            # what to do when it is missing
    fixable_at: tuple   # moments where the team can still add it: "invoice", "payment"


EVIDENCE_RULES = [
    EvidenceRule("customer_address", "Customer address", "f_address",
                 "Add the customer's service address to the invoice.", ("invoice", "payment")),
    EvidenceRule("signed_estimate", "Signed estimate", "f_estimate",
                 "Get the estimate signed before the work starts.", ("invoice",)),
    EvidenceRule("terms_accepted", "Terms accepted", "f_terms",
                 "Have the customer accept terms (incl. refund policy) on the invoice.", ("invoice",)),
    EvidenceRule("gps_checkin", "GPS check-in", "f_gps",
                 "Technician checks in on site with the mobile app.", ()),
    EvidenceRule("completion_signature", "Completion signature", "f_signature",
                 "Ask the customer to sign on the technician's phone when the job is done.", ("invoice",)),
    EvidenceRule("job_photos", "Job photos", "f_photo_any",
                 "Attach before/after job photos now. Photos added after a dispute win less often.",
                 ("invoice", "payment")),
    EvidenceRule("itemized_invoice", "Itemized invoice", "f_itemized",
                 "Split the invoice into line items (parts, labour, call-out).", ("invoice",)),
    EvidenceRule("receipt", "Receipt sent", "f_receipt",
                 "Send the customer a receipt.", ("payment",)),
    EvidenceRule("card_present", "Card present", "f_card_present",
                 "Take the card by tap or chip instead of keying it in.", ()),
    EvidenceRule("avs_cvv_match", "AVS + CVV match", "f_avs_cvv_match",
                 "When keying a card, collect billing ZIP and CVV so both checks pass.", ()),
]
EXTRA_ITEMS = ["photos_added_after_dispute"]   # submitted evidence with no invoice flag
EVIDENCE_ITEMS = [r.item for r in EVIDENCE_RULES] + EXTRA_ITEMS
BY_ITEM = {r.item: r for r in EVIDENCE_RULES}
