# Planned Changes

Work queued for later. To start one, ask: "read PLANNED_CHANGES.md and do item N". Each item lists the current behaviour, the plan, and the open questions to settle before (or at the start of) the work.

Suggested order: **3 → 2 → 1**. Item 3 stands alone. Item 1 depends on item 2, because a newly signed-up team cannot use the dashboard until it has a dataset assignment.

Status: all items **not started**.

---

## 1. Signup page for real users

**Goal:** real participants create their own account from the site. Usernames and passwords are stored in the database, replacing the 40 seeded demo teams.

### Current behaviour

- Teams only come from `scripts/seed_demo.py`. Table `teams`: `team_code` (login ID, unique), `team_name`, `password_hash` (Argon2), `is_active`, `created_at`.
- Login is `POST /api/v1/auth/login` with `{team_id, password}`.
- A team with no assignment for the current round sees "No active event assignment found" on the dashboard (404 from `/event/status`).

### Plan

Backend (`quant_haters-maahnal/`):
- New `POST /api/v1/auth/signup` with `{team_id, team_name, password, signup_code?}`:
  - `team_id`: 3–30 chars, letters/numbers/`-`/`_`, unique case-insensitively.
  - `password`: minimum 8 chars, maximum 256, hashed with `app.security.hash_password`.
  - Returns a session token (auto sign-in), or "pending approval" if approval is required (see questions).
- Settings in `.env`: `SIGNUP_ENABLED` (on/off) and an optional `SIGNUP_CODE` shared event code, so strangers can't register.
- Throttle signup attempts. Uniform error messages, so the endpoint doesn't reveal which IDs exist beyond "already taken".
- Admin endpoints: list teams, activate/deactivate, reset a team's password.
- Tests for validation, duplicates, disabled signup, wrong code.
- Possibly a migration (e.g. `approved_at`), depending on the approval decision.

Frontend (`web/`):
- New `/signup` page in the same style as `/`, linked from the sign-in page. Fields: team ID, team name, password, confirm password, event code (if enabled). Inline errors.
- Dashboard: friendly "Registered. Waiting for the organizer to assign your dataset" state instead of an error when the team has no assignment.
- Control room: **Teams** panel with the list, status, created time, whether they have a dataset per round, and activate/deactivate/reset-password actions.

### Open questions

1. Are accounts per **team** (one login shared by members) or per **person** (individuals who then join or form teams)? Everything today is team-based.
2. Open signup, signup with a shared **event code**, or signup then **admin approval** before the team can sign in?
3. Should teams get datasets automatically on signup (round-robin stock and windows), or does the admin assign them (item 2)?
4. Collect anything else, such as email, member names or college? Email would also enable "forgot password".
5. Should signup close automatically when Round 1 starts?
6. Should the 40 demo teams be removed for the real event (a clean seed with only rounds, stocks and the admin)?

---

## 2. Admin chooses which dataset goes to which team

**Goal:** the organizer uploads their own dataset files and decides which team (and round) receives each one, from the control room, without touching the database.

> Interpretation to confirm: "which database goes to which page" is read here as **which dataset file goes to which team, per round**. If "page" means something else (e.g. round, or a screen), the plan changes.

### Current behaviour

- Per-team datasets are already supported by the schema, but only the seed creates them.
- `team_assignments`: one row per team per round, with stock, training window and 50-row prediction window.
- `dataset_releases`: files per assignment. `release_type` is `standard` or `flash_crash`. The highest active `version` is served, within `available_from`/`available_until`. Files are stored under `private_data/` at `storage_key`.
- Scoring targets are in `private_data/master_validation.csv`, keyed by team, stock and master timestamp. Final R3 targets are in `hidden_validation.csv`.
- Starting R2 or triggering the crash requires a `flash_crash` release for every active team.

### Plan

Backend:
- `POST /api/v1/admin/datasets` (multipart): file + team(s) + round + release type. It:
  - stores the file under `private_data/datasets/<team>/`,
  - computes the sha256, size and row count,
  - creates the next `version`,
  - writes an audit log entry.
- "Same file for many teams" option: one upload assigned to a selected set of teams, or to all of them.
- `GET /api/v1/admin/datasets`: a coverage matrix of teams × (R1, R2 standard, R2 crash, R3), with filename, version and upload time per cell.
- Deactivate or replace a release.
- `PUT /api/v1/admin/assignments`: set a team's stock and windows per round, singly or in bulk from a manifest CSV.
- Upload `master_validation.csv` and `hidden_validation.csv` through the admin API, with a schema check and coverage check (every assigned window has targets).
- Limits: a larger admin upload size (e.g. 50 MB), header/row sanity checks, and a path-safety check (the existing `resolve_storage_path`).
- Tests for each endpoint.

Frontend:
- New control room page (e.g. `/admin/datasets`) with:
  - a matrix of teams by round. Each cell shows the file or "missing", and has upload/replace buttons.
  - bulk upload, either a manifest CSV with a folder of files, or one file for many teams.
  - a readiness bar ("R2 crash data: 38/40 teams"), so a blocked flash crash is visible before event day.
- Validation targets upload with a coverage report.

### Open questions

1. Confirm the interpretation above: dataset → team (per round)?
2. Does each team get a **different** file, or do groups of teams share files (e.g. everyone on STOCK_A gets the same file)?
3. Upload one file at a time in the UI, or bulk (manifest + folder, or a zip)? How many teams and files are there in total?
4. Who sets each team's stock and prediction window: the admin per team, a manifest, or automatic assignment?
5. Do you already have `master_validation.csv` / `hidden_validation.csv` in the expected format, or should the tool generate them from the datasets?

---

## 3. UI: keep the download and upload controls consistent across rounds

**Goal:** the dataset download button and the file upload control stay the same in every round, instead of moving, being renamed or being restyled each round. This is one of several UI changes; others are to be listed below.

### Current behaviour (`web/src/pages/dashboard.tsx`)

| Round | Download | Upload |
|---|---|---|
| R1 | Left column "Dataset" panel, white **Download data** button | Right "Upload predictions" panel, green **Submit predictions** |
| R2 (crash) | "Dataset" panel removed. Red **Download crash data** button inside the crash banner at the top (`CrashHero.tsx`, `variant="danger"`) | Same position, crash theme |
| R3 (alpha) | Moved into a "Desk stats" panel as **Download market data** | Different layout: "Submit your book" panel, purple gradient **Submit signals** button (`FileUpload` `variant="alpha"`), position preview takes the main column, format hint moves to the bottom |

### Plan

- One shared dashboard layout for all rounds:
  - a **Dataset** card with one download button,
  - an **Upload** card with one upload control,
  - in the same place, with the same labels, size and style.
- Round identity stays in the header/banner only (crash banner, alpha hero, colours), not in the controls.
- Remove the download button from `CrashHero.tsx`; keep the crash message.
- R3: keep the signal book preview, but under or beside the standard upload card, not replacing the layout.
- Drop the per-round `variant`/`submitLabel`/`label` differences in `dashboard.tsx`, `FileUpload.tsx` and `DownloadButton.tsx`, or keep one neutral style.
- Check in the browser for each round (R1, crash, R3) at desktop and phone widths.

### Open questions

1. What should stay fixed: **position**, **labels**, **colours/style**, or all three?
2. Exact labels wanted, e.g. "Download dataset" / "Upload file"? Should the label mention the round's file type ("predictions" vs "signals")?
3. Should the format hint (expected CSV columns) stay next to the upload control in every round?

### Other UI changes

_Add the remaining UI changes here._

-
