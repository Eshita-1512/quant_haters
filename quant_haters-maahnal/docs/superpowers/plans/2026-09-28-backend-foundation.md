# Quant Challenge Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PostgreSQL-backed FastAPI service defined by the frozen Quant ML Trading Challenge specification.

**Architecture:** FastAPI exposes versioned `/api/v1` routes. SQLAlchemy 2.x models and Alembic migrations own PostgreSQL state; service modules hold authorization, validation, scoring orchestration, and Flash Crash transactions. Pydantic response models preserve the frozen frontend contract.

**Tech Stack:** Python 3.12, FastAPI, PostgreSQL 15+, SQLAlchemy 2.x, Alembic, Pydantic v2, psycopg 3, PyJWT, pwdlib/Argon2, pytest, pytest-asyncio, HTTPX.

**Spec:** Frozen `spec.md` supplied by the project owner, plus `quant_challenge_backend_database_schema.md` created during schema design.

## Global Constraints

- API base path is `/api/v1`.
- There are 40 teams, five stocks, and at most 10 submissions per team per round.
- Participant timestamps are local integers `1..50`.
- Round 1 and 2 uploads contain `timestamp,prediction` and optional `confidence`; confidence defaults to `0.5`.
- Round 3 uploads contain `timestamp,signal`; signal is inclusive from `-1.0` through `1.0`.
- Bad participant input returns HTTP 400 with a safe message, never an unhandled 500.
- Passwords use Argon2 hashes and authentication returns JWTs.
- Secret validation files remain outside public routes and static directories.
- Flash Crash closes Round 1, opens Round 2, and releases pre-generated crash data atomically.

## Review Focus

- Concurrent submission requests must not bypass the 10-submission limit.
- JWTs for inactive teams, expired sessions, and wrong roles must be rejected.
- A team must never download or submit against another team's assigned window.
- Flash Crash must roll back if any team lacks its Round 2 dataset.
- Malformed encodings, duplicate timestamps, NaN, infinity, and extra CSV columns must produce safe 400 responses.

---

### Task 1: Application foundation and health endpoint

**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `app/config.py`
- Create: `tests/test_health.py`

**Interfaces:**
- Produces: `app.main.create_app() -> FastAPI`
- Produces: `GET /health -> {"status": "ok"}`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from app.main import create_app


def test_health_returns_ok() -> None:
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pytest tests/test_health.py -v`  
Expected: collection fails because `app.main` does not exist.

- [ ] **Step 3: Add the minimal application**

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Quant Challenge API", version="1.0.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

Configure `pyproject.toml` with runtime dependencies and pytest settings. Add `.env`, virtual environments, caches, coverage data, and IDE files to `.gitignore`. Put safe example values only in `.env.example`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `pytest tests/test_health.py -v`  
Expected: one passing test.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml .env.example .gitignore app tests
git commit -m "feat: scaffold FastAPI backend"
```

### Task 2: PostgreSQL models and initial Alembic migration

**Files:**
- Create: `app/database.py`
- Create: `app/models.py`
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/0001_initial_schema.py`
- Create: `tests/test_models.py`

**Interfaces:**
- Produces: `Base`, `get_db()`, and SQLAlchemy models for teams, sessions, stocks, rounds, assignments, dataset releases, downloads, submissions, prediction rows, signal rows, scores, event state, admins, and audit records.
- Produces: schema constraint names used by later service-level error translation.

- [ ] **Step 1: Write failing model-contract tests**

```python
from app.models import PredictionRow, SignalRow, TeamAssignment


def test_assignment_exposes_team_windows() -> None:
    names = set(TeamAssignment.__table__.columns.keys())
    assert {"train_start", "train_end", "predict_start", "predict_end"} <= names


def test_prediction_stores_confidence() -> None:
    assert "confidence" in PredictionRow.__table__.columns


def test_round_three_uses_signal() -> None:
    assert "signal" in SignalRow.__table__.columns
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest tests/test_models.py -v`  
Expected: import failure because the models do not exist.

- [ ] **Step 3: Implement models and migration**

Implement all fourteen approved tables with foreign keys, unique constraints, timestamps, enums, and indexes. Required corrections from the frozen spec:

```python
confidence: Mapped[Decimal] = mapped_column(
    Numeric(4, 3), nullable=False, server_default="0.5"
)
signal: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
train_start: Mapped[int] = mapped_column(Integer, nullable=False)
train_end: Mapped[int] = mapped_column(Integer, nullable=False)
predict_start: Mapped[int] = mapped_column(Integer, nullable=False)
predict_end: Mapped[int] = mapped_column(Integer, nullable=False)
```

Add checks for confidence `0..1`, signal `-1..1`, local timestamp `1..50`, ordered windows, positive limits, one score per submission, and one assignment per team per round. Link each `dataset_release` to `assignment_id`, because files are team-window-specific.

- [ ] **Step 4: Verify models and migrations**

Run: `pytest tests/test_models.py -v`  
Expected: all model-contract tests pass.

Run: `alembic upgrade head` against a disposable PostgreSQL database.  
Expected: migration exits successfully and creates all tables.

- [ ] **Step 5: Commit**

```bash
git add app/database.py app/models.py alembic.ini alembic tests/test_models.py
git commit -m "feat: add PostgreSQL schema"
```

### Task 3: JWT authentication and team profile API

**Files:**
- Create: `app/security.py`
- Create: `app/schemas/auth.py`
- Create: `app/schemas/team.py`
- Create: `app/routers/auth.py`
- Create: `app/routers/team.py`
- Create: `tests/test_auth.py`
- Create: `tests/test_team_api.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: `hash_password()`, `verify_password()`, `create_access_token()`, `get_current_team()`
- Produces: `POST /api/v1/auth/login`
- Produces: `GET /api/v1/team/me`

