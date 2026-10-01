# Member 4 Backend — Final Review and Correction Specification

**Project:** DataZen Quant Challenge Backend  
**Owner:** Member 4 — Backend and Database  
**Backend:** FastAPI + PostgreSQL + SQLAlchemy + Alembic  
**Source review:** `member4_action_items.md` and the current `maahnal` branch  
**Purpose:** Final approval document describing what is already correct, what must change, and the required behavior after the corrections.

---

## 1. Scope

This specification covers only the backend corrections requested in `member4_action_items.md`:

1. Team-specific validation target lookup
2. Full real-event seeding — deferred until datasets are finalized
3. Public/private leaderboard separation
4. Administrator-only R3 final secret backtest
5. Submission rate limiting
6. Participant score visibility
7. Configurable Flash Crash message
8. Revocable administrator tokens
9. Production CORS origin configuration

Existing functionality that is already correct remains unchanged unless one of these corrections directly requires an update.

---

## 2. Current Backend Components That Are Correct

The following parts of the current backend are valid and require no redesign.

### 2.1 Application architecture

- FastAPI application with versioned `/api/v1` routes
- PostgreSQL database accessed through SQLAlchemy 2.x
- Alembic migration management
- Pydantic request and response validation
- Docker and Docker Compose development setup
- Environment-based configuration through `.env`
- Health endpoint at `GET /health`

### 2.2 Team authentication

- Team login uses Argon2 password hashes.
- Team authentication returns signed JWT bearer tokens.
- Team JWTs include identity, role, issue time, expiry, and token ID claims.
- A hash of every issued team token is stored in `auth_sessions`.
- Expired, revoked, inactive-team, wrong-role, and invalid team tokens are rejected.
- Raw passwords and raw JWTs are never stored in PostgreSQL.

No correction is needed for the team authentication flow.

### 2.3 Team assignments and private windows

- Every team is assigned to a stock for each round.
- `team_assignments` stores the training and prediction windows.
- Participants submit local timestamps `1..50`.
- The backend maps those timestamps to the authenticated team's assigned master-data window.
- Dataset releases are tied to a team assignment and round.
- Database constraints prevent a release from referring to an assignment from another round.

No correction is needed to the assignment-window model.

### 2.4 Dataset downloads

- Dataset selection is based on the authenticated team's assignment.
- Standard and Flash Crash datasets are selected according to event state.
- Download links are short-lived and cryptographically signed.
- Expired or modified signatures are rejected.
- Storage keys cannot escape the configured private-data directory.
- Dataset files are not exposed as public static files.
- Download activity is recorded.

No correction is needed to dataset download authorization.

### 2.5 CSV validation

The following validation behavior is already correct:

- Only `.csv` uploads are accepted.
- Upload size is limited.
- Files must use UTF-8-compatible encoding.
- Rounds 1 and 2 require `timestamp,prediction`; `confidence` is optional.
- Round 3 requires `timestamp,signal`.
- Exactly 50 data rows are required.
- Timestamps must be unique and cover local values `1..50`.
- Predictions must be `0` or `1`.
- Confidence must be between `0` and `1`.
- Signal must be between `-1` and `1`, inclusive.
- NaN, infinity, duplicate headers, extra fields, missing fields, and malformed rows are rejected safely.
- Participant validation failures return HTTP 400 instead of an unhandled error.

One correction is still required: target lookup must filter by both team and stock. That correction is defined in Section 3.1.

### 2.6 Scoring formulas and storage

- Rounds 1 and 2 use the frozen balanced-accuracy/MCC formula.
- Round 3 uses the frozen signal formula with Sharpe ratio, drawdown, and transaction-cost penalty.
- Normalized prediction or signal rows are stored in PostgreSQL.
- One score is stored per submission.
- Scores retain a scoring-version value and metric details.
- The ten-submission limit is enforced transactionally per team and round.

The formulas and internal score storage do not need correction. Only participant score visibility and request frequency require changes.

### 2.7 Event status and Flash Crash transaction

- Participant event status uses server time.
- Status includes current round, phase, end time, remaining seconds, assigned stock, and Flash Crash state.
- Flash Crash activation locks event state.
- Activation checks that every active Round 2 assignment has an available Flash Crash dataset.
- Round 1 is closed and Round 2 is opened atomically.
- Repeated Flash Crash activation is rejected.
- An administrator audit entry is written.

The transaction is correct. Only the alert message must become configurable.

### 2.8 Existing development seeder

`scripts/seed_demo.py` already creates a complete development environment:

- 40 demo teams
- five demo stocks
- R1, R2, and R3
- team assignments and windows
- standard and Flash Crash dataset releases
- event state
- administrator account
- demo validation data

This script remains the development/demo seeder. It is not the real-event seeder and must not be used with production event data.

