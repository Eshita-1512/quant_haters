# Member 3: Frontend Developer

**Role Overview:**
You are building the face of the competition. Everything the participants interact with is built by you. During a chaotic 5-hour hackathon, the UI must be blazing fast, bug-free, and idiot-proof.

## Tech Stack
*   **Next.js / React** (Framework)
*   **Tailwind CSS** (Styling)
*   **TypeScript** (Recommended for fewer bugs)

## What You Need to Know Beforehand
1.  **File Uploads in React:** Participants will be uploading CSV files constantly. You need to know how to handle `<input type="file" />`, attach it to a `FormData` object, and POST it to the Backend API (Member 4).
2.  **Global State & Timers:** The countdown timer must be the exact same for every participant. You need to know how to sync a countdown timer with a server timestamp (so someone can't cheat by changing their laptop's clock).
3.  **UI/UX for Stressful Environments:** Participants will be panicked. The upload button needs to clearly show "Loading...", "Success!", or "Error: Your CSV is formatted wrong." 
4.  **Polling vs. WebSockets:** You need to know how to update the live leaderboard. (Polling the backend every 5 seconds is usually easiest).

## Exactly What Pages to Build (Routing)
1.  **`/` (Login Page):** A simple, clean interface for teams to log in with their assigned credentials.
2.  **`/dashboard` (Team Hub):** 
    *   Must display which stock they are assigned to.
    *   Must have a "Download Data" button.
    *   Must have a robust "Upload Predictions (CSV)" drag-and-drop zone.
    *   Must show their current Round (Round 1, Flash Crash, etc.) and a Countdown Timer.
3.  **`/leaderboard`:** A table displaying all teams, ranked by their current scores. (Should have a sleek, dark-mode quant aesthetic).
4.  **The Flash Crash Alert (Modal):** A massive, full-screen red alert modal that pops up on the Dashboard when the backend says the Flash Crash is live, forcing teams to download the new chaotic data.

## The API Contracts & Schema (Mock this until Backend is ready)
To work simultaneously with Member 4, assume these endpoints exist. You can hardcode fake JSON responses in your React code today, and just swap the URLs when Member 4 finishes their API next week.

**1. Leaderboard Endpoint:**
*   **Call:** `GET /api/leaderboard`
*   **Expected Response:** `[{"team": "Team A", "score": 85.4}, {"team": "Team B", "score": 72.1}]`

**2. Status Endpoint (For Timer & Flash Crash):**
*   **Call:** `GET /api/status`
*   **Expected Response:** `{"current_round": "R1", "time_remaining_seconds": 3600, "flash_crash_active": false}`

**3. Upload Endpoint:**
*   **Call:** `POST /api/upload` (Send file as FormData)
*   **Expected Success Response:** `{"status": "success", "message": "Scored!", "score": 92.5}`
*   **Expected Error Response:** `{"status": "error", "message": "Invalid CSV schema"}`

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
├── web/                       <-- [YOU ARE HERE: Frontend Developer]
│   ├── package.json
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.tsx      (Login)
│   │   │   ├── dashboard.tsx
│   │   │   └── leaderboard.tsx
│   │   └── components/
│   │       ├── CountdownTimer.tsx
│   │       └── FileUpload.tsx
│
├── backend/                   <-- [Member 4: Backend API]
│   ├── main.py                
│   ├── database.py
│
├── private_data/              <-- [The Head: Admin / Security]
│   ├── master_validation.csv
│   └── team_assignments.csv
```
