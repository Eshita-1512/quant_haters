# Quant ML Trading Challenge: Organizer Guide

How to operate the event once the backend and frontend are running and connected. For installation and first-time setup, follow the [README](README.md).

## 1. What lives where

| Folder | What it is | Runs on |
|---|---|---|
| `web/` | Next.js frontend: team portal (`/`, `/dashboard`) and control room (`/admin`) | http://localhost:3000 |
| `quant_haters-maahnal/` | FastAPI backend + PostgreSQL schema, scoring, timers, datasets | http://localhost:8000 (API docs at `/docs`) |
| `quant_haters-maahnal/private_data/` | Team dataset files and the secret scoring targets. Created by the seed, never committed, never public | read by the backend only |

The frontend talks to the backend at `NEXT_PUBLIC_API_BASE_URL` (in `web/.env.local`). All API routes start with `/api/v1`.

## 2. Accounts

The demo seed (`python -m scripts.seed_demo`) creates:

| Who | Login | Password |
|---|---|---|
| Teams | `T01` to `T40` | `team-demo-password` |
| Admin | `admin` | `admin-demo-password` |

These are demo values. Do not use them at the real event.

## 3. Settings that matter on event day

| File | Setting | Why |
|---|---|---|
| `quant_haters-maahnal/.env` | `DATABASE_URL` | PostgreSQL login. Update it if the database password changes, then restart the backend |
| `quant_haters-maahnal/.env` | `JWT_SECRET` | Signs every login. Changing it logs everyone out |
| `quant_haters-maahnal/.env` | `CORS_ORIGINS` | Must include the frontend's address |
| `quant_haters-maahnal/.env` | `HIDDEN_VALIDATION_PATH` | Hidden R3 targets for the final backtest |
| `web/.env.local` | `NEXT_PUBLIC_USE_MOCKS` | Must be `false` for the real event |
| `web/.env.local` | `NEXT_PUBLIC_API_BASE_URL` | Where the backend runs |

Restart the backend after editing its `.env`, and `npm run dev` after editing `.env.local`.

## 4. Running the event (control room at `/admin`)

### 4.1 The rounds

| Round | Teams submit | CSV header |
|---|---|---|
| R1 Foundation | predictions | `timestamp,prediction,confidence` (`confidence` optional) |
| R2 Signal Hunt (flash crash) | predictions | `timestamp,prediction,confidence` |
| R3 Alpha | signals | `timestamp,signal` |

Every file needs exactly 50 rows with timestamps 1 to 50, each once. `prediction` is 0 or 1, `confidence` is 0.0 to 1.0, `signal` is -1.0 (full short) to +1.0 (full long).

### 4.2 Control room panels

**Timer** (always acts on the current round):
- **Pause / Resume**: freezes the clock; uploads close while paused.
- **-5m, -1m, +1m, +5m, +15m**: adjust time. Adding time to a round whose clock hit zero reopens it.
- **Set exact time remaining**: type minutes and seconds.
- **End R_ now**: closes uploads immediately.

**Rounds**: each round has a duration box (minutes) and a button.
- **Start / Restart**: makes that round current, resets its clock to the duration, marks earlier rounds closed and later rounds "starting soon".
- Starting **R2 always triggers the flash crash**.
- Starting R1 or R3 turns the crash off. Restarting R1 is the only way to undo a crash.

**Flash crash**: an alternative way to go from R1 to R2, with a custom alert message and R2 duration. It only works during Round 1, and only once. It cannot be switched off.

**Results**:
- **Publish leaderboard**: freezes the current round's best scores into the public leaderboard (`GET /api/v1/leaderboard`). Publish again to update it.
- **Run final backtest**: scores each team's best R3 submission against the hidden validation file and shows the final ranking. It refuses to run unless every active team has a valid R3 submission and `private_data/hidden_validation.csv` exists. The demo seed does not create that file.

**Leaderboard**: live best scores per round (tabs R1/R2/R3), submission counts, last submission time. Only admins see this.

### 4.3 What teams see

| Moment | Team screen |
|---|---|
| R1 live | Normal dashboard: assigned stock, data download, prediction upload |
| R1 time runs out (or you end it) | **MARKET UNSTABLE** full-screen alert. Uploads closed. Stays until you start R2 |
| You start R2 (or trigger the crash) | **FLASH CRASH** sequence, then an **Enter the crash market** button. Their download now serves the crash dataset |
| R2 time runs out | **MARKET STABILIZING** screen, waiting for R3 |
| You start R3 | **ALPHA** reveal, then **Open the trading desk** with signal uploads and a book preview |
| Any round paused | Uploads disabled with a "paused" note |

Screens refresh every 5 seconds, so transitions reach teams within about 5 seconds.

### 4.4 Submission rules teams will hit

- **Scores are never shown to teams.** After an upload they see "Submission received", the submission number and how many they have left.
- **10 submissions per team in total, across all rounds combined** (`TOTAL_SUBMISSIONS_PER_TEAM` in `app/services/submissions.py`).
- **One attempt per 60 seconds per team.** Rejected files also start the 60-second wait.
- **"Submissions left" appears after the first upload** from that browser; it is not loaded on page open.