### 2.9 Current migrations and verification

- The schema currently has a valid Alembic migration chain through revision `0002_assignment_round_integrity`.
- PostgreSQL DDL generation succeeds.
- The existing automated suite passes.

New database structures in this specification must be introduced through a new Alembic revision. Existing migrations must not be rewritten.

---

## 3. Required Corrections

### 3.1 Team-specific validation targets — Critical

#### Current problem

`_validation_targets` currently selects rows from `master_validation.csv` using only `stock_id`. Multiple teams can share a stock, but their hidden targets may differ. A team could therefore be scored against another team's target rows.

#### Required correction

The validation file must contain:

```text
team_id,stock_id,master_timestamp,target_r1r2,target_r3
```

Target lookup must require both:

- `row["team_id"] == team.team_code`
- `row["stock_id"] == stock.stock_code`

The scoring call must pass the authenticated team's `team_code` into `_validation_targets`.

#### Required behavior

- Two teams assigned to the same stock can receive different targets.
- Missing target rows for a team/stock/window must produce a controlled server configuration error and must not score against another team's rows.
- Development validation data generated by `seed_demo.py` must also include `team_id`.

---

### 3.2 Full real-event seeding script — Deferred by project owner

#### Current situation

`seed_demo.py` is complete for development, but it generates fake teams, timestamps, datasets, and validation values. It must remain separate from real-event setup.

#### Approval ruling

Implementation of `scripts/seed_event.py` is explicitly deferred until the real datasets are finalized. No real-event seeding code, manifest format, or production event values will be added in this implementation cycle.

The requirements below remain recorded for the later dataset-finalization cycle.

#### Future required correction

Create `scripts/seed_event.py` for real event data. It must populate:

- `stocks`
- `rounds` R1, R2, and R3 using supplied real timestamps
- `team_assignments`
- `dataset_releases` pointing to CSV files generated by Member 1
- singleton `event_state` with `id = 1`

#### Required inputs

The real-event seed process must receive, rather than invent:

- stock codes and names
- R1/R2/R3 start and end timestamps
- round phases and submission types
- team-to-stock assignments
- training and prediction windows
- standard dataset paths
- Flash Crash dataset paths
- availability timestamps

#### Required validation

Before any database commit, the script must reject:

- missing teams or stocks
- missing R1/R2/R3 definitions
- invalid or overlapping window bounds
- missing dataset files
- assignment/round mismatches
- duplicate team/round assignments
- absent Flash Crash releases for active Round 2 assignments

The script must calculate file size and SHA-256 metadata from the actual files.

---

### 3.3 Public and private leaderboard split — Critical

#### Current problem

The existing leaderboard is authenticated as a team endpoint and queries current live scores. Showing live scores to teams allows repeated submissions to reveal information about the scoring behavior.

#### Required API behavior

##### Public frozen leaderboard

```http
GET /api/v1/leaderboard
```

- No JWT is required.
- Returns only the most recently published snapshot.
- New submissions do not change this response automatically.
- Before the first snapshot, it returns an empty list.

##### Administrator live leaderboard

```http
GET /api/v1/admin/leaderboard
Authorization: Bearer <admin-token>
```

- Requires a valid administrator session.
- Returns live rankings for the current round.
- Uses each team's best valid score for that round.

##### Publish public snapshot

```http
POST /api/v1/admin/leaderboard/snapshot
Authorization: Bearer <admin-token>
```

- Requires a valid administrator session.
- Copies the current live rankings into a new immutable public snapshot.
- Publication must be atomic: the public endpoint must never show a partially written snapshot.
- Adds an administrator audit-log entry.

#### Leaderboard entry contract

```json
{
  "rank": 1,
  "team": "Team 01",
  "score": "0.850000",
  "submissions": 3
}
```

`rank` is one-indexed. `submissions` is the team's number of submissions in the ranked round.

#### Required persistence

PostgreSQL must store:

- snapshot metadata: snapshot ID, round, publishing administrator, publication timestamp
- snapshot entries: rank, team, frozen score, and submission count

Old snapshots remain stored for audit purposes; the public route reads only the newest complete snapshot.

---

### 3.4 Administrator R3 final secret backtest — Critical

#### Required endpoint

```http
POST /api/v1/admin/final-backtest
Authorization: Bearer <admin-token>
```

#### Required behavior

- Administrator authentication is mandatory.
- The endpoint operates only on Round 3 submissions.
- It selects each active team's best valid Round 3 submission according to the normal R3 score.
- It loads signals stored for that selected submission.
- It maps local timestamps through that team's R3 assignment.
- It loads targets from a separately configured hidden validation file.
- Hidden targets are filtered by both `team_id` and `stock_id`.
- It reuses the frozen Round 3 scoring formula.
- It returns teams ranked by the final hidden-slice score.
- It records an administrator audit entry for the backtest execution.

