# Quant Challenge Backend Database Schema

**Status:** Proposed technical specification  
**Target:** PostgreSQL 15+, FastAPI, SQLAlchemy 2.x, Alembic  
**Version:** 2.0  
**Date:** 24 September 2026

## 1. Purpose and scope

This specification defines the backend database required by the participant frontend:

- `/` — team login with assigned credentials;
- `/dashboard` — assigned stock, data download, CSV upload, current round, and server-synchronized countdown;
- `/leaderboard` — ranked team scores, refreshed by polling; and
- Flash Crash modal — activated by authoritative backend state and linked to a new dataset download.

The schema is independent of any sample market-data CSV. Downloadable CSV files and the secret master-validation file belong in private file/object storage. PostgreSQL stores metadata, permissions, submissions, scores, and event state.

## 2. Frontend API compatibility

The database supports the frontend's current contracts without requiring it to know internal IDs.

### `POST /api/auth`

Request:

```json
{"team_id": "Team1", "password": "secret"}
```

Response:

```json
{"token": "opaque-session-token"}
```

### `GET /api/status`

Minimum compatible response:

```json
{
  "current_round": "R1",
  "time_remaining_seconds": 3600,
  "flash_crash_active": false
}
```

Recommended extended response:

```json
{
  "state_version": 4,
  "server_time": "2026-09-24T09:00:00Z",
  "current_round": "R1",
  "round_name": "Round 1",
  "round_phase": "live",
  "round_ends_at": "2026-09-24T10:00:00Z",
  "time_remaining_seconds": 3600,
  "flash_crash_active": false,
  "flash_crash_message": null,
  "assigned_stock": {"code": "STOCK_A", "name": "Stock A"},
  "download_available": true
}
```

The frontend should calculate its displayed countdown from `server_time` and `round_ends_at`, then periodically resynchronize. Client device time must not be authoritative.

### `GET /api/leaderboard`

Response remains:

```json
[
  {"team": "Team A", "score": 85.4},
  {"team": "Team B", "score": 72.1}
]
```

### `POST /api/upload`

Success:

```json
{"status": "success", "message": "Scored!", "score": 92.5}
```

Validation error:

```json
{"status": "error", "message": "Invalid CSV schema"}
```

### `GET /api/data/download`

Recommended response:

```json
{
  "filename": "STOCK_A_R1_flash_crash.csv",
  "download_url": "short-lived-signed-url",
  "expires_in_seconds": 120
}
```

## 3. Storage boundaries

### PostgreSQL stores

- team accounts and password hashes;
- revocable authentication sessions;
- stocks, rounds, and team assignments;
- metadata for normal and flash-crash datasets;
- authorized download records;
- submission metadata and validated prediction rows;
- scores and leaderboard state;
- the current round and Flash Crash state; and
- administrator identities and audit logs.

### Private storage stores

- standard participant datasets;
- Flash Crash datasets;
- optional original participant uploads; and
- `master_validation.csv` and other secret scoring inputs.

Files must not be placed in a frontend `public` directory. The backend authorizes each download and returns a short-lived signed URL or streams the file.

## 4. Entity relationships

```text
teams ─────────────< auth_sessions
  │
  ├────< team_assignments >──── stocks
  │                │               │
  │              rounds            └────< dataset_releases
  │                │                            │
  ├────< download_events >─────────────────────┘
  │
  └────< submissions >──── rounds
             │  │  └────── stocks
             │  ├────────< prediction_rows
             │  ├────────< position_rows
             │  └───────── scores
             │
             └──────────── team_assignments

rounds ───────── event_state
dataset_releases ─ event_state.active_dataset_release_id

admin_users ─────< admin_audit_log
admin_users ────── event_state.flash_crash_triggered_by
```

## 5. Database enums

```sql
CREATE TYPE round_phase AS ENUM (
    'scheduled', 'live', 'flash_crash', 'paused', 'completed'
);

CREATE TYPE submission_kind AS ENUM ('prediction', 'position');
CREATE TYPE dataset_kind AS ENUM ('standard', 'flash_crash');

CREATE TYPE submission_status AS ENUM (
    'uploaded', 'validating', 'invalid', 'scoring', 'scored', 'failed'
);
```

## 6. Tables

### 6.1 `teams`

Participant accounts and public team identities.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `team_code` | `VARCHAR(50)` | No | — | Unique login identifier |
| `team_name` | `VARCHAR(150)` | No | — | Leaderboard display name |
| `password_hash` | `TEXT` | No | — | Argon2id password hash |
| `is_active` | `BOOLEAN` | No | `TRUE` | Login/upload access switch |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time |

