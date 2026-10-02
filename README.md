# Quant ML Trading Challenge

A three-round machine learning trading event: teams predict price moves (Round 1), adapt to a flash crash (Round 2), then submit trading signals (Round 3). Organizers run the event live from a control room.

| Folder | What it is | Runs on |
|---|---|---|
| [`web/`](web/) | Next.js frontend: team portal and organizer control room | http://localhost:3000 |
| [`quant_haters-maahnal/`](quant_haters-maahnal/) | FastAPI backend with PostgreSQL: auth, timers, datasets, scoring | http://localhost:8000 |

**A fresh download is not connected yet.** Passwords and settings live in `.env` files that are never uploaded to GitHub. You create them locally by following the steps below; it takes about 10 minutes.

## Requirements

- **Python** 3.11 or newer
- **Node.js** 20.9 or newer
- **PostgreSQL** 15 or newer, running locally. You need its username and password (often `postgres` and whatever you chose at install). Docker can replace this; see [Using Docker for the backend](#using-docker-for-the-backend).

Commands below show **Windows (PowerShell)** first and **macOS/Linux** second where they differ.

## 1. Create the database

In pgAdmin (right-click **Databases → Create → Database…**) or `psql`, create an empty database named:

```
dz_quant
```

## 2. Set up and start the backend

Open a terminal in `quant_haters-maahnal/`.

**Create a Python environment and install the backend:**

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -e .
```

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

**Create the settings file:**

```powershell
copy .env.example .env
```

```bash
cp .env.example .env
```

Open `.env` and edit two lines:

1. `DATABASE_URL`: put your PostgreSQL username and password in it:
   ```
   DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/dz_quant
   ```
   If the password contains `@ : / # ?` or `%`, use a password without those characters, or URL-encode them.
2. `JWT_SECRET`: replace it with a long random value. This command prints one to paste in:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

Leave `CORS_ORIGINS` as it is. It already allows the frontend at `http://localhost:3000`.

**Create the tables and load the demo event:**

```bash
alembic upgrade head
python -m scripts.seed_demo
```

The seed creates 40 demo teams, 3 rounds, and placeholder datasets in `private_data/`. It refuses to run twice on the same database.

**Start the backend:**

```bash
uvicorn app.main:app --port 8000
```

Check it at http://localhost:8000/health: it should show `{"status":"ok"}`. Interactive API docs are at http://localhost:8000/docs.

Keep this terminal open.

## 3. Set up and start the frontend

Open a **second** terminal in `web/`:

```powershell
npm install
copy .env.example .env.local
npm run dev
```

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` already points at the backend (`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`) with mock mode off.

## 4. Open it

| Who | URL | Demo login |
|---|---|---|
| Teams | http://localhost:3000 | `T01` to `T40`, password `team-demo-password` |
| Organizers | http://localhost:3000/admin | `admin`, password `admin-demo-password` |

These are demo accounts from the seed. Never use them for a real event.

### How to tell it's connected

- The team sign-in page shows **no** "Mock mode" note under the form.
- The control room header shows **no** "Mock backend" badge.
- After signing in as `T01`, the dashboard shows **STOCK_A** and **Round 1: Foundation**.

## How the two connect

```
Browser ──> web (localhost:3000) ──fetch──> backend (localhost:8000/api/v1) ──> PostgreSQL (dz_quant)
```

- The frontend calls the backend at `NEXT_PUBLIC_API_BASE_URL` in `web/.env.local`.
- The backend only accepts browser calls from the addresses in `CORS_ORIGINS` in `quant_haters-maahnal/.env`.
- If you run the frontend somewhere else (another port or a deployed URL), add that address to `CORS_ORIGINS` and restart the backend.

## Daily use

After the first setup, starting everything again is just:

```powershell
# terminal 1
cd quant_haters-maahnal
.venv\Scripts\activate
uvicorn app.main:app --port 8000

# terminal 2
cd web
npm run dev
```

On macOS/Linux, activate with `source .venv/bin/activate` instead.

## Running the event

See [EVENT_GUIDE.md](EVENT_GUIDE.md) for the control room: timers, starting rounds, the flash crash, what teams see at each stage, submission rules, datasets, and publishing results.

## Using Docker for the backend

If you have Docker Desktop, this replaces steps 1 and 2. Run it in `quant_haters-maahnal/`:

```bash
docker compose up --build -d
docker compose exec api python -m scripts.seed_demo
```

This starts PostgreSQL and the backend together on ports 5432 and 8000. Stop any locally installed PostgreSQL on port 5432 first, or the database container cannot start. Then do step 3 for the frontend.

## Trying the frontend without a backend

Set `NEXT_PUBLIC_USE_MOCKS=true` in `web/.env.local` and restart `npm run dev`. The site then runs on a fake in-browser backend: any team ID with password `demo`, admin `admin` / `admin`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `password authentication failed` when running `alembic` or starting the backend | The username or password in `DATABASE_URL` is wrong |
| `database "dz_quant" does not exist` | Do step 1 |
| `Seed refused: teams already exist` | The demo event is already loaded. Nothing to do |
| Site says "Could not reach the server" | The backend isn't running, or `NEXT_PUBLIC_API_BASE_URL` is wrong |
| Browser console shows a CORS error | Add the frontend's address to `CORS_ORIGINS` and restart the backend |
| Changed `.env.local` and nothing happened | Restart `npm run dev` |
| `alembic` or `uvicorn` "not recognized" | Activate the virtual environment first (`.venv\Scripts\activate`) |