#### Hidden validation file contract

```text
team_id,stock_id,master_timestamp,target_r3
```

The hidden file path must come from `HIDDEN_VALIDATION_PATH`. It must remain outside public/static storage and must never be returned by an API.

#### Response contract

```json
{
  "status": "success",
  "round": "R3",
  "rankings": [
    {
      "rank": 1,
      "team": "Team 01",
      "score": 2.1482
    }
  ]
}
```

If R3, a selected submission, an assignment, or the required hidden targets are unavailable, the endpoint must fail safely and must not return a partial winner list.

---

### 3.5 Submission rate limiting — Important

#### Required behavior

```http
POST /api/v1/submit/round/{round_num}
```

- A team may start at most one submission request in any 60-second interval.
- The rule applies per team, across submission rounds.
- Enforcement must use PostgreSQL so it works across multiple API workers or servers.
- The rate-limit record must be locked and updated transactionally before expensive CSV parsing or scoring.
- A rejected request returns HTTP 429 with a safe message and retry information.
- The existing maximum of ten submissions per team per round remains unchanged.

Required error shape:

```json
{
  "status": "error",
  "code": 429,
  "message": "Only one submission is allowed every 60 seconds.",
  "retry_after_seconds": 42
}
```

---

### 3.6 Participant score visibility — Important

#### Final decision for approval

Raw scoring feedback will be hidden from the immediate participant submission response.

The backend continues calculating and storing all metrics internally, but the response must not contain:

- `score`
- `balanced_accuracy`
- `mcc`
- Sharpe ratio
- drawdown
- transaction-cost penalty

#### Participant success response

```json
{
  "status": "success",
  "team_id": "T01",
  "round": 1,
  "submission_number": 3,
  "submissions_remaining": 7
}
```

Participants receive ranking feedback only through the public frozen leaderboard after an administrator publishes a snapshot.

Administrator live leaderboard and final-backtest responses may include scores because they require an administrator token.

---

### 3.7 Configurable Flash Crash message — Important

#### Required endpoint contract

```http
POST /api/v1/admin/flash-crash
Authorization: Bearer <admin-token>
Content-Type: application/json
```

Optional body:

```json
{
  "message": "Volatility spike detected. Download the emergency dataset now."
}
```

#### Required behavior

- When a non-empty message is supplied, store and expose it through event status.
- When the body or message is omitted, retain the existing default message:

```text
Market disruption detected. Download the new dataset.
```

- The message must have a bounded length and reject empty/whitespace-only overrides.
- The existing atomic Flash Crash checks and transition behavior remain unchanged.

---

### 3.8 Revocable administrator sessions — Important

#### Current problem

Administrator JWTs are currently valid based only on signature, expiry, role, and administrator status. There is no persisted administrator session that can be revoked.

#### Required correction

Add administrator session persistence equivalent to team session security.

For every administrator login:

- create the JWT
- hash the complete token with SHA-256
- store the token hash, administrator ID, expiry, creation time, and nullable revocation time

For every administrator-protected request:

- validate JWT signature and expiry
- require role `admin`
- require a matching stored token hash
- require the stored session to belong to the JWT subject
- reject revoked or expired sessions
- reject inactive administrators

The database must store token hashes only, never raw administrator JWTs.

---

### 3.9 Production CORS origin — Important

#### Required correction

The deployment environment must supply the real frontend URL through:

```text
PRODUCTION_FRONTEND_URL=https://frontend.example.com
```

When non-empty, this URL must be added to the allowed CORS origins along with local development origins.

The real production URL must be placed in the deployment `.env` before deployment. It must not be guessed or hardcoded in source control.

Allowed methods and headers remain restricted to those already required by the frontend.

---

## 4. Database Changes

A new Alembic revision must be added after `0002_assignment_round_integrity`.

### 4.1 Administrator sessions

New table: `admin_auth_sessions`