Never store plaintext passwords. Disabled teams cannot log in or upload and are excluded from the public leaderboard.

### 6.2 `auth_sessions`

Revocable sessions created after successful login.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `team_id` | `UUID` | No | — | Foreign key to `teams.id` |
| `token_hash` | `CHAR(64)` | No | — | Unique SHA-256 token hash |
| `expires_at` | `TIMESTAMPTZ` | No | — | Absolute expiry |
| `revoked_at` | `TIMESTAMPTZ` | Yes | `NULL` | Logout/revocation time |
| `last_used_at` | `TIMESTAMPTZ` | Yes | `NULL` | Last authorized request |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |

The raw session token is returned once and never persisted.

### 6.3 `stocks`

Stocks that can be assigned to teams.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `stock_code` | `VARCHAR(50)` | No | — | Unique code such as `STOCK_A` |
| `display_name` | `VARCHAR(150)` | No | — | Dashboard label |
| `description` | `TEXT` | Yes | `NULL` | Optional participant-facing text |
| `is_active` | `BOOLEAN` | No | `TRUE` | Assignment eligibility |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |

### 6.4 `rounds`

Competition timing and allowed upload type.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `SMALLSERIAL` | No | Sequence | Primary key |
| `round_code` | `VARCHAR(20)` | No | — | Unique code such as `R1` |
| `round_name` | `VARCHAR(100)` | No | — | Frontend display name |
| `submission_type` | `submission_kind` | No | — | `prediction` or `position` |
| `phase` | `round_phase` | No | `'scheduled'` | Operational state |
| `starts_at` | `TIMESTAMPTZ` | No | — | Server-authoritative start |
| `ends_at` | `TIMESTAMPTZ` | No | — | Server-authoritative end |
| `max_submissions_per_team` | `INTEGER` | No | `10` | Upload limit |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time |

Constraints: `ends_at > starts_at`, submission limit is positive, and only one round may be `live` or `flash_crash` at once.

### 6.5 `team_assignments`

Maps one team to one stock for a given round.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `team_id` | `UUID` | No | — | Foreign key to `teams.id` |
| `round_id` | `SMALLINT` | No | — | Foreign key to `rounds.id` |
| `stock_id` | `UUID` | No | — | Foreign key to `stocks.id` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Assignment time |

Unique constraint: `(team_id, round_id)`. The API derives the team's stock from this table; the frontend cannot choose it.

### 6.6 `dataset_releases`

Metadata for files exposed by the dashboard's Download Data button.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `round_id` | `SMALLINT` | No | — | Associated round |
| `stock_id` | `UUID` | No | — | Associated stock |
| `release_type` | `dataset_kind` | No | — | Standard or Flash Crash |
| `version` | `INTEGER` | No | `1` | Release version |
| `display_filename` | `VARCHAR(255)` | No | — | Safe download filename |
| `storage_key` | `TEXT` | No | — | Private storage identifier |
| `sha256` | `CHAR(64)` | No | — | File checksum |
| `file_size_bytes` | `BIGINT` | No | — | File size |
| `row_count` | `INTEGER` | Yes | `NULL` | Optional validated row count |
| `available_from` | `TIMESTAMPTZ` | No | — | Release start |
| `available_until` | `TIMESTAMPTZ` | Yes | `NULL` | Optional expiry |
| `is_active` | `BOOLEAN` | No | `TRUE` | Availability switch |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |

Unique constraint: `(round_id, stock_id, release_type, version)`. Activating Flash Crash changes the selected release type from `standard` to `flash_crash`.

### 6.7 `download_events`

Audit records for authorized downloads.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `BIGSERIAL` | No | Sequence | Primary key |
| `team_id` | `UUID` | No | — | Downloading team |
| `dataset_release_id` | `UUID` | No | — | Downloaded release |
| `session_id` | `UUID` | Yes | `NULL` | Authenticating session |
| `ip_address` | `INET` | Yes | `NULL` | Source IP |
| `user_agent` | `TEXT` | Yes | `NULL` | Optional diagnostic data |
| `downloaded_at` | `TIMESTAMPTZ` | No | `now()` | Authorization time |

### 6.8 `submissions`

