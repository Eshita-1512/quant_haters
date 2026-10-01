# Quant ML Trading Challenge: Master Technical & Flow Architecture

**Status:** Master Document for the Organizing Council
**Goal:** This document explains the exact chronological flow of the 5-hour event and the underlying technical architecture required to run it securely and fairly.

---

## Part 1: The Event Flow (Participant Perspective)

The competition is a 5-hour data science sprint divided into three progressively harder rounds, separated by a sudden market shock.

### 🕒 Event Schedule
1. **Kickoff (10-15 mins):** Participants log into the portal. They are randomly assigned one of the 5-6 synthetic stocks and are given their specific "prediction window" (the timestamps they must predict).
2. **Round 1 - Foundation (~1 hr 15 mins):**
    *   **Goal:** Build a standard Machine Learning model on normal, calm market data.
    *   **Action:** They clean data, engineer features, and train a model to predict whether the price goes UP (1) or DOWN (0).
    *   **Scoring:** They upload a CSV. We grade it using **Balanced Accuracy** and **MCC (Matthews Correlation Coefficient)**.
3. **⚡ THE FLASH CRASH (~10 mins):**
    *   **Action:** The Admin (You) clicks a button on the backend. This instantly unlocks new "Crash Data" for all teams.
    *   **Effect:** The market they were studying just crashed. Volatility spikes, prices plummet. Their Round 1 models are now broken.
4. **Round 2 - Signal Hunt (~1 hr 45 mins):**
    *   **Goal:** Adapt the model to survive the chaos.
    *   **Action:** Teams scramble to retrain their models, add volatility filters, or shorten their lookback windows. They predict the future of the chaotic market.
    *   **Scoring:** Same metrics as Round 1, but this tests **robustness and adaptation**.
5. **Round 3 - Alpha (~1 hr):**
    *   **Goal:** Convert predictions into a profitable trading strategy.
    *   **Action:** Instead of predicting UP or DOWN, they output *Position Sizes* between `-1.0` (Short) and `+1.0` (Long).
    *   **Scoring:** We run their positions through a financial backtester. We penalize them for trading too much (Transaction Costs). We score them using the **Sharpe Ratio** (Risk-adjusted return) and **Maximum Drawdown**.

---

## Part 2: The Technical Architecture

To prevent cheating and overfitting, we do *not* give everyone the exact same dataset. We use a **Rolling Window Architecture**.

### 1. Data Generation (Pre-Event)
*   **The Stocks:** We generate 5-6 completely independent synthetic stock datasets using Geometric Brownian Motion (GBM).
*   **The Flash Crash:** Halfway through the time-series of each stock, we mathematically inject a sudden regime shift (prices drop, volatility shoots up).
*   **The Targets:** We calculate the true targets (Did it go up or down? What was the return?) and hide them in a highly secure `master_validation.csv` on our server.

### 2. Team Assignments (Anti-Cheating)
If 40 teams all predicted the same timestamps, they could just copy each other's code. 
Instead, we assign multiple teams to the same stock, but shift their timelines:
*   **Team 1:** Trains on Days 1-800 $\rightarrow$ Predicts Days 801-850.
*   **Team 2:** Trains on Days 101-900 $\rightarrow$ Predicts Days 901-950.
*   **Team 3:** Trains on Days 201-1000 $\rightarrow$ Predicts Days 1001-1050.

*Because the data is different for every single team, copy-pasting AI code will yield completely different outputs, eliminating cheating.*

### 3. The Universal Scoring Engine
Instead of having 40 different scoring scripts, we build **one universal evaluator**. 

**The Automated Backend Flow:**
1. Team 2 uploads `predictions.csv` via the React frontend.
2. The FastAPI backend catches the file and looks up Team 2's assignment.
3. The API strictly validates the CSV (Are there missing rows? Did they predict the right window: 901-950?).
4. If valid, it pulls the secret answers for Days 901-950 from the `master_validation.csv`.
5. It passes the predictions and the secret answers to the Python Scoring Script.
6. The Python script returns the final score (e.g., Sharpe Ratio: 1.45).
7. The Database saves the score and updates the Live Leaderboard.

---

## Part 3: Visual System Architecture

```text
                      [PRE-EVENT DATA PIPELINE]
 ┌────────────────────────┐         ┌────────────────────────┐
 │ 1. GBM Data Generator  │ ──────> │ 2. Team Window Splitter│
 │ (Creates 5-6 Stocks +  │         │ (Slices data into 40   │
 │  Injects Flash Crash)  │         │  different timelines)  │
 └────────────────────────┘         └──────────┬─────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
 ┌──────────────────────────┐                                    ┌───────────────────────────┐
 │ PUBLIC TEAM DATA (CSVs)  │                                    │ SECRET MASTER VALIDATION  │
 │ (No future targets. Kept │                                    │ (Contains all the answers.│
 │  on a public bucket)     │                                    │  Locked on backend only)  │
 └─────────────┬────────────┘                                    └─────────────┬─────────────┘
               │                                                               │
               │      [LIVE EVENT SYSTEM]                                      │
               ▼                                                               ▼
 ┌──────────────────────────┐                                    ┌───────────────────────────┐
 │ FRONTEND WEBSITE         │                                    │ BACKEND API & DATABASE    │
 │ (React / Next.js)        │ ──(CSV Upload)───────────────────> │ (FastAPI / Firebase)      │
 │ • Team Dashboard         │                                    │ • Authenticates Team      │
 │ • Countdown Timer        │ <──(Returns Score)──────────────── │ • Validates CSV Schema    │
 │ • Live Leaderboard       │                                    └─────────────┬─────────────┘
 └──────────────────────────┘                                                  │
                                                                               ▼
                                                                 ┌───────────────────────────┐
                                                                 │ PYTHON SCORING ENGINE     │
           [ADMIN] ──────(Click "Release Flash Crash")───────>   │ • R1/R2: Accuracy, MCC    │
                                                                 │ • R3: Sharpe, Drawdown,   │
                                                                 │   Transaction Costs       │
                                                                 └───────────────────────────┘
```

---

## Part 4: Critical Security & Integrity Rules

As the organizing technical team, these are the golden rules you must never break:

1. **Chronological Evaluation Only:** You can never shuffle time-series data. Training data must always be in the past, and the prediction window must always be in the future.
2. **Zero Lookahead Bias:** The `master_validation.csv` must NEVER be exposed to the frontend browser or placed in a public storage bucket. It lives deep inside the backend server.
3. **Secret Final Evaluation (Optional but Recommended):** To stop teams from uploading 50 times an hour just to "guess" their way up the leaderboard, we only show them their score on a *fraction* of the hidden window. Their final, true score is run on a totally secret window after the competition ends.
4. **Schema Validation:** The backend API must reject malformed CSVs instantly without crashing the scoring server. If a team submits text instead of numbers, the API should return a clean error ("Row 43 contains invalid characters"), rather than a server 500 crash.
