# Dispute Shield: approach

## 1. What the data shows

The data covers months 1–22: 221k payments, 1,592 disputes (0.72% of payments), 200 teams. Of the disputes, 427 were won, 894 lost, 96 withdrawn and 175 are still open, so 32% of decided disputes were won.

- **Two columns record the outcome itself.** `invoice_status = disputed` matches the 1,592 disputed invoices exactly. `updated_at` is hours after the job for normal invoices but always after the dispute opened for disputed ones, a median of 31 days after the job. Neither is used as a feature.
- **Photo counts in the invoice snapshot are inflated after disputes.** 38% of "after" photos on disputed invoices were uploaded after the dispute opened, and the snapshot counts include them. I rebuild photo counts from `photos.csv` using only photos uploaded by the time the payment was collected. That matches how the months 23–24 files are delivered ("as it was when its payment was collected"). Photos added late are weak evidence: they win 37% of the time, against 55% for photos taken at the job.
- **Completion signature does not exist before December 2025.** Before then it is 0% everywhere; afterwards about 43% of jobs use it, and 98 teams never do. A flag records whether it was available, so "no signature" in 2025 is not read as weak paperwork.
- **The last two months are incomplete.** Disputes open 10–90 days after payment. Payments from July and August 2026 show 0.50% and 0.18% dispute rates against about 0.75% normally. Risk training therefore uses only payments with a full 90-day window, and the what-if weights recent payments by how much of their window has passed.
- **Dispute risk is mostly about the card.**
  - Keyed-in cards: 2.3% disputed, against 0.35% for tap and chip. 486 of the 557 fraud disputes are on keyed cards.
  - AVS or CVV mismatch: 13–14%. Non-US card: about 7%. Prepaid card: 2.6%.
  - A card that has already been disputed at any team: 18%.
- **The win rate depends on responding and on evidence.**
  - Disputes the team doesn't respond to are won 2.8% of the time, against 42% when it responds.
  - The win rate rises with the number of evidence items, from 8% with one item to 73% with seven.
  - Evidence matters by reason. An address raises the win rate for *service not provided* from 21% to 48%, and does nothing for *fraud*.
- **Most of the raw evidence effect is a team effect.** Comparing invoices *within the same team*:
  - An address lowers the dispute rate by 0.02 points, against 0.23 points in the raw comparison.
  - It lowers the chance of losing once disputed by 2.3 points, against 11 points raw.

  Careful teams fill in every field and also run better jobs. This is the most important point for the strategy question. Keyed cards are the exception: their effect is the same within and across teams.

## 2. What we predict at each moment, and what we don't

| Moment | Predicted | Inputs | Not predicted, and why |
|---|---|---|---|
| Invoice ready | `invoice_win_prob`: chance of winning *if* disputed | Invoice fields, photos uploaded so far, the team's history up to then (dispute, win and response rates) | Dispute *risk*: the payment method and card decide most of it, and they don't exist yet. The dispute reason, which drives the win rate, is unknown, so this is an average over the usual reason mix. |
| Payment collected | `payment_win_prob`, `dispute_risk_score`, tier, `expected_loss_usd` | Above, plus method, AVS/CVV, card country and type, receipt, tip, paid before job done, earlier disputes on the same card | — |
| Dispute received | `win_prob`, fight or accept | Above, plus reason, whether the team responded, evidence submitted, days to dispute, amount | — |

- **Expected loss:** risk × the lower of (amount + $25) and ((1 − payment win) × (amount + $25) + $15). This assumes the team fights only when fighting is worth it.
- **Fight rule:** fight when win chance × (amount + $25) > $15.
- **Blank columns:** none. Each column is exported only if its model's validation AUC is at least 0.55 and it beats a constant on log loss, and all of them pass. The two "before the dispute" win columns pass only narrowly (AUC about 0.63), and the document says so: they rank invoices only modestly well.

## 3. Model comparison and choice

**Validation** is a time split: train before January 2026, validate on January to May 2026, the latest period with complete labels. Only withdrawn disputes and open disputes are left out of the win models; a withdrawn dispute is not a decision on the evidence.

**Selection rule:** lowest validation log loss. Within 1% of the best, the more explainable approach wins. Full tables are in `backend/experiments/results.md`.