Metadata for every upload attempt, including rejected uploads.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `team_id` | `UUID` | No | — | Uploading team |
| `round_id` | `SMALLINT` | No | — | Current round |
| `stock_id` | `UUID` | No | — | Assigned stock |
| `assignment_id` | `UUID` | No | — | Validated assignment |
| `original_filename` | `VARCHAR(255)` | No | — | Sanitized filename |
| `storage_key` | `TEXT` | Yes | `NULL` | Optional private upload key |
| `file_hash` | `CHAR(64)` | No | — | SHA-256 digest |
| `file_size_bytes` | `BIGINT` | No | — | Uploaded bytes |
| `row_count` | `INTEGER` | Yes | `NULL` | Parsed data rows |
| `status` | `submission_status` | No | `'uploaded'` | Processing state |
| `validation_error_code` | `VARCHAR(100)` | Yes | `NULL` | Stable error code |
| `validation_error` | `TEXT` | Yes | `NULL` | Safe user-facing message |
| `submitted_at` | `TIMESTAMPTZ` | No | `now()` | Receipt time |
| `scored_at` | `TIMESTAMPTZ` | Yes | `NULL` | Successful scoring time |
| `processing_ms` | `INTEGER` | Yes | `NULL` | Processing duration |

Valid status flows:

```text
uploaded -> validating -> invalid
uploaded -> validating -> scoring -> scored
uploaded -> validating -> scoring -> failed
```

### 6.9 `prediction_rows`

Validated Round 1 and Round 2 predictions.

| Column | Type | Null | Description |
|---|---|---:|---|
| `submission_id` | `UUID` | No | Foreign key to `submissions.id` |
| `timestamp_index` | `INTEGER` | No | Challenge timestamp |
| `prediction` | `SMALLINT` | No | Exactly 0 or 1 |

Primary key: `(submission_id, timestamp_index)`.

### 6.10 `position_rows`

Validated Round 3 positions, if the trading-strategy round is retained.

| Column | Type | Null | Description |
|---|---|---:|---|
| `submission_id` | `UUID` | No | Foreign key to `submissions.id` |
| `timestamp_index` | `INTEGER` | No | Challenge timestamp |
| `position` | `DOUBLE PRECISION` | No | Strictly between -1.0 and 1.0 |

Primary key: `(submission_id, timestamp_index)`.

### 6.11 `scores`

One canonical scoring result per submission.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `submission_id` | `UUID` | No | — | Unique scored submission |
| `team_id` | `UUID` | No | — | Denormalized leaderboard key |
| `round_id` | `SMALLINT` | No | — | Denormalized leaderboard key |
| `stock_id` | `UUID` | No | — | Denormalized audit key |
| `score` | `NUMERIC(12,6)` | No | — | Final score |
| `is_valid` | `BOOLEAN` | No | `TRUE` | Leaderboard eligibility |
| `scoring_version` | `VARCHAR(100)` | No | — | Scorer version or commit |
| `score_details` | `JSONB` | Yes | `NULL` | Approved aggregate metrics only |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Score time |

The backend copies team, round, and stock IDs from the submission. It must never accept them from the client when creating a score.

### 6.12 `event_state`

A singleton row controlling the participant experience.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `SMALLINT` | No | `1` | Singleton key |
| `current_round_id` | `SMALLINT` | Yes | `NULL` | Active round |
| `flash_crash_active` | `BOOLEAN` | No | `FALSE` | Modal activation flag |
| `active_dataset_release_id` | `UUID` | Yes | `NULL` | Optional highlighted release |
| `flash_crash_message` | `TEXT` | Yes | `NULL` | Participant alert message |
| `flash_crash_triggered_at` | `TIMESTAMPTZ` | Yes | `NULL` | Activation time |
| `flash_crash_triggered_by` | `UUID` | Yes | `NULL` | Responsible administrator |
| `state_version` | `BIGINT` | No | `1` | Incremented on every change |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last state change |

The frontend can poll `/api/status` every five seconds. A new `state_version` tells it to immediately refresh state and show the modal when required.

### 6.13 `admin_users`

Administrator identities for protected event controls.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `username` | `VARCHAR(100)` | No | — | Unique login |
| `password_hash` | `TEXT` | No | — | Argon2id hash |
| `is_active` | `BOOLEAN` | No | `TRUE` | Access switch |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time |

An external identity provider with MFA is preferable for production administration.

### 6.14 `admin_audit_log`

Append-only record of administrative state changes.