- [ ] **Step 1: Write failing authentication tests**

```python
def test_login_returns_jwt_for_valid_team(client, active_team) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"team_id": active_team.team_code, "password": "correct-password"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert response.json()["token_type"] == "bearer"


def test_inactive_team_cannot_login(client, inactive_team) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"team_id": inactive_team.team_code, "password": "correct-password"},
    )
    assert response.status_code == 401
```

- [ ] **Step 2: Verify RED**

Run: `pytest tests/test_auth.py tests/test_team_api.py -v`  
Expected: routes are missing.

- [ ] **Step 3: Implement authentication and team profile**

JWT claims must include `sub`, `role="team"`, `jti`, `iat`, and `exp`. Persist a hash of `jti` in `auth_sessions` for revocation. `/team/me` returns team code/name, assigned stock, and train/predict window values for the current round.

- [ ] **Step 4: Verify GREEN and security cases**

Run: `pytest tests/test_auth.py tests/test_team_api.py -v`  
Expected: valid login/profile tests pass; invalid password, inactive team, expired token, revoked session, and cross-team cases pass.

- [ ] **Step 5: Commit**

```bash
git add app/security.py app/schemas app/routers app/main.py tests
git commit -m "feat: add JWT team authentication"
```

### Task 4: Authorized team dataset downloads

**Files:**
- Create: `app/services/datasets.py`
- Modify: `app/routers/team.py`
- Create: `tests/test_team_data.py`

**Interfaces:**
- Produces: `select_team_dataset(db, team_id, round_id) -> DatasetRelease`
- Produces: `GET /api/v1/team/data`

- [ ] **Step 1: Write failing authorization tests**

```python
def test_team_receives_only_its_assignment_release(client, team_token, release) -> None:
    response = client.get(
        "/api/v1/team/data", headers={"Authorization": f"Bearer {team_token}"}
    )
    assert response.status_code == 200
    assert response.json()["filename"] == release.display_filename


def test_flash_crash_selects_round_two_release(client, team_token, crash_state) -> None:
    response = client.get(
        "/api/v1/team/data", headers={"Authorization": f"Bearer {team_token}"}
    )
    assert response.status_code == 200
    assert "round2" in response.json()["filename"]
```

- [ ] **Step 2: Verify RED**

Run: `pytest tests/test_team_data.py -v`  
Expected: endpoint is missing.

- [ ] **Step 3: Implement authorized release selection**

Query by authenticated team assignment, current round, active flag, and availability window. Record a `download_event`, then return a short-lived signed URL through an injected storage adapter. Tests use a deterministic fake adapter, not a public bucket.

- [ ] **Step 4: Verify GREEN**

Run: `pytest tests/test_team_data.py -v`  
Expected: own-release, wrong-team, expired-release, and Flash Crash selection tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/datasets.py app/routers/team.py tests/test_team_data.py
git commit -m "feat: authorize team dataset downloads"
```

### Task 5: CSV submission validation and scoring response

**Files:**
- Create: `app/csv_validation.py`
- Create: `app/services/submissions.py`
- Create: `app/services/scoring.py`
- Create: `app/schemas/submission.py`
- Create: `app/routers/submissions.py`
- Create: `tests/test_csv_validation.py`
- Create: `tests/test_submit_api.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: `validate_submission_csv(content: bytes, round_number: int) -> list[PredictionInput | SignalInput]`
- Produces: `POST /api/v1/submit/round/{round_num}`

- [ ] **Step 1: Write failing CSV tests**

```python
def test_round_one_accepts_optional_confidence() -> None:
    rows = validate_submission_csv(
        b"timestamp,prediction\n" + b"\n".join(f"{i},{i % 2}".encode() for i in range(1, 51)),
        round_number=1,
    )
    assert len(rows) == 50
    assert all(row.confidence == Decimal("0.5") for row in rows)


def test_round_three_accepts_signal_boundaries() -> None:
    csv = b"timestamp,signal\n1,-1.0\n" + b"\n".join(
        f"{i},0.0".encode() for i in range(2, 50)
    ) + b"\n50,1.0"
    rows = validate_submission_csv(csv, round_number=3)
    assert rows[0].signal == Decimal("-1.0")
    assert rows[-1].signal == Decimal("1.0")
```

- [ ] **Step 2: Verify RED**

Run: `pytest tests/test_csv_validation.py tests/test_submit_api.py -v`  
Expected: validator and route are missing.

