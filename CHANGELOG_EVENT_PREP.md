# BigShort: event prep changes (15 Oct 2026)

What was changed, how, and why, plus what is still broken and needs fixing before the event.

Tested on a copy against a real Postgres database seeded with the demo data (`python -m scripts.seed_demo`). The frontend was type-checked with `npx tsc --noEmit` and built with `next build`. All 23 backend checks pass, including a final backtest with tied teams.

---

## 1. Changes made

### 1.1 Fixed 7-hour login session (teams and admins)

**Why:** Users were being logged out early, for five different reasons:
- Tokens lasted 60 minutes. Docker never set `ACCESS_TOKEN_MINUTES`, so production always used the 60-minute default.
- The team token was kept in sessionStorage, so closing the tab or opening a new one logged the team out.
- The landing page (`/`) cleared the session every time it loaded.
- `/login` cleared the session every time it loaded.
- The admin control room logged out every hour, in the middle of the event.

**How (backend):**
| File | Change |
|---|---|
| `app/config.py` | `access_token_minutes` default 60 -> 420 |
| `.env.example`, root `docker-compose.yml`, `quant_haters-maahnal/docker-compose.yml` | `ACCESS_TOKEN_MINUTES=420` |
| `app/security.py` | `create_access_token` takes `issued_at`; `exp = issued_at + 420 min` |
| `app/routers/auth.py` | Team and admin login compute `issued_at` once (truncated to whole seconds), so the JWT `exp` and the DB session `expires_at` are identical |
| `app/schemas/auth.py` | `TokenResponse` now returns `expires_at` and `expires_in_seconds` |

**How (frontend):**
| File | Change |
|---|---|
| `src/lib/session.ts` | All sessions in localStorage; stores `qe.expiresAt` / `qe.admin.expiresAt`; an expired or missing expiry counts as logged out |
| `src/lib/api.ts` | `login()` computes `expiresAt = now + expires_in_seconds`, so a wrong client clock cannot shorten or extend the session; falls back to the JWT `exp` |
| `src/lib/types.ts`, `src/lib/mock.ts` | New fields; mock logins also last 7 h |
| `src/hooks/useSessionExpiry.ts` (new), `src/pages/_app.tsx` | Timer logs the team or admin out at exactly 7 h; re-checks on tab focus and visibility (background tabs and sleep delay timers) |
| `src/pages/login.tsx` | No longer clears the session; a logged-in team is sent to `/dashboard` |
| `src/pages/index.tsx` | Removed the `session.clear()` on load |
| `src/pages/admin.tsx` | Saves the admin expiry |

**Verified:** `expires_in_seconds` = 25200, JWT `exp - iat` = 25200, DB expiry equals the JWT `exp`, and an expired session returns 401. The browser behaviour should still be checked by hand (see section 3).

### 1.2 Case-insensitive CSV column names
**Why:** Uploads were rejected unless the headers were exactly `timestamp`, `prediction`, `confidence` / `signal`.
**How:** `app/csv_validation.py` runs `.strip().lower()` on every header and writes the result back to `reader.fieldnames`. Duplicates are checked after that ("Duplicate column names found. Column names are not case-sensitive."). No other validation changed.
**Verified:** `Timestamp,Prediction,Confidence`, `TIMESTAMP,PREDICTION` and headers with spaces are accepted. `timestamp,prediction,Prediction` and unknown columns are rejected.

### 1.3 Removed the wrong rate-limit claim
**Why:** The landing page said "A rejected file also starts the wait". The backend rolls back the limiter on a rejected file, so it does not start the wait (and does not count toward the 10).
**How:** In `src/pages/index.tsx`, rule 2 now reads "One upload per 60 seconds per team."
**Verified:** Two rejected uploads followed immediately by a valid one are all processed, with no 429.

### 1.4 Standings only show teams with a score
**Why:** The cumulative standings listed every active team, including teams that never submitted.
**How:**
- `app/services/leaderboard.py` `cumulative_leaderboard()`: removed the block that added every active team.
- `app/services/final_backtest.py`: skips teams with no R1, no R2 and no R3 score.
- `src/pages/leaderboard.tsx`: frontend safety filter that drops entries where R1, R2 and R3 are all null.
**Verified:** Empty before any upload; exactly the 3 teams that submitted show up afterwards, ranked 1 to 3.

### 1.5 Landing page copy and timeline
**Why:** The timeline needed the new schedule, and some lines didn't match how the backend behaves.
**How (`src/pages/index.tsx`):**
- Rule 1: "10 submissions in total, shared across all three rounds."
- Rule 3: explains that the public score uses 25 of the 50 rows and the final ranking uses all 50.
- Scoring copy: "calling UP every time lands at roughly 17" (the old copy said "about 0"; the actual score is 16.67).
- New timeline intro.