| Column | Type | Null | Default | Description |
|---|---|---:|---|---|
| `id` | `BIGSERIAL` | No | Sequence | Primary key |
| `admin_id` | `UUID` | No | — | Acting administrator |
| `action` | `VARCHAR(100)` | No | — | Stable action code |
| `entity_type` | `VARCHAR(100)` | Yes | `NULL` | Affected entity type |
| `entity_id` | `TEXT` | Yes | `NULL` | Affected record ID |
| `details` | `JSONB` | Yes | `NULL` | Non-secret metadata |
| `ip_address` | `INET` | Yes | `NULL` | Source IP |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Action time |

Example actions: `TRIGGER_FLASH_CRASH`, `END_FLASH_CRASH`, `CHANGE_ROUND`, `ACTIVATE_DATASET`, and `INVALIDATE_SCORE`.

## 7. PostgreSQL DDL

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE round_phase AS ENUM (
    'scheduled', 'live', 'flash_crash', 'paused', 'completed'
);
CREATE TYPE submission_kind AS ENUM ('prediction', 'position');
CREATE TYPE dataset_kind AS ENUM ('standard', 'flash_crash');
CREATE TYPE submission_status AS ENUM (
    'uploaded', 'validating', 'invalid', 'scoring', 'scored', 'failed'
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_code VARCHAR(50) NOT NULL UNIQUE,
    team_name VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_team_code CHECK (btrim(team_code) <> ''),
    CONSTRAINT ck_team_name CHECK (btrim(team_name) <> '')
);

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_session_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_session_expiry CHECK (expires_at > created_at)
);

CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_code VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rounds (
    id SMALLSERIAL PRIMARY KEY,
    round_code VARCHAR(20) NOT NULL UNIQUE,
    round_name VARCHAR(100) NOT NULL,
    submission_type submission_kind NOT NULL,
    phase round_phase NOT NULL DEFAULT 'scheduled',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    max_submissions_per_team INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_round_time CHECK (ends_at > starts_at),
    CONSTRAINT ck_round_limit CHECK (max_submissions_per_team > 0)
);

CREATE UNIQUE INDEX uq_one_operational_round
    ON rounds ((phase IN ('live', 'flash_crash')))
    WHERE phase IN ('live', 'flash_crash');

CREATE TABLE team_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    round_id SMALLINT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_team_round_assignment UNIQUE (team_id, round_id)
);

CREATE TABLE dataset_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id SMALLINT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
    release_type dataset_kind NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    display_filename VARCHAR(255) NOT NULL,
    storage_key TEXT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    row_count INTEGER,
    available_from TIMESTAMPTZ NOT NULL,
    available_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dataset_release UNIQUE (
        round_id, stock_id, release_type, version
    ),
    CONSTRAINT ck_dataset_version CHECK (version > 0),
    CONSTRAINT ck_dataset_hash CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_dataset_size CHECK (file_size_bytes > 0),
    CONSTRAINT ck_dataset_rows CHECK (row_count IS NULL OR row_count >= 0),
    CONSTRAINT ck_dataset_window CHECK (
        available_until IS NULL OR available_until > available_from
    )
);

