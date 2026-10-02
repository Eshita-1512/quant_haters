# DataZen Quant Challenge Backend

FastAPI and PostgreSQL backend for the three-round Quant ML Trading Challenge. It provides team/admin JWT authentication, team-specific datasets, strict CSV validation, frozen scoring, leaderboard data, event countdown state, and atomic Flash Crash activation.

The complete table/column reference is in [docs/database_schema.md](docs/database_schema.md).

## Stack

- Python 3.11+ (3.12 recommended)
- FastAPI, SQLAlchemy 2, Alembic, psycopg 3
- PostgreSQL 15+
- Argon2 password hashing and signed JWT bearer tokens

pgAdmin 4 is optional: it is only a graphical client for inspecting PostgreSQL. The API connects directly to PostgreSQL through `DATABASE_URL`.

## Quick start with Docker

Docker Desktop must be installed and running.

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec api python -m scripts.seed_demo
```

The API is then available at `http://localhost:8000`; interactive OpenAPI documentation is at `http://localhost:8000/docs`.

The Compose database values are:

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `dz_quant` |
| Username | `postgres` |
| Password | `postgres` |

These values are for local development only. Change every password and `JWT_SECRET` outside local development.

## Local setup without Docker

Create a PostgreSQL database named `dz_quant`, then run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
cp .env.example .env
alembic upgrade head
python -m scripts.seed_demo
uvicorn app.main:app --reload
```

If PostgreSQL uses different credentials, edit only `DATABASE_URL` in `.env`. In pgAdmin, register the server using the same host, port, database, username, and password from that URL.

## Seeded development accounts

The seed script only runs on a database with no teams and refuses to overwrite existing team data.

- Team: `T01` through `T40`; password: `team-demo-password`
- Administrator: `admin`; password: `admin-demo-password`

Never use these credentials for a real event.

## API surface

All application endpoints use the `/api/v1` prefix.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Team login |
| `POST` | `/auth/admin/login` | Administrator login |
| `GET` | `/team/me` | Current assignment and prediction window |
| `GET` | `/team/data` | Short-lived, team-authorized dataset link |
| `POST` | `/submit/round/{round_num}` | Rate-limited validation and scoring; raw scores remain private |
| `GET` | `/leaderboard` | Latest frozen public ranking snapshot |
| `GET` | `/event/status` | Round timer and Flash Crash state |
| `POST` | `/admin/flash-crash` | Atomic R1-to-R2 Flash Crash transition |
| `GET` | `/admin/status` | Private operational status |
| `GET` | `/admin/leaderboard` | Private live leaderboard |
| `POST` | `/admin/leaderboard/snapshot` | Publish the live ranking as a public snapshot |
| `POST` | `/admin/final-backtest` | Run the hidden R3 final backtest |

Send protected requests with `Authorization: Bearer <access_token>`. Dataset files and secret validation targets live under `private_data/`, which is excluded from Git and is never mounted as public static content.

## CSV contracts

- Rounds 1 and 2: `timestamp,prediction` with optional `confidence`
- Round 3: `timestamp,signal`
- Exactly 50 rows, with each local timestamp `1..50` appearing exactly once
- Predictions must be `0` or `1`; confidence must be `0..1`; signal must be `-1..1`

The service maps local timestamps to the authenticated team's private master window. Teams cannot select a stock or another team's time window in their request.

## Development and verification

```bash
pytest -v
python -m compileall app tests scripts
alembic current
alembic upgrade head
```

To test a clean migration with Docker:

```bash
docker compose down -v
docker compose up -d db
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/dz_quant alembic upgrade head
```

Useful lifecycle commands:

```bash
docker compose logs -f api
docker compose stop
docker compose down
```

`docker compose down -v` deletes the local database volume; use it only when you intentionally want a clean database.

## Production notes

- Generate a long random `JWT_SECRET`; never commit `.env`.
- Set `PRODUCTION_FRONTEND_URL` to the deployed frontend origin before deployment.
- Set `HIDDEN_VALIDATION_PATH` to the private team-specific R3 final target file.
- Put PostgreSQL and dataset storage on persistent encrypted infrastructure.
- Serve FastAPI behind TLS and a trusted reverse proxy.
- Restrict admin credentials and the Flash Crash endpoint to event operators.
- Back up the database before the event and monitor API/database health throughout it.
- Run `alembic upgrade head` as a deployment step before starting the API.
