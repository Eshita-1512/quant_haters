# 📋 spec.md — Frozen Technical Specification
# Quant ML Trading Challenge
**Version:** 1.0 — FROZEN as of September 24, 2026
**Owner:** Head Lead Architect
**Status:** ✅ ALL MEMBERS MUST BUILD AGAINST THIS DOCUMENT. DO NOT DEVIATE.

---

## 0. Quick Reference Card

| Parameter | Value |
|---|---|
| Number of stocks | 5 (`STOCK_A` to `STOCK_E`) |
| Teams per stock | 8 |
| Total teams | 40 |
| Training window size | 800 rows |
| Prediction window size | 50 rows |
| Flash crash injection point | After row 850 of each master series |
| Master series total length | ~1400 rows per stock |
| Event duration | 5 hours |
| Max submissions per team per round | 10 |

---

## 1. Data Schema — Team CSV (Public, given to participants)

Every team receives ONE CSV file. It has the following columns, in this exact order:

```csv
timestamp,open,high,low,close,volume,returns,volatility_5,volatility_20,rsi_14,sma_10,sma_50,target
```

### Column Definitions

| Column | Type | Description |
|---|---|---|
| `timestamp` | `int` | Sequential integer index (1, 2, 3, …). NOT a real date. |
| `open` | `float` | Synthetic opening price |
| `high` | `float` | Synthetic high price |
| `low` | `float` | Synthetic low price |
| `close` | `float` | Synthetic closing price |
| `volume` | `float` | Synthetic trading volume |
| `returns` | `float` | Log return: ln(close_t / close_{t-1}) |
| `volatility_5` | `float` | Rolling 5-period std dev of returns |
| `volatility_20` | `float` | Rolling 20-period std dev of returns |
| `rsi_14` | `float` | 14-period Relative Strength Index (0-100) |
| `sma_10` | `float` | 10-period simple moving average of close |
| `sma_50` | `float` | 50-period simple moving average of close |
| `target` | `int or empty` | 1 if close_{t+1} > close_t, else 0. EMPTY for prediction rows. |

### Example Row (Training row — has target)
```
801,142.35,143.10,141.90,142.80,15234.5,-0.00123,0.0045,0.0038,54.2,141.1,138.9,1
```

### Example Row (Prediction row — target is blank)
```
851,145.20,146.00,144.80,145.50,17890.2,0.00189,0.0062,0.0041,61.3,143.2,139.4,
```

### Rules for M1 (Data Engineer)
- First 800 rows: training rows (target filled)
- Next 50 rows (801–850): prediction rows (target column is EMPTY)
- All float values rounded to 4 decimal places
- No NaN values in feature columns (forward-fill if needed)
- timestamp starts at 1 for every team file

---

## 2. Team Assignment Schema — team_assignments.csv

Stored in private_data/. NEVER shared with participants.

```csv
team_id,stock_id,train_start,train_end,predict_start,predict_end
A01,STOCK_A,1,800,801,850
A02,STOCK_A,101,900,901,950
A03,STOCK_A,201,1000,1001,1050
A04,STOCK_A,301,1100,1101,1150
A05,STOCK_A,401,1200,1201,1250
A06,STOCK_A,501,1300,1301,1350
A07,STOCK_A,601,1400,1401,1450
A08,STOCK_A,701,1500,1501,1550
B01,STOCK_B,1,800,801,850
...
```

> Each team's timestamp column in their CSV is LOCAL (restarts from 1), NOT the master index.

---

## 3. Master Validation Schema — master_validation.csv

Stored in private_data/. NEVER exposed to frontend or public network.

```csv
stock_id,master_timestamp,target_r1r2,target_r3
STOCK_A,801,1,0.00412
STOCK_A,802,0,-0.00231
STOCK_A,803,1,0.00588
...
```

| Column | Description |
|---|---|
| `stock_id` | Which synthetic stock |
| `master_timestamp` | The MASTER series index (not the team-local timestamp) |
| `target_r1r2` | Binary: 1 = price up, 0 = price down |
| `target_r3` | Continuous: actual log return for that period |

---

## 4. Submission Formats (What participants upload)

### Round 1 and Round 2 — Binary Classification

```csv
timestamp,prediction,confidence
1,1,0.82
2,0,0.63
3,1,0.55
...
50,0,0.71
```

| Column | Type | Constraint |
|---|---|---|
| `timestamp` | `int` | Must match their assigned prediction window (1-50, local index) |
| `prediction` | `int` | Must be exactly 0 or 1 |
| `confidence` | `float` | Must be between 0.0 and 1.0 inclusive |

> confidence is optional but rewarded in tiebreaking. If omitted, defaults to 0.5.

### Round 3 — Portfolio Positions

```csv
timestamp,signal
1,0.85
2,-0.40
3,0.00
...
50,0.72
```

| Column | Type | Constraint |
|---|---|---|
| `timestamp` | `int` | Must match assigned prediction window (1-50, local index) |
| `signal` | `float` | Must be between -1.0 (full short) and +1.0 (full long) |

> A signal of 0.0 means "flat / no position" (no transaction cost).

---

## 5. Scoring Formulas

### Round 1 and Round 2 Score

```
R1_score = (0.60 x Balanced_Accuracy) + (0.40 x Normalized_MCC)
```

Where:
- Balanced_Accuracy = (Recall_UP + Recall_DOWN) / 2
- MCC ranges from -1 to +1
- Normalized_MCC = (MCC + 1) / 2  → maps to [0, 1]
- Final score range: 0.0 to 1.0 (higher is better)

### Round 3 Score

```
R3_score = Sharpe_Ratio - (0.10 x Max_Drawdown_pct) - Transaction_Cost_penalty
```

