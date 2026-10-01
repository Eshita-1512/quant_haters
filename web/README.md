# Quant ML Trading Challenge: Web

Participant frontend (Member 3). Next.js 16 Pages Router, TypeScript, Tailwind CSS 4.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 for participants and http://localhost:3000/admin for organizers. In mock mode, teams sign in with any team ID and the password `demo`; the admin login is `admin` / `admin`. Open the admin panel and a participant dashboard in two tabs of the same browser to watch admin actions land instantly.

## Pages

| Route | Purpose |
|---|---|
| `/` | Team login |
| `/dashboard` | Assigned stock, dataset download, CSV upload, round and server-synced countdown |
| `/admin` | Organizer control room: timer, rounds, flash crash switch, leaderboard |

Participant screen states, all derived from `GET /api/status`:

| State | When | What teams see |
|---|---|---|
| Normal | Round live | Standard dashboard |
| Market unstable | `current_round` is `R1`, crash off, and the timer hits 0 or `round_phase` is `completed` | Full-screen amber alert with a jittering price feed, uploads closed |
| Crash sequence | `current_round` becomes `R2` or `flash_crash_active` turns true | Flash, screen shake, price plunge, "FLASH CRASH" slam, then an Enter button. Shown once. |
| Crash mode | Round 2 after the sequence | Red theme, crash hero with download, Round 2 timer and upload |
| Market stabilizing | `current_round` is `R2` and the timer hits 0 or `round_phase` is `completed` | Cooling red screen, price recovering, uploads closed |
| Alpha reveal | `current_round` becomes `R3` | Continues from the stabilizing screen: violet burst, rally, "ALPHA" slam, then an Enter button. Shown once. |
| Alpha desk | Round 3 after the reveal | Violet trading desk: book preview of the 50 positions with net and gross exposure, long/short/flat counts, turnover and estimated cost, plus a trade log |

Round 2 is always a crash round on the participant side, whatever the flag says, so the crash cannot be skipped.

## Switching to the real backend

Set in `.env.local`:

```
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE_URL=https://your-backend-host
```

Every network call lives in `src/lib/api.ts`. Endpoint paths are in `src/lib/config.ts` (`endpoints`), and response types are in `src/lib/types.ts`. If the agreed contract changes, those three files are the only ones that should need edits.

The backend must allow CORS from the frontend origin and accept `Authorization: Bearer <token>`.

## Contract this build assumes

This is not yet agreed with the backend. It follows `quant_challenge_backend_database_schema.md` for endpoints and status, plus `spec.md` for upload responses and error messages.

| Call | Request | Response |
|---|---|---|
| `POST /api/auth` | JSON `{team_id, password}` | `{token}` |
| `GET /api/status` | Bearer token | Extended status: `state_version, server_time, current_round ("R1"/"R2"/"R3"), round_name, round_phase, round_ends_at, time_remaining_seconds, flash_crash_active, flash_crash_message, assigned_stock {code, name}, download_available, submission_type` |
| `GET /api/data/download` | Bearer token | `{filename, download_url, expires_in_seconds}`, fetched only on click |
| `POST /api/upload` | multipart, field `file` | Success `{status: "success", score, ...optional spec.md fields}`. Error: non-2xx or `{status: "error", message}`. `message` is shown verbatim. |

Admin endpoints. All require an admin Bearer token and every mutation returns the full admin status, so the panel updates without a second request.

| Call | Request | Response |
|---|---|---|
| `POST /api/admin/auth` | JSON `{username, password}` | `{token}` |
| `GET /api/admin/status` | | `state_version, server_time, current_round, round_name, round_phase, round_ends_at, time_remaining_seconds, flash_crash_active, flash_crash_message, flash_crash_triggered_at, rounds[{code, name, submission_type, phase, duration_seconds, ends_at}], teams_total?, submissions_current_round?` |
| `POST /api/admin/timer` | `{action: "pause" \| "resume" \| "extend" \| "set" \| "end", seconds?}` | Admin status. `extend` takes a signed number of seconds. |
| `POST /api/admin/round` | `{round, duration_seconds}` | Admin status. Starting R2 also triggers the flash crash (same effect as the flash crash call). Starting R1 or R3 turns it off. |
| `POST /api/admin/flash-crash` | `{active, message?, duration_seconds?}` | Admin status. `active: true` closes R1, starts R2 with the given duration, sets `flash_crash_active` and bumps `state_version`. `active: false` during R2 is rejected with 409; restart R1 to undo a crash. |
| `GET /api/admin/leaderboard?round=R1` | | `[{team, team_code, score, submissions, last_submission_at}]`, best valid score per team |

These map onto the schema doc: timer and round actions update `rounds.phase`, `rounds.ends_at` and `event_state`, the flash crash action is the schema doc's section 12 transaction, and each should write an `admin_audit_log` row.

Fields not in any existing doc, proposed for the merged contract:

- `submission_type` in participant status, so the upload panel knows Round 3 takes positions.
- The whole admin API above. `spec.md` only lists `POST /admin/flash-crash` and `GET /admin/status`.
- Timer pause needs a stored "remaining seconds" while paused, since `ends_at` alone cannot represent a paused clock.

Open decisions that affect this code: Round 3 column name (`position` here, `signal` in spec.md) and range, score scale, max upload size (1 MB placeholder), and how admins authenticate (the schema doc suggests an external identity provider with MFA).

## Behaviour notes

- The countdown uses `server_time` to compute a clock offset. It never trusts the device clock.
- Participant status polls every 5 s, the admin panel every 3 s. Both pause while the tab is hidden. With the real backend, a participant sees an admin action within one poll interval.
- A 401 on a team call clears the team session and returns to `/`. A 401 on an admin call signs the admin out back to the `/admin` login.
