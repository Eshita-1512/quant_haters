# PostgreSQL Database Schema

This schema is owned by SQLAlchemy models in `app/models.py` and versioned through Alembic. PostgreSQL UUIDs identify teams, stocks, assignments, releases, submissions, scores, and administrators. All timestamps are timezone-aware.

## Relationship overview

```text
teams ──< auth_sessions
  └──< team_assignments >── stocks
          │       └──────── rounds
          └──< dataset_releases ──< download_events
          └──< submissions ──< prediction_rows
                    │        └──< signal_rows
                    └─────────── scores

rounds ── event_state
admin_users ──< admin_audit_log
```

## Tables

### `teams`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `team_code` | varchar(50) | Unique, indexed; login identifier |
| `team_name` | varchar(150) | Display name |
| `password_hash` | text | Argon2 hash only |
| `is_active` | boolean | Disabled teams cannot authenticate/use existing sessions |
| `created_at` | timestamptz | Server-generated |

### `auth_sessions`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `team_id` | UUID | FK `teams.id`, cascade delete |
| `token_hash` | varchar(64) | Unique SHA-256 hash of issued JWT |
| `expires_at` | timestamptz | Enforced on every request |
| `revoked_at` | timestamptz | Nullable; non-null means revoked |
| `created_at` | timestamptz | Server-generated |

### `stocks`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `stock_code` | varchar(50) | Unique, e.g. `STOCK_A` |
| `display_name` | varchar(150) | Frontend label |
| `is_active` | boolean | Availability flag |
| `created_at` | timestamptz | Server-generated |

### `rounds`

| Column | Type | Rules |
|---|---|---|
| `id` | integer | Primary key |
| `round_code` | varchar(20) | Unique (`R1`, `R2`, `R3`) |
| `round_name` | varchar(100) | Display label |
| `submission_type` | varchar(20) | `prediction` or `signal` |
| `phase` | enum | scheduled/live/flash_crash/paused/completed |
| `starts_at`, `ends_at` | timestamptz | Server-side submission window |
| `max_submissions_per_team` | integer | Default 10 |
| `created_at` | timestamptz | Server-generated |

### `team_assignments`

One row assigns one team to one stock and one private master-data window for a round.

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `team_id` | UUID | FK `teams.id` |
| `round_id` | integer | FK `rounds.id` |
| `stock_id` | UUID | FK `stocks.id` |
| `train_start`, `train_end` | integer | Inclusive master training window |
| `predict_start`, `predict_end` | integer | Inclusive master evaluation window |
| `created_at` | timestamptz | Server-generated |

`(team_id, round_id)` is unique. Window end values must not precede their starts.

### `dataset_releases`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `assignment_id` | UUID | FK `team_assignments.id`; prevents cross-team delivery |
| `round_id` | integer | FK `rounds.id` |
| `release_type` | varchar(20) | `standard` or `flash_crash` |
| `version` | integer | Release revision |
| `display_filename` | varchar(255) | Download filename |
| `storage_key` | text | Relative path inside private storage root |
| `sha256` | varchar(64) | Integrity digest |
| `file_size_bytes` | integer | Expected size |
| `row_count` | integer | Nullable expected row count |
| `available_from`, `available_until` | timestamptz | Availability interval |
| `is_active` | boolean | Release switch |
| `created_at` | timestamptz | Server-generated |

### `download_events`

| Column | Type | Rules |
|---|---|---|
| `id` | integer | Primary key |
| `team_id` | UUID | FK `teams.id` |
| `dataset_release_id` | UUID | FK `dataset_releases.id` |
| `created_at` | timestamptz | Audit time |

### `submissions`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `team_id`, `stock_id`, `assignment_id` | UUID | Foreign keys binding ownership and window |
| `round_id` | integer | FK `rounds.id` |
| `original_filename` | varchar(255) | Client filename for audit only |
| `file_hash` | varchar(64) | SHA-256 digest |
| `file_size_bytes` | integer | Upload size |
| `row_count` | integer | Parsed count |
| `status` | enum | uploaded/validating/invalid/scoring/scored/failed |
| `validation_error` | text | Nullable safe failure detail |
| `created_at` | timestamptz | Submission time |

The service locks the team's current assignment before counting/inserting so concurrent requests cannot bypass the per-round limit.

### `prediction_rows`

| Column | Type | Rules |
|---|---|---|
| `submission_id` | UUID | FK `submissions.id`, cascade delete; composite PK |
| `timestamp_index` | integer | Composite PK; check `1..50` |
| `prediction` | integer | Check `0` or `1` |
| `confidence` | numeric(4,3) | Check `0..1`, default `0.5` |

### `signal_rows`

| Column | Type | Rules |
|---|---|---|
| `submission_id` | UUID | FK `submissions.id`, cascade delete; composite PK |
| `timestamp_index` | integer | Composite PK; check `1..50` |
| `signal` | numeric(5,4) | Check inclusive `-1..1` |

### `scores`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `submission_id` | UUID | Unique FK `submissions.id` |
| `team_id`, `stock_id` | UUID | Foreign keys for efficient ranking |
| `round_id` | integer | FK `rounds.id` |
| `score` | numeric(12,6) | Frozen round score |
| `is_valid` | boolean | Leaderboard eligibility |
| `balanced_accuracy`, `mcc` | numeric(8,6) | R1/R2 metrics; nullable for R3 |
| `scoring_version` | varchar(100) | Formula version, default `v1` |
| `details` | jsonb | R3 Sharpe/drawdown/cost breakdown or future metrics |
| `created_at` | timestamptz | Scoring time |

### `admin_users`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `username` | varchar(100) | Unique |
| `password_hash` | text | Argon2 hash |
| `is_active` | boolean | Authorization switch |
| `created_at` | timestamptz | Server-generated |

### `event_state`

Singleton row (`id = 1`) read by the dashboard timer and Flash Crash modal.

| Column | Type | Rules |
|---|---|---|
| `id` | integer | Primary key |
| `current_round_id` | integer | Nullable FK `rounds.id` |
| `flash_crash_active` | boolean | Modal/data selection switch |
| `flash_crash_message` | text | Nullable participant message |
| `state_version` | integer | Incremented on state transitions for polling |

### `admin_audit_log`

| Column | Type | Rules |
|---|---|---|
| `id` | integer | Primary key |
| `admin_id` | UUID | FK `admin_users.id` |
| `action` | varchar(100) | e.g. `TRIGGER_FLASH_CRASH` |
| `details` | jsonb | Transition metadata |
| `created_at` | timestamptz | Audit time |

## Security boundaries

- A participant supplies only local timestamps `1..50`; the backend derives the master timestamps from `team_assignments`.
- Dataset selection joins the authenticated team to its assignment. Signed file URLs expire after 120 seconds and storage keys are constrained to `PRIVATE_DATA_DIR`.
- Secret validation targets are read only by the scoring service and are never exposed through static routes.
- Team tokens require a matching, unexpired, non-revoked `auth_sessions` row and an active team.
- Flash Crash activation locks the singleton event state, verifies all R2 crash releases, updates both rounds/state, and writes an audit row in one transaction.
