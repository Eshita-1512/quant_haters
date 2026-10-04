import asyncio
import csv
import io
import time
import uuid
import httpx

# Change this to your EC2 IP when testing the live server
BASE_URL = "http://54.144.200.246"

async def simulate_team(client: httpx.AsyncClient, team_code: str, password: str, start_delay: float):
    await asyncio.sleep(start_delay)
    
    # 1. Login
    login_resp = await client.post(f"{BASE_URL}/api/v1/auth/login", json={"team_id": team_code, "password": password})
    if login_resp.status_code != 200:
        print(f"[{team_code}] Login failed: {login_resp.text}")
        return
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get assignments (to find stock and predict window)
    dash_resp = await client.get(f"{BASE_URL}/api/v1/team/me", headers=headers)
    if dash_resp.status_code != 200:
        print(f"[{team_code}] Failed to fetch dashboard")
        return
    
    # 3. Submit R1 prediction (Random 0 or 1 for 801-850)
    # We create a fake CSV in memory
    import random
    csv_data = io.StringIO()
    writer = csv.writer(csv_data)
    writer.writerow(["timestamp", "prediction", "confidence"])
    for ts in range(801, 851):
        writer.writerow([ts, random.choice([0, 1]), round(random.uniform(0.5, 1.0), 2)])
    
    files = {"file": ("submission.csv", csv_data.getvalue().encode("utf-8"), "text/csv")}
    
    start_time = time.time()
    sub_resp = await client.post(f"{BASE_URL}/api/v1/submit/round/1", headers=headers, files=files)
    elapsed = time.time() - start_time
    
    if sub_resp.status_code == 200:
        print(f"[{team_code}] Submitted successfully in {elapsed:.2f}s! Score processing...")
    else:
        print(f"[{team_code}] Submission failed ({sub_resp.status_code}): {sub_resp.text}")

async def main():
    print(f"Starting load test against {BASE_URL}...")
    
    # Read the generated passwords
    teams = []
    try:
        with open("quant_haters-maahnal/scripts/passwords.csv", "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                teams.append((row["team_code"], row["password"]))
    except FileNotFoundError:
        # Fallback to default path inside EC2 or try generated_test
        try:
            with open("../generated_test/passwords.csv", "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    teams.append((row["team_code"], row["password"]))
        except FileNotFoundError:
            print("Could not find passwords.csv locally to simulate teams.")
            return

    if not teams:
        print("No teams found in passwords.csv")
        return
        
    print(f"Loaded {len(teams)} teams. Launching concurrent submissions...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = []
        for i, (code, pw) in enumerate(teams):
            # Stagger them slightly (over 5 seconds) to simulate a realistic rush
            delay = random.uniform(0, 5.0)
            tasks.append(simulate_team(client, code, pw, delay))
            
        await asyncio.gather(*tasks)
    
    print("Load test complete! Check the leaderboard in your browser.")

if __name__ == "__main__":
    import random
    asyncio.run(main())
