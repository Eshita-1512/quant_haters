# Look-ahead detection for Round 1 and Round 2

This file is the full context for how BigShort handles look-ahead cheating in the prediction rounds. Read it top to bottom before touching the datasets, the rules, or the checker.

---

## 1. The problem in one paragraph

Each team downloads one CSV per round. Training rows have full data and a `target`. The prediction rows are **consecutive days released all at once**. They still contain `open`, `high`, `low`, `volume`, `volume_z_20`, `order_flow`, `volatility_20` and `rsi_14`; `close`, `return_1d`, `sma_10`, `sma_30`, `momentum_5` and `target` are blank.

The target is `target[t] = 1 if close[t+1] > close[t] else 0`. Because each day opens almost exactly at the previous day's close, the **later rows' `open` values reveal the hidden closes**. Example: `open[t+2] > open[t+1]` is roughly `close[t+1] > close[t]`, which is the answer for row `t`. A strong AI (Opus, GPT) spots this in minutes and scores 80-100 without building any model.

We are **not changing the datasets**. `open` stays, because honest teams need it. Instead we use a **rule** plus an **automatic checker** plus **notebook review**.

---

## 2. The approach

1. **Rule (told to every team):** a prediction for row `t` may only use rows `1` to `t`. Using any value from a later row (`t+1`, `t+2`, ...) is look-ahead and leads to disqualification.
2. **Automatic checker:** after each round, a script compares every submission with the known look-ahead shortcuts. Teams whose predictions match a shortcut too closely are flagged.
3. **Human review:** flagged teams must walk the judges through their notebook in the presentation round. The judges check that features only use past rows (e.g. `shift(1)`, never `shift(-1)`; no rolling or centred windows that reach forward).
4. **Sanity check on scores:** the datasets are random-walk prices, so honest models land around 50-55% accuracy. Treat any public or private score near 80+ as suspicious even if it isn't flagged.

---

## 3. Rule text to give participants

Put this in the event brief, on the dashboard, and read it out at kickoff:

> **No look-ahead.** Your prediction for each row may only use data from that row and earlier rows. Using any value from a later row (for example the next day's open) is look-ahead and will be disqualified. Every submission is checked automatically, and flagged teams must explain their notebook to the judges.

Where to add it in the website (if you want it on screen):
- Landing page rules list: `web/src/pages/index.tsx`, the `RULES` array near the top.
- Dashboard upload panel format hint: `web/src/components/FormatHint.tsx` (notes come from `getCsvFormat` in `web/src/lib/config.ts`).

---

## 4. The checker

**Files:** the logic lives in `quant_haters-maahnal/app/services/lookahead.py` (`run_lookahead_check`, `summarize_by_team`, the penalty values and the warning texts). `quant_haters-maahnal/scripts/lookahead_check.py` is a thin command-line wrapper over it, and the admin Integrity panel uses the same service (section 8).

**Read-only.** The checker never writes to the database and never changes scores. Only the admin Integrity workflow stores results and deductions.

### 4.1 How to run it

On the EC2 server (Docker, from the repo root `~/quant_haters`):
```bash
docker compose exec api python -m scripts.lookahead_check --round 1
docker compose exec api python -m scripts.lookahead_check --round 2
docker compose exec api python -m scripts.lookahead_check --round 1 --csv /app/private_data/r1_lookahead.csv
```
The `api` image only contains the script after a rebuild (`docker compose up -d --build`), because the `Dockerfile` copies `scripts/` at build time. A CSV saved under `/app/private_data/` lands in the `private_data` Docker volume.

Locally (from `quant_haters-maahnal/`, with the virtual env active and the same `.env` as the API):
```bash
python -m scripts.lookahead_check --round 1
```

### 4.2 Options

| Option | Default | Meaning |
|---|---|---|
| `--round` | required | `1` or `2` |
| `--flag` | `0.70` | Match share at or above which a submission is **FLAGGED** |
| `--review` | `0.60` | Match share at or above which a submission is marked **REVIEW** |
| `--rule-min` | `0.70` | A shortcut only counts for a team's file if it is at least this accurate on that file |
| `--min-rows` | `30` | Minimum comparable rows for a shortcut to count |
| `--csv` | none | Also write the full report (every shortcut's accuracy and match share) to this CSV |

### 4.3 What it checks

For every **scored** submission in the round, it rebuilds four look-ahead shortcuts from the team's own dataset file and measures how often the team's 0/1 predictions match each one.

| Shortcut | Prediction for row `t` |
|---|---|
| `next_open` | `1` if `open[t+2] > open[t+1]` |
| `next_candle` | `1` if `(high[t+1] + low[t+1]) / 2 > open[t+1]` |
| `next_flow` | `1` if `order_flow[t+1] < 0` |
| `next_rsi` | `1` if `rsi_14[t+1] > rsi_14[t]` |

A shortcut only counts as evidence if it is itself accurate on that team's file (at least `--rule-min` against the real targets). The submission's status comes from its highest match with any counting shortcut:

- **FLAGGED:** match >= 70%. Almost certainly look-ahead. Suggested action: deduct 20 points and send the look-ahead warning.
- **REVIEW:** match 60-70%. Possibly blended with look-ahead; ask the team. Suggested action: deduct 10 points and send the check warning.
- **OK:** below 60%. Honest models typically match 45-60%. No action.
- **NO_FILE / NO_TARGETS:** the dataset file or validation targets could not be found (see section 6).

### 4.4 Where it gets its data (same sources as the scoring)

| Data | Source | Code |
|---|---|---|
| Submissions and predictions | `submissions`, `prediction_rows`, `scores` tables | `quant_haters-maahnal/app/models.py` |
| Each team's prediction window | `team_assignments.predict_start` / `predict_end` (R1 801-850, R2 851-900) | `quant_haters-maahnal/app/models.py` |
| Team dataset file | `dataset_releases.storage_key` under `PRIVATE_DATA_DIR`; R2 prefers the `flash_crash` release, R1 the `standard` one | `quant_haters-maahnal/app/services/datasets.py` (`resolve_storage_path`) |
| True targets | `master_validation.csv` via the scoring helper `_validation_targets()` | `quant_haters-maahnal/app/services/submissions.py` |
| Database / paths config | `DATABASE_URL`, `PRIVATE_DATA_DIR`, `MASTER_VALIDATION_PATH` | `quant_haters-maahnal/app/config.py`, root `docker-compose.yml` |

The checker uses `_validation_targets()` directly, so its answer key is exactly the one the scoring uses.

### 4.5 Reading the output

```
Look-ahead check R1 | 4 submissions | 2 flagged | 0 review | 0 could not be checked
STATUS    TEAM      # SUBMITTED (UTC)      PUBLIC  PRIVATE   MATCH  RULE
FLAGGED   E02       1 2026-10-15 16:24:10   79.68    87.04    100%  next_open
OK        I01       1 2026-10-15 16:24:10   65.16    45.40     63%  next_candle
```
- `#` is the team's submission number within that round.
- `PUBLIC` is the score shown during the round (first 25 rows); `PRIVATE` is the score on all 50 rows.
- `MATCH` / `RULE` is the highest match share and which shortcut it came from.
- With `--csv`, every shortcut's accuracy (`*_rule_acc`) and match share (`*_agreement`) is saved per submission.

### 4.6 Tested behaviour (on real Round 1 files)

| Team | What was submitted | Public | Match | Result |
|---|---|---|---|---|
| E02 | `next_open` cheat | 79.7 | 100% | FLAGGED |
| C03 | `next_flow` cheat | 68.9 | 100% | FLAGGED |
| I01 | honest model, 60% accurate | 65.2 | 63% | OK |
| H08 | random guesses | 0.0 | 46% | OK |
| E02 (R2) | `next_open` cheat on a test R2 file | 100.0 | 100% | FLAGGED |

Known limit: a team that mixes the shortcut with other guesses to land around 60-70% match is not caught automatically. It also only gains a few points; the notebook review is the backstop.

---

## 5. Event-day procedure

1. **Before Round 1:** read the rule out at kickoff and confirm it is on the brief/landing page.
2. **When Round 1 closes** (control room `/admin`, Round 1 completed):
   ```bash
   docker compose exec api python -m scripts.lookahead_check --round 1 --csv /app/private_data/r1_lookahead.csv
   ```
3. Open the **Integrity** panel in `/admin`, pick the round, and press **Run check**. Apply the suggested deductions per team, or with **Apply to all suggested**. Ask REVIEW teams about their method.
4. **Before publishing the Round 1 leaderboard** (Results panel, "Publish leaderboard"), decide on flagged teams. Deductions must be applied first, because the snapshot stores adjusted scores.
5. **When Round 2 closes:** repeat with `--round 2`.
6. **Presentation round:** flagged/review teams show their notebook. Judges check feature code for any use of later rows.
7. **Before "Run final backtest":** settle all disqualifications. A disqualified team can be removed from rankings by setting `teams.is_active = false` for that team in the database (the leaderboard and final backtest only include active teams).

Round 3 (signals, -1 to +1) is not covered by this checker.

---

## 6. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `No scored R1 submissions yet.` | Nobody has a scored submission in that round | Run after the round has submissions |
| `NO_FILE` | Dataset file missing under `PRIVATE_DATA_DIR` for that team's release | Check `/app/private_data/datasets/<TEAM>/` in the `private_data` volume; re-run `scripts/load_real_data.py` only if the data was never loaded (it wipes the database) |
| `NO_TARGETS` | `master_validation.csv` has no rows for that team/stock window | Check `MASTER_VALIDATION_PATH` (root `docker-compose.yml` sets `/app/scripts/master_validation.csv`) and that the file has the team's rows |
| `ModuleNotFoundError: app` | Run from the wrong folder | Run from `quant_haters-maahnal/`, or use `docker compose exec api ...` |
| `Round R2 is not configured.` | Database has no R2 round | Seed or load the event data first |

---

## 7. File map

| What | Path |
|---|---|
| The checker service (rules, thresholds, penalty values, warning texts) | `quant_haters-maahnal/app/services/lookahead.py` |
| The CLI (thin wrapper over the service) | `quant_haters-maahnal/scripts/lookahead_check.py` |
| Integrity workflow (store runs, apply, revoke, notices) | `quant_haters-maahnal/app/services/integrity.py` |
| Integrity API | `quant_haters-maahnal/app/routers/integrity.py`, `quant_haters-maahnal/app/schemas/integrity.py` |
| Migration for integrity tables | `quant_haters-maahnal/alembic/versions/0008_integrity.py` |
| Penalties in rankings | `quant_haters-maahnal/app/services/leaderboard.py` (`penalties_by_team`, `adjusted`), `quant_haters-maahnal/app/services/final_backtest.py` |
| Admin Integrity panel | `web/src/components/admin/IntegrityPanel.tsx` |
| Team notice banner | `web/src/components/NoticeBanner.tsx` |
| Scoring (R1/R2 binary score, R3 signal score) | `quant_haters-maahnal/app/services/scoring.py` |
| Submission processing and target lookup (`_validation_targets`) | `quant_haters-maahnal/app/services/submissions.py` |
| CSV validation for uploads | `quant_haters-maahnal/app/csv_validation.py` |
| Database models | `quant_haters-maahnal/app/models.py` |
| Dataset path resolution | `quant_haters-maahnal/app/services/datasets.py` |
| Settings (paths, DB URL) | `quant_haters-maahnal/app/config.py` |
| Answer key (repo copy, used by Docker) | `quant_haters-maahnal/scripts/master_validation.csv` |
| Real data loader (wipes DB) | `quant_haters-maahnal/scripts/load_real_data.py` |
| Docker services and env vars | `docker-compose.yml` (repo root) |
| Backend image (copies `scripts/`) | `quant_haters-maahnal/Dockerfile` |
| Landing page rules | `web/src/pages/index.tsx` (`RULES`) |
| CSV format hints | `web/src/lib/config.ts` (`getCsvFormat`), `web/src/components/FormatHint.tsx` |
| Organizer guide | `EVENT_GUIDE.md` |
| Change log for event prep | `CHANGELOG_EVENT_PREP.md` |

---

## 8. Integrity: penalties, messages and the admin panel

The checker is also in the control room. Open `/admin`, then the **Integrity** panel below the Leaderboard. The panel runs the same check as the CLI and lets the admin apply deductions and send warnings. **Nothing is applied automatically.** Every deduction and every message needs an admin confirmation.

### 8.1 Policy

For each team and round, the status comes from the team's **highest** match across all its submissions in that round.

| Highest match | Status | Suggested action | Message the team gets |
|---|---|---|---|
| 70% or more | FLAGGED | deduct 20 points | `WARNING_LOOKAHEAD` |
| 60% to 69% | REVIEW | deduct 10 points | `WARNING_CHECK` |
| below 60% | OK | none | none |
| no file or no targets | NO_FILE / NO_TARGETS | none (information only) | none |

The team sees only the message text. These are the exact texts (also in `app/services/lookahead.py`, and mirrored in `web/src/lib/config.ts`):

> **WARNING_LOOKAHEAD:** Your predictions match a look-ahead pattern: your model appears to be using data from later rows instead of predicting. 20 points have been deducted for this round. Predictions for each row must only use that row and earlier rows.

> **WARNING_CHECK:** Please make sure your model is not using look-ahead bias. Predictions for each row must only use that row and earlier rows. 10 points have been deducted for this round.

Rules that the code enforces:

- **Apply** (one team) or **Apply to all suggested** (every FLAGGED and REVIEW team) only writes after the admin confirms. The admin can edit the points and the message first, or use **Custom...** to enter a deduction from scratch.
- A team has **at most one look-ahead deduction per round**. Applying again for the same team and round revokes the old deduction and creates the new one. The two never stack.
- A deduction is a row in `score_adjustments`. It is subtracted when rankings are computed, and the `scores` table is never changed. Revoking a deduction restores the original values on the next computation.
- Where deductions count:
  - Admin leaderboard: raw score, penalty, adjusted score (ranked by adjusted), raw and adjusted private score.
  - Publish snapshot and the public leaderboard: adjusted scores.
  - Cumulative leaderboard: each round's adjusted score before weighting.
  - Final backtest: R1 and R2 private scores and the R3 hidden score each have that round's deduction subtracted, clamped at 0, before the 20/35/45 weighting.
- Penalty arithmetic (`adjusted()` in `app/services/leaderboard.py`): with no deduction the raw score is used unchanged. With a deduction, a non-negative score is floored at 0, and a negative raw score is never pushed lower.
- Team side: a team never sees its status, match percentage, rule name, penalty amount or adjusted score. Only the message reaches them. The dashboard shows the newest unacknowledged message at the top of every state, with an **Acknowledge** button. The "Public score" on the dashboard stays the raw latest score.
- Manual deductions (`kind = manual`) are supported by the API and count in every ranking. They do not send a message on their own, so pair one with a notice if the team should know.

### 8.2 Database and migration

- Migration `0008_integrity` (revises `0007_leaderboard_snapshot_final`) adds three tables:
  - `lookahead_results`: one row per submission per check run. `details` holds the per-rule values, thresholds and submission info.
  - `score_adjustments`: penalties. A partial unique index allows only one active `lookahead` row per team and round.
  - `team_notices`: messages sent to teams.
- Run `alembic upgrade head`. `alembic downgrade -1` drops the three tables.
- The event reset (`POST /admin/reset`) and `scripts/load_real_data.py` clear all three tables.
- Every run, apply, revoke and notice writes an `admin_audit_log` row (`RUN_LOOKAHEAD_CHECK`, `APPLY_LOOKAHEAD_ACTION`, `ADD_SCORE_ADJUSTMENT`, `REVOKE_SCORE_ADJUSTMENT`, `SEND_TEAM_NOTICE`).

### 8.3 Endpoints

All of these need an admin token. A team token gets 401. Errors come back as `{"detail": "..."}` with status 400 (validation), 404 (unknown team or item) or 409 (round not configured).

| Method and path | Purpose |
|---|---|
| `POST /api/v1/admin/integrity/run` | Body `{round: "R1" or "R2", flag, review, rule_min}` (fractions, defaults 0.70 / 0.60 / 0.70). Runs the check, stores it, and returns submissions and per-team rows. R3 returns 400 "Round 3 is not checked". |
| `GET /api/v1/admin/integrity/results?round=R1` | The latest stored run for the round, with each team's `current_adjustment` and `last_notice_at`. Empty if the round was never checked. |
| `POST /api/v1/admin/integrity/apply` | Body `{round, items: [{team_code, points, message}]}`. Validates every item first, then replaces each team's active look-ahead deduction and creates the notice, in one transaction. |
| `POST /api/v1/admin/integrity/adjustments` | Body `{team_code, round: "R1"/"R2"/"R3", points, reason}`. Manual deduction. |
| `GET /api/v1/admin/integrity/adjustments?round=` | List deductions, newest first. |
| `POST /api/v1/admin/integrity/adjustments/{id}/revoke` | Revoke a deduction. Revoking twice returns 400. |
| `POST /api/v1/admin/integrity/notices` | Body `{team_code, message}`. A warning with no deduction. |
| `GET /api/v1/admin/integrity/notices?team_code=` | List messages sent, with acknowledgement time. |
| `POST /api/v1/team/notices/{id}/ack` | Team acknowledges its own message. Another team's notice returns 404. |

`GET /api/v1/event/status` now includes `notices`: the team's unacknowledged messages, newest first, each with `id`, `message` and `created_at`.

### 8.4 Using the Integrity panel

1. Pick the round (R1 or R2). Adjust the thresholds if needed (Flag 70, Review 60, Rule min 70), then press **Run check**. "Last checked" shows the time of the stored run.
2. Teams are sorted FLAGGED, REVIEW, OK, then by match, descending. By default only FLAGGED and REVIEW teams show. Untick the box to see everyone. **Details** expands the team's submissions and per-rule matches.
3. **Apply** opens a dialog with the points and message prefilled. It shows the round score before and after the deduction. If the team already has a deduction, the dialog says it will be replaced. Confirm to apply.
4. **Apply to all suggested** lists every FLAGGED and REVIEW team with its points and message, and applies them together after one confirmation.
5. **Deductions** lists every deduction. **Revoke** restores the score on the next computation. Revoked rows are struck through.
6. **Messages sent** shows each message and whether the team has acknowledged it.

### 8.5 The CLI still works

`python -m scripts.lookahead_check --round 1` uses the new defaults (flag 70%, review 60%) and prints the same table. It still never writes to the database.

### 8.6 Known limits

- The checker only compares predictions with the four shortcuts in section 4.3. A team that blends a shortcut with other guesses to sit just under 60% is not caught. The notebook review is still the backstop.
- The mock backend (`NEXT_PUBLIC_USE_MOCKS` not set to `false`) keeps integrity state in memory only. It resets on reload and on "Reset mock".