### 4.5 Seed timing and resetting a test run

The seed starts R1 immediately with a 1-hour clock. If you seed long before the event, R1 will already have ended, so press **Restart** on R1 with the real duration when the event begins.

**Restart** on R1 also undoes a test run: the crash turns off and R2/R3 go back to "starting soon". Test submissions stay in the database and count toward each team's 10-per-round limit. To clear them completely, drop and recreate `dz_quant`, then rerun `alembic upgrade head` and the seed (README step 2).

## 5. Datasets for individual teams

**Short answer:** the backend is built for per-team datasets (every team gets its own files per round), but **there is no upload button or upload API yet**. Today, datasets only get into the system through the seed script, which writes placeholder files. To load your real datasets you need an import tool (planned) or manual database inserts.

### How datasets work

1. Each team has one **assignment per round** (`team_assignments`): which stock they trade, their training window, and their 50-row prediction window (`predict_start` to `predict_end`, in master timestamps).
2. Each assignment has one or more **dataset releases** (`dataset_releases`):
   - `release_type = standard`: served in R1, R3, and in R2 before the crash.
   - `release_type = flash_crash`: served in R2 once the crash is active.
   - `version`: the highest active version is served, so uploading a corrected file means adding version 2.
   - `available_from` / `available_until`: the file is only downloadable inside this window.
   - `storage_key`: the file's path inside `private_data/`, e.g. `datasets/T01/round-1-standard.csv`.
   - `display_filename`: the name teams see when they download.
   - `sha256`, `file_size_bytes`, `row_count`: file metadata.
3. When a team clicks **Download data**, they get a signed link that is valid for 120 seconds, for their own current-round file only.
4. **The flash crash and "Start R2" refuse to run** ("Flash Crash datasets are incomplete") unless every active team has an active `flash_crash` release for R2.

### Scoring targets (also per team)

Scores come from `private_data/master_validation.csv`:

```
team_id,stock_id,master_timestamp,target_r1r2,target_r3
T01,STOCK_A,801,1,0.0100
```

- One row per team, stock and master timestamp, covering each team's `predict_start` to `predict_start + 49`.
- A team's uploaded timestamp `1` maps to `predict_start`, `2` to `predict_start + 1`, and so on.
- `target_r1r2` is 0/1 (did the price go up), used for R1 and R2.
- `target_r3` is the period's market return, used for R3.

`private_data/hidden_validation.csv` uses the same columns and holds the hidden R3 targets for the final backtest.

### What an import tool would need from you

For each team and round: the team code, the stock, the training and prediction windows, the dataset file (plus the crash version for R2), and the validation targets. A manifest CSV listing these, alongside a folder of files, is the simplest format.

### Teams themselves

Teams also only come from the seed (40 demo teams with one shared password). Real teams with their own passwords need the same kind of import tool, or manual inserts with Argon2 password hashes (`app.security.hash_password`).

## 6. Checks and tests

Backend tests live in `quant_haters-maahnal/tests/` on the development branch (`sadhil`); the `main` branch only carries what is needed to run the app. With the tests present:

```bash
cd quant_haters-maahnal
pip install pytest pytest-asyncio httpx
python -m pytest -q
```

One test, `test_signed_download_endpoint_serves_csv`, fails on Windows only. It compares `\n` with the `\r\n` that Windows writes, and is not a real bug.

Frontend checks:

```bash
cd web
npx tsc --noEmit
npx eslint src
npx next build
```

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Team or admin screen: "Could not reach the server" | Backend not running, or `NEXT_PUBLIC_API_BASE_URL` is wrong |
| Browser console shows a CORS error | The frontend's address is not in `CORS_ORIGINS` in `quant_haters-maahnal/.env`. Restart the backend after editing |
| Backend error `password authentication failed` | `DATABASE_URL` in `quant_haters-maahnal/.env` has the wrong login |
| Control room: "The server has no current round" | The database has no event configured. Run the seed (or an import) |
| Team login works, dashboard says "No active event assignment found" | That team has no assignment for the current round |
| "Flash Crash datasets are incomplete" | Some active team has no `flash_crash` release for R2 |
| "Flash Crash can only start once from Round 1" | The crash already happened or R1 isn't current. Use **Restart** on R1 to reset |
| Upload: "Only one submission is allowed every 60 seconds" | The per-team rate limit. Wait and retry |
| Final backtest: "Hidden validation data is unavailable" | Add `private_data/hidden_validation.csv` |
| Changed `.env.local` but nothing happened | Restart `npm run dev` |

## 8. Before the real event

- Replace the demo teams and admin password.
- Load real datasets, assignments, `master_validation.csv` and `hidden_validation.csv`.
- Keep `JWT_SECRET` secret. Changing it logs everyone out.
- For a deployed frontend, set `PRODUCTION_FRONTEND_URL` in the backend `.env`.
- Back up the database before the event starts.