| Column | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `admin_id` | UUID | FK to `admin_users.id`, cascade delete |
| `token_hash` | varchar(64) | Unique, required |
| `expires_at` | timestamptz | Required |
| `revoked_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Server-generated |

### 4.2 Submission rate limit

New table: `submission_rate_limits`

| Column | Type | Rule |
|---|---|---|
| `team_id` | UUID | Primary key and FK to `teams.id`, cascade delete |
| `last_attempt_at` | timestamptz | Required |

The single row per team is locked during admission checks.

### 4.3 Leaderboard snapshots

New table: `leaderboard_snapshots`

| Column | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `round_id` | integer | FK to `rounds.id` |
| `published_by_admin_id` | UUID | FK to `admin_users.id` |
| `created_at` | timestamptz | Publication time |

New table: `leaderboard_snapshot_entries`

| Column | Type | Rule |
|---|---|---|
| `snapshot_id` | UUID | Composite primary key, FK to snapshot, cascade delete |
| `rank` | integer | Composite primary key, one-indexed |
| `team_id` | UUID | FK to `teams.id` |
| `team_name` | varchar(150) | Frozen display name |
| `score` | numeric(12,6) | Frozen score |
| `submissions` | integer | Frozen submission count |

---

## 5. Final API Surface

### Public

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Service health |
| `POST` | `/api/v1/auth/login` | Team login |
| `POST` | `/api/v1/auth/admin/login` | Administrator login |
| `GET` | `/api/v1/leaderboard` | Latest frozen public snapshot |

### Team JWT required

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/team/me` | Team and assignment profile |
| `GET` | `/api/v1/team/data` | Authorized dataset link |
| `GET` | `/api/v1/event/status` | Timer, current round, Flash Crash alert |
| `POST` | `/api/v1/submit/round/{round_num}` | Rate-limited validation and scoring |

### Administrator JWT and persisted session required

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/status` | Live operational status |
| `GET` | `/api/v1/admin/leaderboard` | Live private leaderboard |
| `POST` | `/api/v1/admin/leaderboard/snapshot` | Publish public rankings |
| `POST` | `/api/v1/admin/flash-crash` | Trigger Flash Crash with optional message |
| `POST` | `/api/v1/admin/final-backtest` | Run hidden R3 winner backtest |

---

## 6. Error Handling Requirements

- Participant input errors return safe HTTP 400 responses.
- Rate-limit rejection returns HTTP 429 and `retry_after_seconds`.
- Missing or invalid team JWT returns HTTP 401.
- Missing, invalid, expired, revoked, or inactive-admin JWT returns HTTP 401.
- Incomplete event seed input must fail before committing partial state.
- Missing hidden final-backtest targets must fail the complete backtest rather than return partial results.
- Snapshot publication and Flash Crash activation must be transactional.
- Secret validation paths and contents must never be exposed in responses or logs.

---

## 7. Required Tests

The correction is complete only when automated tests prove:

1. Validation targets differ correctly for two teams sharing one stock.
2. Real-event seeding rejects incomplete input and produces all required event rows from valid input.
3. Public leaderboard remains unchanged after new submissions until snapshot publication.
4. Admin leaderboard shows current live best scores and submission counts.
5. Snapshot publication writes a complete ranked snapshot atomically.
6. Final backtest selects one best R3 submission per team and uses team-specific hidden targets.
7. A second submission inside 60 seconds returns HTTP 429.
8. Submission responses contain no raw score metrics.
9. Flash Crash uses an administrator-supplied message and preserves the default when omitted.
10. Administrator login creates a stored session and revoked/expired sessions are rejected.
11. A configured production frontend URL passes CORS preflight.
12. Alembic reports one migration head and generates valid PostgreSQL DDL.
13. The entire existing suite remains green.

---

## 8. Deployment Values That Must Be Supplied

The code must not invent the following values. They must be provided before real deployment:

- actual R1 start/end timestamps
- actual R2 start/end timestamps
- actual R3 start/end timestamps
- Member 1's team assignment and prediction-window data
- Member 1's standard dataset paths
- Member 1's Flash Crash dataset paths
- normal team-specific validation CSV path
- hidden final-backtest CSV path
- production frontend URL
- production database credentials
- production JWT secret

Local/demo defaults remain for development only.

---

## 9. Explicitly Out of Scope

The following are not requested by `member4_action_items.md` and will not be added as part of this correction:

- frontend changes
- changes to the frozen scoring formulas
- changing the maximum of ten submissions per round
- automatic periodic leaderboard publication
- public final-backtest access
- public administrator information
- deployment to a hosting provider
- merging into `main`
- pushing changes to GitHub unless separately requested

---

## 10. Approval Checklist

Approval of this specification confirms:

- [ ] Validation data is team-specific and must use `team_id` plus `stock_id`.
- [ ] `seed_demo.py` remains for development; `seed_event.py` is deferred until datasets are finalized.
- [ ] The public leaderboard is frozen and unauthenticated.
- [ ] Live rankings and snapshot publication are administrator-only.
- [ ] R3 final winners are determined by an administrator-only hidden backtest.
- [ ] Submit requests are limited to one per team per 60 seconds.
- [ ] Immediate participant responses hide all raw score metrics.
- [ ] Flash Crash accepts an optional administrator message.
- [ ] Administrator JWTs require stored, revocable sessions.
- [ ] The production frontend URL is supplied through deployment configuration.
- [ ] No unrelated functionality will be implemented or pushed.
