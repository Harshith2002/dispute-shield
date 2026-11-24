# Dispute Shield: approach

## 1. What the data shows

Months 1–22: 221k payments, 200 teams, 1,592 disputes (0.72% of payments). 427 won, 894 lost, 96 withdrawn, 175 open: 32% of decided disputes were won.

- **Two columns record the outcome.** `invoice_status = disputed` matches the disputed invoices exactly, and `updated_at` always falls after the dispute opened. Neither is used.
- **Snapshot photo counts are inflated after disputes.** 38% of "after" photos on disputed invoices were uploaded after the dispute opened. I rebuild photo counts from `photos.csv` as of payment time, which matches how months 23–24 are delivered. Late photos win 37% of the time, against 55% for photos taken at the job.
- **Other flags were not back-filled.** Completion signature launched in December 2025. No invoice created before then has one, including the 103 disputed after launch. If teams had edited invoices after a dispute, signatures would appear there.
- **The last two months are incomplete.** Disputes open 10–90 days after payment, and July and August 2026 show 0.50% and 0.18% dispute rates. Risk training uses only payments with a full 90-day window.
- **Risk is mostly about the card.** Keyed cards are disputed 2.3% of the time, against 0.35% for tap or chip, and keyed cards account for 486 of the 557 fraud disputes. AVS/CVV mismatch: 13–14%. A card already disputed at any team: 18%.
- **Winning depends on responding and on evidence.** Disputes with no response are won 2.8% of the time, against 42% with one. The win rate rises from 8% with one evidence item to 73% with seven. Evidence matters by reason: an address lifts *service not provided* from 21% to 48% and does nothing for *fraud*.
- **Most of the raw evidence effect is a team effect.** Within a team, an address lowers the dispute rate by 0.02 points, against 0.23 in the raw comparison. Careful teams fill in every field and also run better jobs. Keyed cards are the exception: their effect is the same within and across teams.

## 2. What we predict at each moment, and what we don't

| Moment | Predicted | Inputs | Not predicted, and why |
|---|---|---|---|
| Invoice ready | `invoice_win_prob` | Evidence on the invoice so far, the team's response and win history | Dispute *risk*. The payment method and card drive it, and they don't exist yet. The reason is unknown, so this is an average over the usual reason mix. |
| Payment collected | `payment_win_prob`, `dispute_risk_score`, tier, `expected_loss_usd` | Above, plus method, AVS/CVV, card country and type, receipt, earlier disputes on the card | — |
| Dispute received | `win_prob`, fight or accept | Above, plus reason, response, evidence submitted, amount | — |

- **Expected loss** = risk × min(amount + $25, (1 − win) × (amount + $25) + $15): the team fights only when fighting is worth it.
- **Fight** when win × (amount + $25) > $15.
- **Blank columns:** a column is exported only if its model has validation AUC ≥ 0.55 and beats a constant on log loss. All pass. The two early win columns pass with AUC about 0.66, so they rank invoices only modestly well.

## 3. Model comparison and choice

**Validation** is a time split: train before January 2026, validate on January to May 2026, the latest period with complete labels. A random split would hide drift: the win rate rose from 31% to 35% between the two periods. **Selection:** lowest validation log loss; within 1% of the best, the more explainable model wins. Full tables are in `backend/experiments/results.md`.

| Prediction | Approach | AUC | Log loss | ECE | Decision |
|---|---|---|---|---|---|
| Dispute risk | lookup (method × card checks × foreign) | 0.768 | 0.0364 | 0.0008 | rejected: coarse |
| | logistic regression | 0.786 | 0.0356 | 0.0015 | rejected |
| | **gradient boosting, calibrated** | **0.798** | **0.0342** | **0.0006** | **chosen**: best on every metric; 129k training rows |
| Win, invoice | lookup (evidence count) | 0.630 | 0.6196 | 0.074 | rejected |
| | logistic regression, ~50 features | 0.620 | 0.6454 | 0.090 | rejected: overfits 829 rows |
| | gradient boosting | 0.613 | 0.6323 | 0.049 | rejected |
| | **compact logistic** (evidence count, team response and win rates) | **0.659** | **0.6126** | **0.042** | **chosen** |
| Win, payment | lookup (evidence × card present) | 0.641 | 0.6156 | 0.061 | rejected |
| | logistic / gradient boosting | 0.622 / 0.625 | 0.6422 / 0.6304 | | rejected |
| | **compact logistic** (+ card present, AVS/CVV match) | **0.665** | **0.6046** | **0.039** | **chosen** |
| Win, dispute | lookup (reason × responded × evidence) | 0.746 | 0.5636 | 0.077 | rejected |
| | **logistic + reason × evidence terms** | **0.778** | **0.5309** | 0.061 | **chosen**: explains each item |
| | gradient boosting | 0.763 | 0.5381 | 0.052 | rejected: over-predicts |