**How (`src/components/landing/Timeline.tsx`):**
- 7 stops: Kickoff, R1 (1 h), Flash crash, R2 (1 h), Break (1 h), R3 (1 h), Finale / Presentation (1 h).
- New `break` and `finale` tones.
- Layout breakpoint moved from `lg` to `xl` (7 columns).
- Gradient and price path redrawn to match the 7 stops.

The event is still five hours (1+1+1+1+1), so the hero copy is unchanged.

### 1.6 Final backtest crash fixed
**Why:** "Run final backtest" returned a 500 error every time (both bugs were already there before this round of changes), so no final results could be published:
1. `FinalBacktestEntry` had no `r1_score`/`r2_score`/`r3_score`/`cumulative_score`/`submissions` fields, but the audit-log step reads them, so it raised `AttributeError`. This was also why the admin results table showed "-" for R1/R2/R3.
2. Tied teams share a rank, but `leaderboard_snapshot_entries` has primary key `(snapshot_id, rank)`, so any tie raised `UniqueViolation`.

**How:**
- `app/schemas/admin.py`: added the optional fields to `FinalBacktestEntry`.
- `app/services/leaderboard.py` `publish_final_results()`: snapshot rows are stored by row position (`enumerate(rankings, start=1)`), while the shared ranks stay in the API response and the audit log.

**Verified:** The backtest returns 200 with a full R1/R2/R3 breakdown, also when two teams are tied (they share a rank). Public final results match. 23/23 checks pass.

---

## 2. Still broken: must fix before the event

### 2.1 Housekeeping
- Delete the 4 junk files in `web/` named `C:UserssadhiAppDataLocalTemp...scratchpad*.log`. An editing tool wrote them there by mistake, and they would be committed and copied into the Docker image.
- If a final backtest was ever run on EC2, the old results (with every team) stay public until the backtest is re-run after the fix above.

### 2.2 No "event over" screen for teams (not yet built)
**Problem:** After R3 ends, the team dashboard only shows "R3 has ended. Uploads are closed." There is no end-of-event screen and no prompt to check the standings.

**Planned fix (frontend only):**
- New `src/components/EventOver.tsx`, rendered in `dashboard.tsx` in place of the R3 desk when `current_round === "R3"` and the round is over (phase `completed`, or the countdown at 0 while live). It does not show while R3 is paused.
- Content: "Market closed" heading, short subtext, submissions used (x of 10), and a "View standings" button linking to `/leaderboard`.
- Polls `getFinalResults()` every 10 s: shows "Final standings are published after evaluation." while pending, and "Final standings are live" (with the button highlighted) once published.
- AppHeader stays visible; the R3 alpha intro overlay must not appear on top of it.

**Verify:** End R3 from `/admin`: the dashboard switches within about 5 s. Run the final backtest: the line updates within about 10 s. Pausing R3 does not trigger the screen. `tsc` and `next build` pass.

---

## 3. Manual checks before the event
- Set `ACCESS_TOKEN_MINUTES=2` and log in as a team and as admin. Refresh, close and reopen the tab, and visit `/` and `/login`: you should stay logged in. At 2 minutes both should be logged out with no click. Set it back to 420.
- Check the landing page at 375, 1024, 1280 and 1536 px, with the Brute Force theme both on and off.

## 4. Known issues not yet addressed (from the audit)
| Severity | Issue |
|---|---|
| Critical | `scripts/master_validation.csv` (all answers) is committed to the repo and baked into the Docker image |
| Critical | Team passwords in `load_real_data.py` are predictable (`pw_<code>_<md5(code)[:6]>`); no login rate limit; admin password defaults to `admin-demo-password` |
| High | `/api/v1/leaderboard/cumulative` is public and live, so anyone sees all teams' scores without organizers publishing |
| High | The 500 handler in `routers/submissions.py` returns full Python tracebacks to teams |
| High | A push to `main` redeploys mid-event; the `seed-db` workflow wipes the whole DB with one click |
| High | Hardcoded default `JWT_SECRET` / Postgres password in `docker-compose.yml`; HTTP only, no TLS |
| Medium | "Best score" is actually the latest submission for R1/R2/live boards, but the highest public score for R3 |
| Medium | Target lookup hardcodes `start - 801` (`submissions.py`, `final_backtest.py`) |
| Medium | Final backtest silently falls back to the master file / public score; it can run before R3 ends; `/admin/reset` doesn't clear old final results |
| Medium | `hidden_validation.csv` is a copy of the master file; the R3 dataset and targets are the same as R2 |
| Load | Upload endpoint is `async` with blocking DB calls (stalls the whole server); `FOR UPDATE` puts every team's uploads in one queue; Argon2 login uses 64 MB per hash, so use a t3.medium, not a t3.small |
| Docs | `EVENT_GUIDE.md` still says rejected files start the wait, "10 per round", timestamps 1 to 50 |