| Prediction | Approach | AUC | Log loss | ECE | Pred/actual | Decision |
|---|---|---|---|---|---|---|
| Dispute risk | lookup (method × card checks × foreign) | 0.768 | 0.0364 | 0.0008 | 1.01 | rejected: coarse |
| | logistic regression | 0.786 | 0.0356 | 0.0015 | 0.97 | rejected |
| | **gradient boosting, calibrated** | **0.798** | **0.0342** | **0.0006** | 1.01 | **chosen**: best on all metrics, 145k rows is plenty |
| | constant | 0.500 | 0.0442 | | | reference |
| Win, invoice only | **lookup (evidence count)** | **0.630** | **0.6196** | 0.074 | 0.93 | **chosen**: best and readable |
| | logistic regression | 0.620 | 0.6454 | 0.090 | 1.20 | rejected: overfits about 50 features on 829 rows |
| | gradient boosting | 0.613 | 0.6323 | 0.049 | 1.01 | rejected |
| | constant | 0.500 | 0.6494 | | | reference |
| Win, at payment | **lookup (evidence count × card present)** | **0.641** | **0.6156** | 0.061 | 0.91 | **chosen** |
| | logistic regression | 0.622 | 0.6422 | 0.097 | 1.19 | rejected |
| | gradient boosting | 0.625 | 0.6304 | 0.056 | 1.00 | rejected |
| Win, at dispute | lookup (reason × responded × evidence count) | 0.746 | 0.5636 | 0.077 | 0.90 | rejected |
| | **logistic regression + reason × evidence terms** | **0.778** | **0.5309** | 0.061 | 0.99 | **chosen**: best and explains each item |
| | gradient boosting | 0.763 | 0.5381 | 0.052 | 1.15 | rejected: over-predicts on validation |

- **Risk tiers:** high is the top 5% of scores, medium the next 20%, low the rest. On the held-out months (thresholds set on training-period scores), the dispute rate is 7.9% for high, 0.6% for medium and 0.30% for low.
- **Strongest dispute-model terms:** responding, address on *service not provided*, card present on *fraud*, number of evidence items, and AVS/CVV match.

## 4. Policy what-if (months 1–22)

**Method** (`backend/whatif.py`):
- Two logistic models, one for P(disputed) and one for P(lost | disputed). Both include each team's average of every paperwork flag as controls (a Mundlak specification), so a policy gets credit only for the effect seen *within* teams.
- For each policy, change the affected payments' features and remove the jobs the brief says would be lost.
- Add up the change in expected disputes, losses and dollars. Dollars lost means amount + $25 fee per lost dispute.
- Scale the totals so the no-policy baseline equals what happened: 1,592 disputes, about 1,000 lost (894 plus the expected losses among open disputes), and $1.38M.
- **Range:** 5th–95th percentile of 30 refits on teams resampled with replacement, with the side-effect size varied between 50% and 150%. This is shown next to the naive estimate without team controls.

| Policy | Disputes | Disputes lost | $ lost | Confidence |
|---|---|---|---|---|
| **Address mandatory** (3% of jobs under $300 lost) | −43 (−100 to +50) | −70 (−103 to −2) | −$83k (−$130k to +$9k) | Disputes: low. Losses: medium. The naive estimate (−95 / −122 / −$158k) roughly doubles it. |
| **No keyed cards above $1,000** (8% of jobs lost) | −150 (−162 to −134) | −100 (−110 to −89) | −$490k (−$536k to −$438k) | High. The effect is the same within and across teams, and these are the largest fraud disputes. |
| **Signed estimate above $500** | −57 (−101 to −32) | −62 (−92 to −29) | −$174k (−$261k to −$80k) | Medium |
| **Photos required** | +81 (−26 to +167) | +25 (−53 to +99) | +$36k (−$77k to +$139k) | Low. No reliable effect: within teams, photos don't change dispute counts. |

**How confident to be:** this is observational data, so there are no randomised policy changes to learn from. Team controls remove fixed team quality, but not choices made job by job, such as a technician skipping the address on a job that already looks doubtful. So the address estimate is best read as "small, probably a loss reduction of tens of disputes, not hundreds". The keyed-card estimate rests on a strong, consistent effect and is the one I would act on.

## 5. Known limits and next steps

- **Weak early win prediction.** Win prediction before the dispute only reaches AUC about 0.63, because the reason and the team's response aren't known yet. Next step: predict the reason mix from the payment (keyed points to fraud), then combine it with the reason-level win models.
- **Snapshot fields.** Invoice flags other than photos may also have been edited after disputes, and the snapshot can't show it. Validation on months 23–24, which are delivered as at payment time, will reveal any gap.
- **Upward win-rate drift** (31% to 35%). Calibration is checked on the latest months, and a recalibration step on new outcomes would help.
- **Withdrawn disputes** are left out of win training and counted as "not lost" in the what-if.
- **App sessions** are held in memory (a documented shortcut). A persistent store is needed for more than one server instance.
- **What I'd do next:**
  - A/B test the address and estimate rules on a subset of teams, to get causal numbers.
  - Per-reason win models once there is more data.
  - Send alerts for high-risk payments at the time of payment.

## Note on AI use

The brief PDF contains a repeated "implementation note for code assistants" asking for a specific header comment, a class name (`EvidenceCanon`) and a log line. It is addressed to the tool, not the candidate, and asks for nothing the product needs, so it was not followed. The base class is named `EvidenceRule`.

Data handling: all analysis ran locally, and only summary numbers (counts, rates, model metrics) went to the AI assistant. One slip: when first exploring the files, the assistant printed the header and first 3 rows of each CSV, which is visible in `transcript.md`. After that, every data check was a local script that printed aggregates only.