Where:
- Sharpe_Ratio = mean(daily_returns) / std(daily_returns) x sqrt(252)
- Max_Drawdown_pct = expressed as a decimal (e.g., 0.15 for 15% drawdown)
- Transaction_Cost_penalty = 0.001 x number_of_position_changes
  - A position change = |signal_t - signal_{t-1}| > 0.05

> R3 scores can be negative. Rank by R3_score descending.

### Overall Final Score (for winner determination)

```
Final_Score = (0.25 x R1_score) + (0.35 x R2_score) + (0.40 x R3_score_normalized)
```

> R3 score normalized: scale all R3 scores to [0, 1] using min-max across all teams before combining.

---

## 6. Submission Validation Rules (Backend must enforce ALL of these)

The API must reject and return a clean error message for any of the following:

| # | Check | Error Message to Return |
|---|---|---|
| 1 | File is not a .csv | "Only .csv files are accepted." |
| 2 | Missing required columns | "Missing columns: {list}" |
| 3 | Wrong number of rows | "Expected 50 rows, got {n}." |
| 4 | Duplicate timestamps | "Duplicate timestamp found at row {n}." |
| 5 | Timestamps not 1–50 | "Timestamp {x} is outside your assigned window." |
| 6 | Prediction not 0 or 1 (R1/R2) | "Row {n}: prediction must be 0 or 1." |
| 7 | Signal outside [-1, 1] (R3) | "Row {n}: signal must be between -1.0 and 1.0." |
| 8 | Confidence outside [0, 1] | "Row {n}: confidence must be between 0.0 and 1.0." |
| 9 | Non-numeric values | "Row {n}: non-numeric value found." |
| 10 | Submission after round deadline | "Round {r} is closed." |
| 11 | Exceeds 10 submissions | "Submission limit (10) reached for this round." |

> CRITICAL: The API must NEVER crash with a 500 error due to bad input. Always return a 400 with a clean message.

---

## 7. API Contract (For M4 to build, M3 to consume)

### Base URL: https://[your-domain]/api/v1

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/login | None | Team login. Body: {team_id, password}. Returns JWT token. |
| GET | /team/me | JWT | Returns team info + assigned stock + windows |
| GET | /team/data | JWT | Returns download URL for team's CSV |
| POST | /submit/round/{round_num} | JWT | Upload predictions CSV. Returns score. |
| GET | /leaderboard | JWT | Returns sorted leaderboard for current round |
| POST | /admin/flash-crash | Admin JWT | Activates Round 2. Releases crash data. |
| GET | /admin/status | Admin JWT | Returns event state: round, timer, submissions count |

### Submit Response (success)
```json
{
  "status": "success",
  "team_id": "A01",
  "round": 1,
  "score": 0.7234,
  "balanced_accuracy": 0.68,
  "mcc": 0.41,
  "submission_number": 3,
  "submissions_remaining": 7
}
```

### Submit Response (validation error)
```json
{
  "status": "error",
  "code": 400,
  "message": "Expected 50 rows, got 48."
}
```

---

## 8. Flash Crash Architecture

- The crash data is PRE-GENERATED before the event (M1's job).
- The admin button ONLY changes a flag in the database. It does NOT run any simulation.
- When flash_crash_active = true:
  - Round 1 closes (no more R1 submissions)
  - Round 2 opens
  - Frontend shows flash crash banner
  - Team dashboard shows a "Download Crash Data" button

### Crash Data Files (per stock)
```
generator/output/
├── STOCK_A_team_A01_round1.csv     <- given at event start
├── STOCK_A_team_A01_round2.csv     <- released when flash crash triggers
├── STOCK_A_team_A01_round3.csv     <- same as round2 but context for positions
```

---

## 9. GBM Parameters (For M1 to use)

### Normal Regime
```python
mu    = 0.0002      # daily drift
sigma = 0.015       # daily volatility
S0    = 100.0       # starting price
```

### Flash Crash Regime (starts at master timestamp 851)
```python
mu    = -0.008      # strongly negative drift
sigma = 0.045       # 3x normal volatility
duration = 200      # rows of crash regime
```

### Recovery Regime (after crash, for Round 3)
```python
mu    = 0.0005      # slightly positive recovery
sigma = 0.025       # elevated but falling volatility
```

### Stock Betas (market sensitivity)
```python
STOCK_A: beta = 1.0    # market-neutral
STOCK_B: beta = 1.3    # high beta
STOCK_C: beta = 0.7    # defensive
STOCK_D: beta = 1.5    # aggressive
STOCK_E: beta = 0.4    # very defensive
```

---

## 10. Repository Structure (FINAL)

```
quant-challenge/
│
├── spec.md                          <- THIS FILE (frozen)
│
├── generator/                       <- Member 1
│   ├── generate_market.py
│   ├── window_splitter.py
│   └── output/
│
├── scoring/                         <- Member 2
│   ├── evaluator.py
│   └── backtester.py
│
├── backend/                         <- Member 4
│   ├── main.py
│   ├── database.py
│   ├── auth.py
│   └── requirements.txt
│
├── web/                             <- Member 3
│   ├── package.json
│   └── src/
│
└── private_data/                    <- Head Architect ONLY
    ├── master_validation.csv
    ├── team_assignments.csv
    └── final_eval.py
```

---

## Sign-off Checklist

- [x] Data schema frozen
- [x] Submission formats frozen
- [x] Scoring formulas frozen
- [x] API contract defined
- [x] Validation rules defined
- [x] GBM parameters set
- [x] Flash crash architecture defined
- [x] Repository structure defined

**This document is the single source of truth. Any changes require Head Architect approval and a version bump.**
