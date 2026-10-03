# AWS EC2 Deployment Guide: Quant ML Trading Challenge

Deploying the competition to an AWS EC2 instance using Docker Compose and Nginx reverse proxy.

---

## 1. Launch Your EC2 Instance

1. In the **AWS EC2 Console**, click **Launch Instance**.
2. **AMI:** Ubuntu 24.04 LTS (or Ubuntu 22.04 LTS).
3. **Instance Type:** `t3.small` (2 vCPU, 2 GB RAM) or `t3.medium` (2 vCPU, 4 GB RAM recommended for 56 teams).
4. **Storage:** 20 GB gp3.
5. **Security Group (Firewall Rules):**
   - **Port 22 (SSH):** My IP (or Anywhere).
   - **Port 80 (HTTP):** Anywhere (`0.0.0.0/0`) &mdash; **Crucial for participants to open the website**.

---

## 2. Connect and Install Docker

SSH into your EC2 instance from your terminal:
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
```

Install Docker and Docker Compose (copy-paste this command):
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
newgrp docker
```

Verify Docker works:
```bash
docker --version
docker compose version
```

---

## 3. Upload Project Files to EC2

From your local machine (in `c:\Users\ESHITA\quant`), transfer the project files to EC2 using `rsync` or `scp`:

```bash
# From your Windows PowerShell or Git Bash:
scp -i /path/to/your-key.pem -r c:/Users/ESHITA/quant/quant_haters c:/Users/ESHITA/quant/team_files c:/Users/ESHITA/quant/generated_test ubuntu@<YOUR-EC2-PUBLIC-IP>:~/
```

*(Alternatively, push your `quant_haters` git repository to GitHub, clone it onto EC2, and SCP just the `team_files` and `generated_test` folders into the parent directory `~/`)*.

On EC2, your folder structure in `~/` should look like this:
```
~
├── quant_haters/
│   ├── docker-compose.yml
│   ├── nginx.conf
│   ├── web/
│   └── quant_haters-maahnal/
├── team_files/
└── generated_test/
```

---

## 4. Launch the Competition

On the EC2 instance, navigate into `quant_haters` and run:

```bash
cd ~/quant_haters
docker compose up -d --build
```

Docker will build the Next.js frontend, Python FastAPI backend, start PostgreSQL, and configure the Nginx reverse proxy.

---

## 5. Seed the Real Competition Data

Once the containers are running (`docker compose ps`), seed all 56 teams, stocks, and datasets into PostgreSQL:

```bash
docker compose exec api python -m scripts.load_real_data
```

This will:
- Apply all database migrations automatically.
- Populate all 56 teams and assign stocks.
- Set up Round 1, Round 2 (Crash), and Round 3 data releases in `/app/private_data`.
- Register the admin account (`admin` / `admin-demo-password`).

---

## 6. Accessing the Challenge

Open your browser:
* **Participant Portal:** `http://<YOUR-EC2-PUBLIC-IP>/`
* **Public Leaderboard (Projector Screen):** `http://<YOUR-EC2-PUBLIC-IP>/leaderboard`
* **Organizer Control Room:** `http://<YOUR-EC2-PUBLIC-IP>/admin` (Login: `admin` / `admin-demo-password`)

---

## 7. Useful Operational Commands on EC2

* **View live logs:**
  ```bash
  docker compose logs -f api
  ```
* **Restart services:**
  ```bash
  docker compose restart
  ```
* **Stop everything:**
  ```bash
  docker compose down
  ```
* **Back up the database during the event:**
  ```bash
  docker compose exec db pg_dump -U postgres dz_quant > backup_event.sql
  ```
