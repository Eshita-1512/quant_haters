# Context Handoff: Quant ML Trading Challenge (Frontend / Member 3)

Read this file first. It summarizes a previous planning conversation so you can continue without re-deriving everything. The other project docs are attached alongside this file and are the primary sources. This file tells you how they relate, where they conflict, and what has and has not been decided.

---

## 1. Who you are working with

- **User:** Sadhil, 3rd year B.Tech AI & Data Science student, part of a 5-person technical organizing team for a college event.
- **User's role in the team: Member 3, Frontend Developer.** Your main job is helping build the frontend and making sure it lines up with Member 4's backend.
- **Working style the user wants:**
  - Never assume or invent information. If something is undecided or conflicting, ask instead of picking silently.
  - Direct, technically precise answers. No fluff.
  - No inline comments in code.
  - No em dashes in any prose.
  - Prefers iterating in chat before committing things to files.

---

## 2. The event in one paragraph

A 5-hour team data science competition (about 40 teams of 3-4 people). Teams get a synthetic stock time series and must predict next-step direction (UP=1 / DOWN=0). Midway, an admin triggers a "Flash Crash" that releases new crash-regime data, breaking their models. They adapt in Round 2, then in Round 3 convert predictions into position sizes between -1 (short) and +1 (long), which are backtested with transaction costs and scored on Sharpe ratio and drawdown. A website handles login, dataset download, CSV upload, server-synced countdown, the flash crash alert, and a live leaderboard. The backend scores uploads against hidden answers that must never reach the browser.

**Flow:** Briefing → Round 1 (Foundation, ~75 min) → Flash Crash (~10 min) → Round 2 (Signal Hunt, ~105 min) → Round 3 (Alpha, ~60 min) → Lightning pitches (~15 min) → secret final evaluation.

---

## 3. Team roles

| Member | Role | Owns |
|---|---|---|
| Head | Lead Quant Architect / QA | `spec.md`, `private_data/`, final eval |
| M1 | Quant Data Engineer | `generator/` (synthetic data, crash, team window splits) |
| M2 | Scoring Engineer | `scoring/` (balanced accuracy, MCC, backtester, Sharpe, drawdown) |
| **M3** | **Frontend (the user)** | **`web/` (Next.js, Tailwind, TypeScript)** |
| M4 | Backend API & DB | `backend/` (FastAPI, DB, validation, auth, admin controls) |

---

## 4. Attached documents and how they relate

| File | What it is | Status |
|---|---|---|
| `Quant_ML_Trading_Challenge_FULL_Technical_Blueprint.md` | Long original design doc | Background, partially superseded |
| `project_architecture_and_flow.md` | Event flow + architecture overview | Background |
| `tech_team_study_plan.md` | Study goals per member | Background |
| `spec.md` | "Frozen" v1.0 technical spec | Claims to be source of truth, but has internal contradictions (section 7) |
| `member3_frontend_developer.md` | Frontend role doc + API contract M3 was told to mock | Conflicts with spec.md |
| `member4_backend_database_engineer.md` | Backend role doc + API contract | Mostly matches M3 doc, conflicts with spec.md |
| `quant_challenge_backend_database_schema.md` | PostgreSQL schema v2.0, "proposed" | Extends M3/M4 contract, conflicts with spec.md in places |

**Key point:** there are effectively three different API contracts (M3/M4 docs, schema doc, spec.md). No merged contract exists yet. Do not treat any one of them as final without checking with the user.

---

## 5. Work already done in the previous conversation

### 5.1 Loophole review of the original design

These were raised with the user. They are design problems, mostly outside frontend scope, but they affect what data and endpoints exist. None are confirmed as fixed.

1. **Prediction rows leak their own targets.** Target is `close(t+1) > close(t)`, and row t+1's close is in the same file, so labels are readable without ML. Suggested fixes: publish only predictive features (not the traded asset's price) in prediction rows, or release prediction rows in batches.
2. **Overlapping rolling windows leak answers across teams.** A02 trains on rows 101-900 with labels, which covers A01's prediction window (801-850). Public bucket storage makes it worse.
3. **Pure GBM has no learnable signal**, so R1/R2 leaderboards would be luck. A signal needs to be planted, and the crash should change it.
4. **A single crash point in a shared master series** means most teams see the crash in their Round 1 data.
5. **50-row prediction windows are too noisy.** A simulation showed that among 40 random guessers, the best gets about 0.65 balanced accuracy, and random positions give annualized Sharpe up to about 5.
6. Other issues:
   - Leaderboard probing through repeated submissions.
   - Sharpe is scale-invariant, so tiny positions win once drawdown is penalized.
   - All-zero positions make Sharpe divide by zero.
   - Constant short wins in a crash regime.
   - The flash crash score is undefined.
   - Firebase/FastAPI security holes (client-supplied team_id, open Firestore rules, crash file fetchable before release, unprotected admin).
   - The metric-to-points mapping is undefined.
   - The timing is tight (280 of 300 minutes are scheduled).

