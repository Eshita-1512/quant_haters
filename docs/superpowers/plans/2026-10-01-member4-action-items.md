# Member 4 Backend Action Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the nine backend changes in `member4_action_items.md` without unrelated behavior changes.

**Architecture:** Extend the existing FastAPI/PostgreSQL service with team-specific validation lookup, manifest-driven real-event seeding, persisted public leaderboard snapshots, admin-only live rankings and R3 final backtesting, database-backed submission throttling, configurable Flash Crash messaging, and revocable admin sessions. Alembic migrations own all new persistence.

**Tech Stack:** FastAPI, PostgreSQL, SQLAlchemy 2.x, Alembic, Pydantic v2, PyJWT, pytest.

**Spec:** `/Users/maahnalchauhan/Downloads/member4_action_items.md`

## Global Constraints

- Implement only items explicitly listed in the action-items document.
- Validation targets must be selected by both `team_id` and `stock_id`.
- Public rankings must be frozen until an administrator publishes a snapshot.
- Live rankings, snapshot publication, final backtest, and Flash Crash control require an admin JWT.
- Submit requests are limited to one per team per 60 seconds.
- Immediate submission responses do not expose score metrics.
- Real event values and production URLs come from configuration; no invented event values are committed.

## Review Focus

- A team must never be scored with another team's validation targets.
- Publishing a new leaderboard snapshot must atomically replace the public view.
- Rate limiting must remain correct across multiple API workers.
- Revoked/expired admin sessions must fail authorization.
- Final backtesting must use only the best R3 submission per active team and hidden targets.

---

### Task 1: Team-specific validation targets

**Files:**
- Modify: `app/services/submissions.py`
- Modify: `scripts/seed_demo.py`
- Test: `tests/test_submission_service.py`
- Test: `tests/test_seed_demo.py`

**Interfaces:**
- Produces: `_validation_targets(team_code, stock_code, start, round_number, path=None)`.

- [ ] Write failing tests proving two teams assigned the same stock receive different targets.
- [ ] Run those tests and verify they fail because `team_id` is ignored.
- [ ] Filter validation rows by both `team_id` and `stock_id`, pass `team.team_code` from `process_submission`, and include `team_id` in demo validation data.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 2: Real-event seeding — Deferred

The project owner explicitly deferred `scripts/seed_event.py` until the real datasets are finalized. No implementation steps are executed for this task in the current cycle.

### Task 3: Frozen public and live admin leaderboards

**Files:**
- Modify: `app/models.py`
- Create: `alembic/versions/0003_member4_event_controls.py`
- Modify: `app/schemas/leaderboard.py`
- Modify: `app/routers/leaderboard.py`
- Modify: `app/routers/admin.py`
- Test: `tests/test_leaderboard_api.py`
- Test: `tests/test_admin_api.py`
- Test: `tests/test_migration_contract.py`

**Interfaces:**
- Produces: public `GET /api/v1/leaderboard` with no auth.
- Produces: admin `GET /api/v1/admin/leaderboard`.
- Produces: admin `POST /api/v1/admin/leaderboard/snapshot`.
- Produces: `LeaderboardEntry(rank, team, score, submissions)`.

- [ ] Write failing API/model tests for public snapshot isolation, admin live results, ranking, submission counts, and atomic publication.
- [ ] Add snapshot persistence and Alembic operations.
- [ ] Implement a shared live-ranking query and snapshot service.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 4: Admin R3 final backtest

**Files:**
- Modify: `app/config.py`
- Create: `app/services/final_backtest.py`
- Modify: `app/schemas/admin.py`
- Modify: `app/routers/admin.py`
- Test: `tests/test_final_backtest.py`

**Interfaces:**
- Consumes: configured `HIDDEN_VALIDATION_PATH`, with `team_id`, `stock_id`, `master_timestamp`, and `target_r3` columns.
- Produces: admin `POST /api/v1/admin/final-backtest` returning ranked R3 winners.

- [ ] Write failing tests for best-submission selection, team-specific hidden targets, ranking, missing targets, and non-admin rejection.
- [ ] Implement hidden-target loading and best R3 submission rescoring with the frozen signal formula.
- [ ] Expose the admin endpoint.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 5: Database-backed submission rate limit and hidden score response

**Files:**
- Modify: `app/models.py`
- Modify: `alembic/versions/0003_member4_event_controls.py`
- Modify: `app/services/submissions.py`
- Modify: `app/schemas/submission.py`
- Test: `tests/test_submit_api.py`
- Test: `tests/test_submission_service.py`

**Interfaces:**
- Enforces: one submit request per team per 60 seconds using a locked database row.
- Produces: success responses with submission counters but without `score`, `balanced_accuracy`, or `mcc`.

- [ ] Write failing tests for a second request inside 60 seconds, a request after 60 seconds, concurrent locking, and absence of score fields.
- [ ] Add rate-limit persistence and Alembic operations.
- [ ] Enforce the limit before reading/scoring the upload.
- [ ] Remove raw metrics from the participant response while keeping internal scores stored.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 6: Configurable Flash Crash message

**Files:**
- Modify: `app/schemas/admin.py`
- Modify: `app/routers/admin.py`
- Test: `tests/test_admin_api.py`

**Interfaces:**
- `POST /api/v1/admin/flash-crash` accepts an optional `message` body field.

- [ ] Write failing tests for default and overridden messages.
- [ ] Pass the validated request message into the existing atomic transition.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 7: Revocable administrator sessions

**Files:**
- Modify: `app/models.py`
- Modify: `alembic/versions/0003_member4_event_controls.py`
- Modify: `app/routers/auth.py`
- Modify: `app/dependencies.py`
- Test: `tests/test_auth_api.py`
- Test: `tests/test_dependencies.py`

**Interfaces:**
- Produces: persisted hashes for administrator JWTs and authorization checks for expiry/revocation.

- [ ] Write failing tests for session creation, missing session, expiry, revocation, inactive administrator, and wrong subject.
- [ ] Add admin session persistence and Alembic operations.
- [ ] Persist admin JWT hashes at login and enforce them in `get_current_admin_id`.
- [ ] Run focused and full tests.
- [ ] Commit the task.

### Task 8: Production CORS configuration and contract verification

**Files:**
- Modify: `app/config.py`
- Modify: `app/main.py`
- Modify: `.env.example`
- Modify: `tests/test_cors.py`
- Modify: `tests/test_openapi_contract.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PRODUCTION_FRONTEND_URL` from deployment environment.

- [ ] Write a failing test proving the configured production URL is allowed.
- [ ] Append a non-empty production frontend URL to configured CORS origins.
- [ ] Update OpenAPI route assertions and deployment documentation.
- [ ] Run full tests, compilation, migration-head checks, and offline PostgreSQL migration generation.
- [ ] Commit the task.