- [ ] **Step 3: Implement strict validation and transactional submission**

Require `.csv`, exact required columns with optional confidence only for R1/R2, exactly 50 rows, unique timestamps exactly `1..50`, finite numeric values, binary predictions, confidence `0..1`, and signal `-1..1`. Lock/count team submissions before inserting so concurrent requests cannot exceed 10. Translate every validation failure into the exact safe message from the frozen spec.

Return:

```python
{
    "status": "success",
    "team_id": team.team_code,
    "round": round_num,
    "score": result.score,
    "balanced_accuracy": result.balanced_accuracy,
    "mcc": result.mcc,
    "submission_number": submission_number,
    "submissions_remaining": limit - submission_number,
}
```

- [ ] **Step 4: Verify GREEN and full validation matrix**

Run: `pytest tests/test_csv_validation.py tests/test_submit_api.py -v`  
Expected: success, malformed encoding, extra/missing columns, wrong row count, duplicate/out-of-window timestamps, NaN/infinity, invalid prediction/confidence/signal, closed round, wrong assignment, and concurrent limit tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/csv_validation.py app/services app/schemas app/routers app/main.py tests
git commit -m "feat: validate and score submissions"
```

### Task 6: Leaderboard, participant status, and Flash Crash administration

**Files:**
- Create: `app/schemas/event.py`
- Create: `app/routers/event.py`
- Create: `app/routers/leaderboard.py`
- Create: `app/routers/admin.py`
- Create: `app/services/events.py`
- Create: `tests/test_status.py`
- Create: `tests/test_leaderboard.py`
- Create: `tests/test_flash_crash.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: `GET /api/v1/event/status` for participant timer/modal polling
- Produces: `GET /api/v1/leaderboard`
- Produces: `POST /api/v1/admin/flash-crash`
- Produces: `GET /api/v1/admin/status`

- [ ] **Step 1: Write failing event tests**

```python
def test_status_uses_server_time(client, team_token, live_round) -> None:
    response = client.get(
        "/api/v1/event/status", headers={"Authorization": f"Bearer {team_token}"}
    )
    assert response.status_code == 200
    assert response.json()["time_remaining_seconds"] >= 0


def test_flash_crash_switches_round_atomically(client, admin_token, prepared_crash_data) -> None:
    response = client.post(
        "/api/v1/admin/flash-crash",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    status = client.get(
        "/api/v1/event/status",
        headers={"Authorization": f"Bearer {prepared_crash_data.team_token}"},
    ).json()
    assert status["current_round"] == "R2"
    assert status["flash_crash_active"] is True
```

- [ ] **Step 2: Verify RED**

Run: `pytest tests/test_status.py tests/test_leaderboard.py tests/test_flash_crash.py -v`  
Expected: routes are missing.

- [ ] **Step 3: Implement queries and event transaction**

Leaderboard returns each active team's best valid score for the current round, descending. Participant status uses database/server time. Flash Crash verifies an R2 dataset for every active assignment, locks event state, closes R1, opens R2, increments state version, and appends an admin audit entry in one transaction. Missing data causes a full rollback.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `pytest tests/test_status.py tests/test_leaderboard.py tests/test_flash_crash.py -v`  
Expected: timer, ranking, ties, role authorization, complete activation, and rollback tests pass.

Run: `pytest -v`  
Expected: the entire suite passes with no warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add app tests
git commit -m "feat: add leaderboard and event controls"
```

### Task 7: Operational documentation and final verification

**Files:**
- Create: `README.md`
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `scripts/seed_demo.py`
- Create: `tests/test_openapi_contract.py`

**Interfaces:**
- Produces: repeatable local PostgreSQL/API startup and documented pgAdmin connection values.

- [ ] **Step 1: Write failing OpenAPI contract test**

```python
def test_frozen_routes_exist(client) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert {
        "/api/v1/auth/login",
        "/api/v1/team/me",
        "/api/v1/team/data",
        "/api/v1/submit/round/{round_num}",
        "/api/v1/leaderboard",
        "/api/v1/event/status",
        "/api/v1/admin/flash-crash",
        "/api/v1/admin/status",
    } <= set(paths)
```

- [ ] **Step 2: Verify the contract test fails if any route is absent**

Run: `pytest tests/test_openapi_contract.py -v`  
Expected: failure naming any missing route.

- [ ] **Step 3: Add local operations files**

Document environment setup, migrations, tests, API startup, PostgreSQL connection, pgAdmin registration, seed command, and safe secret handling. Docker Compose starts PostgreSQL and the API; pgAdmin remains an optional external GUI, not an application dependency.

- [ ] **Step 4: Run final verification**

Run: `pytest -v`  
Expected: all tests pass.

Run: `alembic upgrade head` against a clean database.  
Expected: all migrations apply successfully.

Run: `python -m compileall app tests scripts`  
Expected: no syntax failures.

- [ ] **Step 5: Commit**

```bash
git add README.md docker-compose.yml Dockerfile scripts tests
git commit -m "docs: add backend development workflow"
```
