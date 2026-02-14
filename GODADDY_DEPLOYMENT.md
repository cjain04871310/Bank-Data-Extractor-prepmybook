# Deploying to GoDaddy VPS

Since this application requires both **Node.js** and **Python** running together, the only reliable way to host it on GoDaddy is using a **VPS (Virtual Private Server)**.

> **⚠️ Warning:** Standard "Shared Hosting" (cPanel) will likely FAIL because it cannot run Docker or persistent Node.js/Python processes.

## Phase 1: Point Your Domain (DNS)

1. Log in to your GoDaddy Dashboard.
2. Go to **Domain Portfolio** and select your domain.
3. Click on **DNS**.
4. Add (or Update) the **A Record**:
   - **Type:** `A`
   - **Name:** `@` (root)
   - **Value:** `YOUR_VPS_IP_ADDRESS` (e.g., `123.45.67.89`)
   - **TTL:** `600` (Seconds)
5. Save changes. It may take a few minutes to propagate.

## Phase 2: Prepare the Server

1. **SSH into your VPS:**
   - On Windows, use **PowerShell**: `ssh root@your-vps-ip`
   - Or use **PuTTY**.
   - Input your root password when prompted.

2. **Install Docker** (if not installed):
   Run these commands one by one:
   ```bash
   # Update system
   apt-get update
   
   # Install Docker
   apt-get install -y docker.io
   
   # Start Docker
   systemctl start docker
   systemctl enable docker
   ```

## Phase 3: Deploy the Application

1. **Copy your project files to the VPS.**
   You can use **Git** (easiest) or **SCP/FileZilla**.
   
   *Using Git:*
   ```bash
   # Install Git
   apt-get install -y git
   
   # Clone your repo (you need to push your code to GitHub first)
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git app
   cd app
   ```

2. **Create your Environment File:**
   ```bash
   nano .env
   ```
   Paste your `.env` content inside (Right-click to paste in PuTTY/Terminal):
   ```env
   DATABASE_URL="file:./db/custom.db"
   GEMINI_API_KEY="your_actual_api_key"
   ADMIN_KEY="create_a_strong_password"
   ```
   Press `Ctrl+X`, then `Y`, then `Enter` to save.

3. **Build and Run with Docker:**
   ```bash
   # Build the image (this takes a few minutes)
   docker build -t bank-extractor .
   
   # Run the container in background on port 80 (HTTP)
   # We maps port 3000 (app) to port 80 (web)
   docker run -d -p 80:3000 --restart always --env-file .env -v $(pwd)/db_data:/app/prisma/db --name bank-app bank-extractor
   ```

4. **Verify:**
   Open your browser and visit `http://your-domain.com`. You should see the application!

## Phase 4: HTTPS (SSL Security) - Optional but Recommended

To get a secure lock icon (HTTPS), the easiest way is to use **Caddy** as a reverse proxy instead of running the app directly on port 80.

1. **Stop the current container:**
   ```bash
   docker stop bank-app
   docker rm bank-app
   ```

2. **Run the app on port 3000 (localhost only):**
   ```bash
   docker run -d -p 3000:3000 --restart always --env-file .env -v $(pwd)/db_data:/app/prisma/db --name bank-app bank-extractor
   ```

3. **Install Caddy:**
   ```bash
   apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
   apt-get update
   apt-get install caddy
   ```

4. **Configure Caddy:**
   ```bash
   nano /etc/caddy/Caddyfile
   ```
   Replace the content with:
   ```text
   your-domain.com {
       reverse_proxy localhost:3000
   }
   ```
   (`Ctrl+X`, `Y`, `Enter` to save)

5. **Restart Caddy:**
   ```bash
   systemctl restart caddy
   ```

Now your site is live at `https://your-domain.com` with automatic SSL!
