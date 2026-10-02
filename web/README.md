# Quant ML Trading Challenge: Web

Participant portal and organizer control room. Next.js 16 (Pages Router), TypeScript, Tailwind CSS 4.

For full setup (backend, database, and connecting the two), see the [root README](../README.md).

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 for teams and http://localhost:3000/admin for organizers. The backend must be running at `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`).

## Settings (`.env.local`)

| Setting | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `false` | `true` runs against a fake in-browser backend (no server needed). Mock logins: any team ID with password `demo`; admin `admin` / `admin` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend address |
| `NEXT_PUBLIC_STATUS_POLL_MS` | `5000` | Team screen refresh interval |
| `NEXT_PUBLIC_ADMIN_POLL_MS` | `3000` | Control room refresh interval |
| `NEXT_PUBLIC_MAX_UPLOAD_BYTES` | `1000000` | Upload size limit (matches the backend) |

Restart `npm run dev` after changing `.env.local`.

## Pages

| Route | Purpose |
|---|---|
| `/` | Team login |
| `/dashboard` | Assigned stock, dataset download, CSV upload, server-synced countdown |
| `/admin` | Control room: timer, rounds, flash crash, results (leaderboard snapshot, final backtest), live leaderboard |

## What teams see

All derived from `GET /api/v1/event/status`:

| State | When | Screen |
|---|---|---|
| Normal | Round live | Standard dashboard |
| Market unstable | R1 and its timer hits 0 (or the admin ends it) | Full-screen amber alert, uploads closed |
| Crash sequence | R2 starts | Flash, price plunge, "FLASH CRASH", then an Enter button. Shown once |
| Crash mode | R2 after the sequence | Red theme, crash data download, R2 upload |
| Market stabilizing | R2 timer hits 0 | Cooling screen, uploads closed |
| Alpha reveal | R3 starts | "ALPHA" reveal, then an Enter button. Shown once |
| Alpha desk | R3 after the reveal | Signal upload with a preview of the 50-row book |

Teams never see scores. After an upload they see the submission number and how many submissions remain.

## Code map

- `src/lib/api.ts`: every network call, plus adapters from backend response shapes.
- `src/lib/config.ts`: endpoint paths and CSV format hints.
- `src/lib/types.ts`: response types.
- `src/lib/mock.ts`: the fake backend used when `NEXT_PUBLIC_USE_MOCKS=true`.

The full backend contract is at http://localhost:8000/docs while the backend runs.

## Behaviour notes

- The countdown uses `server_time` to compute a clock offset; it never trusts the device clock.
- Team screens poll every 5 s and the control room every 3 s. Both pause while the browser tab is hidden.
- A 401 on a team call signs the team out to `/`. A 401 on an admin call returns to the `/admin` login.