**Suggested structural fix given to user (not adopted yet):** generate 40 independent series (5 parameter profiles x 8 seeds) instead of slicing 5 long series 8 ways. This fixes problems 2, 4 and 5.

### 5.2 Example synthetic dataset

An example file `STOCK_A_synthetic_master.csv` was generated (2000 rows, one stock, organizer/master view). It is an example only and does not follow spec.md's exact column list.

- **Columns:** `timestamp, date, asset_id, open, high, low, close, volume, return_1d, sma_10, sma_30, momentum_5, volatility_20, rsi_14, volume_z_20, order_flow, regime, next_return, target`
- **Regimes:**
  - calm (0) until row 1200
  - crash (1) rows 1201-1260, about a 47% drawdown and roughly 3x volatility
  - recovery (2) until row 1450
  - calm after that
- **Target:** `target = 1 if close(t+1) > close(t)`. `next_return` is the size of that move.
- **Planted signal:** there is a weak signal via `order_flow` and `momentum_5`, and it flips to mean reversion during the crash. Logistic regression gets about 0.61 balanced accuracy on calm data and about 0.50 on crash data.
- **Organizer-only columns:** `regime`, `next_return` and `target` must be stripped before giving data to teams.

Generator used (reproducible, seed 2026):

```python
import numpy as np, pandas as pd
rng = np.random.default_rng(2026)
N, WARM = 2000, 40
T = N + WARM + 1
crash_start, crash_end, recov_end = WARM + 1200, WARM + 1260, WARM + 1450
of = np.zeros(T)
for t in range(1, T):
    of[t] = 0.6 * of[t-1] + rng.normal(0, 0.8)
r = np.zeros(T); regime = np.zeros(T, dtype=int)
for t in range(1, T):
    mom = r[max(0, t-5):t].sum()
    if t < crash_start:
        mu, sig, b_of, b_mom, g = 0.0004, 0.012, 0.0024, 0.10, 0
    elif t < crash_end:
        mu, sig, b_of, b_mom, g = -0.006, 0.036, 0.0005, -0.25, 1
    elif t < recov_end:
        mu, sig, b_of, b_mom, g = 0.0008, 0.022, 0.0012, -0.15, 2
    else:
        mu, sig, b_of, b_mom, g = 0.0004, 0.013, 0.0022, 0.08, 0
    shock = -0.11 if t == crash_start else 0
    r[t] = mu + b_of * of[t-1] + b_mom * mom / 5 + sig * rng.standard_t(5) / np.sqrt(5/3) + shock
    regime[t] = g
close = 250 * np.exp(np.cumsum(np.log1p(r)))
prev = np.r_[close[0], close[:-1]]
sigd = np.abs(r) + 0.004
open_ = prev * (1 + rng.normal(0, 0.3, T) * sigd)
high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.5, T)) * sigd)
low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.5, T)) * sigd)
volume = (1_200_000 * np.exp(0.25 * rng.normal(size=T)) * (1 + 25 * np.abs(r)) * (1 + 0.15 * np.abs(of))).astype(int)
df = pd.DataFrame(dict(open=open_, high=high, low=low, close=close, volume=volume, order_flow=of, regime=regime))
df["return_1d"] = df.close.pct_change()
df["sma_10"] = df.close.rolling(10).mean()
df["sma_30"] = df.close.rolling(30).mean()
df["momentum_5"] = df.close / df.close.shift(5) - 1
df["volatility_20"] = df.return_1d.rolling(20).std()
d = df.close.diff()
up = d.clip(lower=0).rolling(14).mean(); dn = (-d.clip(upper=0)).rolling(14).mean()
df["rsi_14"] = 100 - 100 / (1 + up / dn)
df["volume_z_20"] = (df.volume - df.volume.rolling(20).mean()) / df.volume.rolling(20).std()
df["next_return"] = df.close.shift(-1) / df.close - 1
df["target"] = (df.next_return > 0).astype(int)
df = df.iloc[WARM:WARM+N].reset_index(drop=True)
df.insert(0, "timestamp", np.arange(1, N+1))
df.insert(1, "date", pd.bdate_range("2018-01-01", periods=N).strftime("%Y-%m-%d"))
df.insert(2, "asset_id", "STOCK_A")
```

### 5.3 M3 / M4 / spec / schema mismatch review

This is the most relevant part for frontend work.

**Endpoints**

| What | M3 doc | M4 doc | Schema doc | spec.md |
|---|---|---|---|---|
| Base path | `/api` | `/api` | `/api` | `/api/v1` |
| Login | not listed | `POST /api/auth` | `POST /api/auth` → `{token}` (opaque, hashed, revocable) | `POST /auth/login` → JWT |
| Status/timer | `GET /api/status` | same | same, plus extended version | none for participants, only `GET /admin/status` |
| Team info | none | none | stock inside extended status | `GET /team/me` |
| Download | button, no endpoint | none | `GET /api/data/download` (signed URL, 120 s expiry) | `GET /team/data` |
| Upload | `POST /api/upload` | same | same | `POST /submit/round/{round_num}` |
| Leaderboard | `GET /api/leaderboard` | same | same (best score per team, current round) | same path, JWT required, shape unspecified |
| Flash trigger | none | `POST /admin/trigger-flash-crash` | admin transaction | `POST /admin/flash-crash` |