CREATE TABLE download_events (
    id BIGSERIAL PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    dataset_release_id UUID NOT NULL
        REFERENCES dataset_releases(id) ON DELETE RESTRICT,
    session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    round_id SMALLINT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL
        REFERENCES team_assignments(id) ON DELETE RESTRICT,
    original_filename VARCHAR(255) NOT NULL,
    storage_key TEXT,
    file_hash CHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    row_count INTEGER,
    status submission_status NOT NULL DEFAULT 'uploaded',
    validation_error_code VARCHAR(100),
    validation_error TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scored_at TIMESTAMPTZ,
    processing_ms INTEGER,
    CONSTRAINT ck_submission_hash CHECK (file_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_submission_size CHECK (file_size_bytes > 0),
    CONSTRAINT ck_submission_rows CHECK (row_count IS NULL OR row_count >= 0),
    CONSTRAINT ck_submission_processing CHECK (
        processing_ms IS NULL OR processing_ms >= 0
    )
);

CREATE TABLE prediction_rows (
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    timestamp_index INTEGER NOT NULL,
    prediction SMALLINT NOT NULL,
    PRIMARY KEY (submission_id, timestamp_index),
    CONSTRAINT ck_prediction_timestamp CHECK (timestamp_index >= 0),
    CONSTRAINT ck_prediction_value CHECK (prediction IN (0, 1))
);

CREATE TABLE position_rows (
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    timestamp_index INTEGER NOT NULL,
    position DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (submission_id, timestamp_index),
    CONSTRAINT ck_position_timestamp CHECK (timestamp_index >= 0),
    CONSTRAINT ck_position_value CHECK (position > -1.0 AND position < 1.0)
);

CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL UNIQUE
        REFERENCES submissions(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    round_id SMALLINT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
    score NUMERIC(12,6) NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    scoring_version VARCHAR(100) NOT NULL,
    score_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_state (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    current_round_id SMALLINT REFERENCES rounds(id) ON DELETE RESTRICT,
    flash_crash_active BOOLEAN NOT NULL DEFAULT FALSE,
    active_dataset_release_id UUID
        REFERENCES dataset_releases(id) ON DELETE RESTRICT,
    flash_crash_message TEXT,
    flash_crash_triggered_at TIMESTAMPTZ,
    flash_crash_triggered_by UUID
        REFERENCES admin_users(id) ON DELETE SET NULL,
    state_version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_event_singleton CHECK (id = 1),
    CONSTRAINT ck_event_version CHECK (state_version > 0),
    CONSTRAINT ck_flash_metadata CHECK (
        flash_crash_active = TRUE OR
        (flash_crash_triggered_at IS NULL AND
         flash_crash_triggered_by IS NULL AND
         flash_crash_message IS NULL)
    )
);

CREATE TABLE admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id TEXT,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_active
    ON auth_sessions (token_hash, expires_at)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_assignments_team_round
    ON team_assignments (team_id, round_id);
CREATE INDEX idx_dataset_lookup
    ON dataset_releases (
        round_id, stock_id, release_type, is_active, version DESC
    );
CREATE INDEX idx_downloads_team_time
    ON download_events (team_id, downloaded_at DESC);
CREATE INDEX idx_submissions_team_round_time
    ON submissions (team_id, round_id, submitted_at DESC);
CREATE INDEX idx_submissions_status
    ON submissions (status, submitted_at);
CREATE INDEX idx_submissions_hash
    ON submissions (team_id, round_id, file_hash);
CREATE INDEX idx_scores_leaderboard
    ON scores (round_id, is_valid, score DESC);
CREATE INDEX idx_admin_audit_time
    ON admin_audit_log (created_at DESC);

INSERT INTO event_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
```

## 8. Leaderboard view

The frontend needs only `team` and `score`. The view selects each team's highest valid score for each round and computes rank for internal or future use.

```sql
CREATE VIEW leaderboard AS
WITH best_scores AS (
    SELECT round_id, team_id, MAX(score) AS best_score
    FROM scores
    WHERE is_valid = TRUE
    GROUP BY round_id, team_id
)
SELECT
    bs.round_id,
    r.round_code,
    bs.team_id,
    t.team_name AS team,
    bs.best_score AS score,
    DENSE_RANK() OVER (
        PARTITION BY bs.round_id ORDER BY bs.best_score DESC
    ) AS rank
FROM best_scores AS bs
JOIN teams AS t ON t.id = bs.team_id
JOIN rounds AS r ON r.id = bs.round_id
WHERE t.is_active = TRUE;
```

API query:

```sql
SELECT team, score
FROM leaderboard
WHERE round_id = :current_round_id
ORDER BY rank, team;
```

## 9. Dashboard status query

```sql
SELECT
    es.state_version,
    now() AS server_time,
    r.id AS round_id,
    r.round_code,
    r.round_name,
    r.phase,
    r.ends_at,
    GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (r.ends_at - now())))::INTEGER
    ) AS time_remaining_seconds,
    es.flash_crash_active,
    es.flash_crash_message,
    s.stock_code,
    s.display_name AS stock_name
FROM event_state AS es
JOIN rounds AS r ON r.id = es.current_round_id
JOIN team_assignments AS ta
    ON ta.round_id = r.id
   AND ta.team_id = :authenticated_team_id
JOIN stocks AS s ON s.id = ta.stock_id
WHERE es.id = 1;
```

`time_remaining_seconds` is always calculated by PostgreSQL/FastAPI, never accepted from the browser.

## 10. Dataset download flow

1. Authenticate the session.
2. Load the current round from `event_state`.
3. Load the team's stock from `team_assignments`.
4. Select release type `flash_crash` when the flag is active; otherwise select `standard`.
5. Select the latest active release within its availability window.
6. Insert `download_events`.
7. Generate a signed URL valid for approximately two minutes, or stream the file.

```sql
SELECT dr.*
FROM dataset_releases AS dr
JOIN team_assignments AS ta
  ON ta.round_id = dr.round_id AND ta.stock_id = dr.stock_id
