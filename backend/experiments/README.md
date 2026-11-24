# Experiments

Everything here is written by `python train.py`. Re-run it to reproduce the numbers.

| File | What it contains |
|---|---|
| `results.md` | Model comparison per prediction: 3 approaches (lookup table, logistic regression, gradient boosting) plus a constant reference, each with validation AUC, average precision, log loss, Brier, ECE and predicted/actual. The chosen approach is marked; rejected ones are kept. |
| `results.json` | The same, as data. |
| `whatif.json` | Policy estimates with bootstrap ranges, confidence, and the naive estimate without team controls. |
| `train_log.txt` | Log of the last full run. |

The approach code lives in `backend/models.py` (`candidates()`), so rejected approaches stay runnable.

**Validation scheme:** a time split. Models train on data before January 2026 and are validated on January to May 2026, the latest period whose labels are complete:
- **Dispute risk:** payments with their full 90-day dispute window.
- **Win models:** disputes opened in that period and closed as won or lost.

A time split shows the drift the real test meets on months 23–24; a random split would hide it. For example, the win rate rose from 31% to 35% between the two periods.

**Selection rule:** lowest validation log loss. When two approaches are within 1% of each other, the more explainable one wins. A column is exported blank if its model's AUC is under 0.55 or its log loss is no better than predicting a constant.
