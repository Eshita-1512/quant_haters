# Member 4: Backend API & Database Engineer

**Role Overview:**
You are the bridge between the Frontend (Member 3) and the pure Python Math (Member 2). You manage the database, handle the traffic, and most importantly, guard the secret answers. If the backend crashes, the event halts.

## Tech Stack
*   **FastAPI** (Python framework - Highly recommended because Member 2's scoring scripts are in Python).
*   **Firebase / Firestore** (or PostgreSQL) for database management.
*   **Pydantic / Pandas** (For API validation).

## What You Need to Know Beforehand
1.  **API File Handling:** You need to know how to accept a multipart form data upload (a CSV file) from a React frontend securely.
2.  **Data Validation:** Participants *will* upload garbage. You need to know how to check the CSV schema *before* it reaches the scoring engine.
3.  **Database Schemas:** You need to design a clean schema for `Teams` (credentials, assignments), `Submissions` (history of uploads), and `Scores` (leaderboard data).
4.  **Security/Isolation:** You must know how to keep the `master_validation.csv` file hidden safely on your server, ensuring no API endpoint can ever accidentally leak it to the frontend.

## Exactly What Endpoints to Build (The API Contract)
Member 3 is building the frontend expecting these exact endpoints to exist and return this exact data. 

**1. Authentication:**
*   **Call:** `POST /api/auth`
*   **Input:** `{"team_id": "Team1", "password": "xxx"}`
*   **Action:** Validates user and returns a secure session token.

**2. The State / Status Endpoint:**
*   **Call:** `GET /api/status`
*   **Action:** Tells the frontend what round it is and if the Flash Crash has happened.
*   **Output:** `{"current_round": "R1", "time_remaining_seconds": 3600, "flash_crash_active": false}`

**3. The Leaderboard Endpoint:**
*   **Call:** `GET /api/leaderboard`
*   **Action:** Queries the database for the highest valid scores per team.
*   **Output:** `[{"team": "Team A", "score": 85.4}, {"team": "Team B", "score": 72.1}]`

**4. The Core Upload Endpoint:**
*   **Call:** `POST /api/upload`
*   **Input:** `multipart/form-data` containing the CSV file and the auth token.
*   **Action:** 
    1. Validates the user.
    2. Enforces the CSV Schema (see below).
    3. Passes the clean CSV to Member 2's Python scoring script.
    4. Saves the returned score to the Database.
*   **Output:** `{"status": "success", "score": 92.5}`

**5. The Admin Control Panel (Secret):**
*   **Call:** `POST /admin/trigger-flash-crash`
*   **Action:** Updates the database state so `flash_crash_active` becomes `true`.

## The Strict CSV Schema (Data Contract)
Before passing any file to Member 2's scoring script, your API must reject files that do not perfectly match this schema. (Returning a clean 400 Error to the frontend).

**For Rounds 1 & 2 (Predictions):**
*   Must be a `.csv` file.
*   Must have exactly two columns named: `timestamp` and `prediction`.
*   `timestamp` must be integers.
*   `prediction` must be 0 or 1.
*   Cannot contain missing values (NaNs).

**For Round 3 (Trading Strategy):**
*   Must be a `.csv` file.
*   Must have exactly two columns named: `timestamp` and `position`.
*   `timestamp` must be integers.
*   `position` must be floats strictly between `-1.0` and `1.0`.

## Recommended Repository Structure
Here is how your code fits into the overall team repository. You will spend most of your time in your designated folder!

```text
quant-challenge/
│
├── generator/                 <-- [Member 1: Data Engineer]
│   ├── generate_market.py
│   ├── window_splitter.py
│
├── scoring/                   <-- [Member 2: Scoring Engineer]
│   ├── evaluator.py
│   └── backtester.py
│
├── web/                       <-- [Member 3: Frontend Developer]
│   ├── package.json
│   ├── src/
│
├── backend/                   <-- [YOU ARE HERE: Backend API]
│   ├── main.py                (FastAPI App)
│   ├── database.py
│   ├── routers/
│   │   ├── upload.py
│   │   └── admin.py
│   └── schemas.py             (Pydantic Models)
│
├── private_data/              <-- [The Head: Admin / Security]
│   ├── master_validation.csv
│   └── team_assignments.csv
```