WHERE ta.team_id = :authenticated_team_id
  AND dr.round_id = :current_round_id
  AND dr.release_type = :release_type
  AND dr.is_active = TRUE
  AND dr.available_from <= now()
  AND (dr.available_until IS NULL OR dr.available_until > now())
ORDER BY dr.version DESC
LIMIT 1;
```

## 11. Upload and scoring transaction

1. Authenticate the team and derive `team_id` from the session.
2. Lock or consistently read `event_state` and the current round.
3. Reject uploads before the start, after the end, or while paused/completed.
4. Load the team's assignment; do not accept a client-supplied stock ID.
5. Enforce upload size, row count, and per-team submission limits.
6. Insert a `submissions` row and set status to `validating`.
7. Require the exact CSV columns for the round.
8. Reject missing values, duplicate timestamps, invalid types, non-finite numbers, and out-of-range values.
9. Insert normalized rows into `prediction_rows` or `position_rows`.
10. Set status to `scoring` and call the trusted server-side scorer.
11. Insert one score and set the submission to `scored` in a transaction.
12. Store safe validation errors with status `invalid`; never expose stack traces or validation answers.

Cross-table rules such as matching submission type to round type should be enforced in the service transaction and integration tests.

## 12. Flash Crash transaction

The admin trigger must be atomic:

1. Authenticate and authorize the administrator.
2. Lock the `event_state` singleton row.
3. Confirm every stock assigned in the current round has an active Flash Crash dataset.
4. Change the current round phase to `flash_crash`.
5. Set `flash_crash_active = TRUE`, alert text, activation time, and administrator.
6. Increment `state_version`.
7. Insert a `TRIGGER_FLASH_CRASH` audit record.
8. Commit together; roll back everything on failure.

The frontend's next status poll sees the new version and displays the full-screen modal.

## 13. Security requirements

- Hash passwords with Argon2id; never store or log plaintext credentials.
- Store only hashes of cryptographically random session tokens.
- Use parameterized SQL/ORM bindings everywhere.
- Derive team identity and assigned stock from the authenticated session.
- Keep storage private and issue only short-lived signed download URLs.
- Keep `master_validation.csv` inaccessible to the API's public routes.
- Never place validation answers or row-level comparisons in `score_details`.
- Apply strict file-size, row-count, and submission-rate limits.
- Sanitize filenames and generate storage keys server-side.
- Rate-limit login, polling, download, and upload endpoints.
- Protect admin endpoints with separate authorization and preferably MFA.
- Audit every round, dataset, Flash Crash, and score-validity change.

Recommended database roles:

- `quant_migrator` — owns schema and runs migrations only;
- `quant_api` — minimum privileges required by FastAPI;
- `quant_scorer` — optional isolated scoring-service role; and
- `quant_readonly` — access to approved reporting views only.

## 14. Required automated tests

### Authentication

- Invalid credentials create no session.
- Inactive teams cannot authenticate.
- Expired and revoked sessions are rejected.
- Raw tokens are absent from database records and logs.

### Dashboard and downloads

- A team sees only its assigned stock.
- A team cannot download a release for another stock.
- Standard data is selected before Flash Crash.
- Flash Crash data replaces standard data after activation.
- Countdown is server-derived, reaches zero, and never becomes negative.
- Every authorized download creates a download event.

### Uploads

- Uploads outside the active window are rejected.
- Submission limits are enforced safely under concurrent requests.
- Prediction rounds reject position files and vice versa.
- Missing, extra, duplicated, malformed, or out-of-range rows are rejected.
- A team cannot submit for another stock.
- Each scored submission has exactly one score.
- Invalid and failed submissions never enter the leaderboard.

### Leaderboard

- Only the best valid score per team appears.
- Invalidated scores and inactive teams are excluded.
- Ties receive equal rank.
- Output preserves the frontend's `team` and `score` keys.

### Flash Crash

- Only administrators can trigger or end it.
- Activation fails if an assigned stock lacks a Flash Crash dataset.
- Round phase and global state update in one transaction.
- `state_version` increments once per state change.
- An audit record is always created.

## 15. Decisions the team must finalize

- Maximum CSV size and row count.
- Maximum submissions per team and round.
- Best-score versus latest-score leaderboard policy.
- Tie-breaking policy beyond shared rank.
- Session duration and inactivity timeout.
- Dataset availability windows and download limits.
- Original-upload and audit-log retention periods.
- Whether Round 3 position uploads are included.
- Whether Flash Crash ends automatically or through an administrator.

These are event-policy decisions. Confirm them before generating the production Alembic migration and ORM models.