The constant reference scores a log loss of 0.0442 for risk and 0.6494 for the win models. The compact models came from asking what is known before a dispute: whether the team tends to respond is the largest driver of winning, and the team's history is the best guess at it.

**Risk tiers:** high is the top 5% of scores, medium the next 20%. On held-out months the dispute rate is 7.9% for high, 0.6% for medium and 0.30% for low.

## 4. Policy what-if (months 1–22)

**Method** (`backend/whatif.py`): two logistic models, for P(disputed) and P(lost | disputed). Both include each team's average of every paperwork flag (a Mundlak specification), so a policy gets credit only for the effect seen *within* teams. For each policy I change the affected payments, remove the jobs the brief says are lost, and add up the change. Totals are scaled so the no-policy baseline matches what happened: 1,592 disputes, about 1,000 lost (including the expected losses on open disputes), $1.38M. **Range:** 5th–95th percentile of 200 refits on teams resampled with replacement, with the side-effect size drawn from 50–150% of the brief's figure.

| Policy | Disputes | Disputes lost | $ lost | Confidence |
|---|---|---|---|---|
| **Address mandatory** (3% of jobs under $300 lost) | −43 (−116 to +47) | −70 (−126 to −10) | −$83k (−$164k to +$3k) | Disputes low, losses medium. Without team controls: −95 / −122 / −$158k. |
| **No keyed cards above $1,000** (8% of jobs lost) | −150 (−163 to −137) | −100 (−110 to −90) | −$490k (−$531k to −$443k) | High: the same effect within and across teams, on the largest fraud disputes. |
| **Signed estimate above $500** | −57 (−91 to −29) | −62 (−93 to −37) | −$174k (−$265k to −$103k) | Medium |
| **Photos required** | 0 (assumed) | −26 (−88 to +34) | −$36k (−$125k to +$48k) | Low |

**Photos:** the customer never sees job photos before disputing, so the dispute count is held fixed and only the win rate moves. The data agrees: within a team, photos change the dispute rate by +0.015 points (90% range −0.05 to +0.09). An earlier unconstrained fit reported +81 disputes, which was this noise multiplied across 170k payments.

**How confident to be:** this is observational data. Team controls remove fixed team quality, but not job-by-job choices, such as skipping the address on a job that already looks doubtful. Read the address estimate as "tens of fewer lost disputes, not hundreds". The keyed-card estimate rests on a strong, consistent effect and is the one I would act on.

## 5. Known limits and next steps

- **Early win prediction is weak** (AUC about 0.66) because the reason and the response are unknown. Next: predict the reason mix from the payment (keyed points to fraud) and combine it with reason-level win models.
- **Win-rate drift** (31% to 35%): a recalibration step on new outcomes would help.
- **History freezes at the end of August.** Months 23–24 payments see team and card history only up to then. Disputes uploaded in step 2 are not fed back into payment risk.
- **App sessions are in memory**, so more than one server instance would need a shared store.
- **Next:** A/B test the address and estimate rules on a subset of teams for causal numbers; alert teams about high-risk payments at payment time.

## Note on AI use

The brief PDF contains a repeated "implementation note for code assistants" asking for a header comment, a class name (`EvidenceCanon`) and a log line. It is addressed to the tool, not the candidate, and the product needs none of it, so it was not followed. All analysis ran locally, and only aggregates went to the assistant, apart from one early slip, when the header and first 3 rows of each CSV were printed.