**Response shapes**

- **Upload success:**
  - M3 doc: `status, message, score`
  - M4 doc: `status, score`
  - spec: adds `team_id, round, balanced_accuracy, mcc, submission_number, submissions_remaining`
- **Upload error:** spec has `code: 400` in the body. HTTP status handling is not agreed.
- **Error messages:** spec defines 11 exact messages. The frontend should display `message` verbatim.
- **Extended status (schema):** `state_version, server_time, round_ends_at, round_phase, assigned_stock, download_available`. This is needed for a drift-free timer and one-time modal display.
- **Undefined fields:**
  - the allowed values of `current_round`
  - string `"R1"` vs int `1` for the round
  - `submission_type` is not exposed in status, but the frontend needs it for Round 3

**CSV format**

| Rule | M4 doc | Schema | spec.md |
|---|---|---|---|
| R1/R2 columns | exactly `timestamp,prediction` | exact columns, no confidence column in DB | `timestamp,prediction,confidence` (confidence optional, used in tiebreaks) |
| R3 column | `position` | `position` | `signal` |
| R3 range | strictly between -1 and 1 | DB check `> -1 AND < 1` | inclusive [-1, 1] |
| Rows | not stated | enforced, count undecided | exactly 50 |

- **The -1/+1 range conflict** could cause a DB constraint error (a 500) on valid-per-spec input.
- **Timestamp numbering contradicts itself inside spec.md.** Rows 801-850 are the prediction rows in the team file, the example shows 851 as a prediction row, and submissions must use 1-50.

**Data model**

- Schema `dataset_releases` is keyed by (round, stock), but spec uses per-team files. As written, all teams on a stock would download the same file.
- Schema `team_assignments` has no train/predict windows, but spec's does.
- DB choice is not agreed: M4 doc says Firebase/Firestore or PostgreSQL, and the schema is PostgreSQL.
- Team ID formats differ: `Team A`, `Team1`, `A01`. The leaderboard should show `team_name`, not codes that reveal stock grouping.

**Flash crash behaviour**

- **spec:** the trigger closes R1 and opens R2.
- **schema:** the trigger sets the current round phase to `flash_crash`, so R1 uploads would still be accepted.
- **Undefined:**
  - how R3 opens
  - how rounds are paused
  - when the flag turns off
  - who builds the admin UI (no admin page in the M3 doc)

**Scores**

- M3/M4 examples use a 0-100 scale. spec uses 0-1 for R1/R2, and R3 can be negative and unbounded.
- The final score min-max normalizes R3 across teams, so it can only be computed after the event.
- Best vs latest submission policy is undecided.
- Leaderboard auth is unclear: whether a projector view needs a public version.

**Frontend/backend gaps nobody covered**

- CORS and credentials. The frontend is on Vercel and the backend is hosted separately.
- How the token is sent (header vs cookie vs form field).
- Polling rate (about 160 users x 2 endpoints every 5 s, roughly 64 req/s) vs the schema's polling rate limits.
- The signed download URL must be fetched on click, not on page load.
- Client-side file size and extension checks (max size undecided).
- Pages Router (`src/pages/`, M3 doc) vs App Router (`app/`, blueprint).

**Problems inside spec.md**

- The master series is ~1400 rows, but A08 predicts rows 1501-1550.
- The crash at row 851 means most teams have crash data in Round 1.
- R3 says "0.0 has no transaction cost", which contradicts its own position-change rule.
- An all-zero signal gives std = 0, which breaks Sharpe.

---

## 6. Current status

- **Nothing above has been resolved.** The user has not yet chosen which contract wins, and has not decided on the loophole fixes.
- **Last open offer to the user:** draft one merged API contract (endpoints, request/response JSON, CSV rules, status enum) for the Head to approve as spec v1.1.
- If the user asks for frontend code before the contract is settled, build against a clearly isolated API layer (for example one `api.ts` module plus typed mocks) so endpoint paths and shapes can be swapped in one place. Tell the user which contract version you mocked.

---

## 7. Rules for you (the coding agent)

1. Do not silently pick between conflicting docs. Name the conflict and ask, or state clearly which version you used and why.
2. Never expose `master_validation.csv`, targets, or other teams' data to the browser. Team identity and stock always come from the server session, never from client input.
3. Timer logic must derive from server time (`server_time` + `round_ends_at`), not the device clock.
4. The flash crash modal should show once per `state_version` change, not on every poll.
5. The upload UI must show clear Loading / Success / Error states and display backend error messages verbatim.
6. No inline comments in code. No em dashes in prose.
