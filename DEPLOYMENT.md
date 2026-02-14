# Deployment Guide

This application requires both **Node.js** (frontend/api) and **Python** (PDF processing). The best way to deploy it is using **Docker**.

## 1. Prerequisites (Environment Variables)

You must set these environment variables in your hosting provider:

```env
# Database Connection (SQLite by default, PostgreSQL recommended for prod)
DATABASE_URL="file:./db/custom.db"

# Gemini AI API Key (Required for template learning)
GEMINI_API_KEY="your_google_ai_key_here"

# Admin Dashboard Access Key (Set this to a secure secret)
ADMIN_KEY="secure_admin_password_123"
```

## 2. Choosing a Hosting Provider

Because this app needs persistent storage (for the database) and Python, we recommend:

### Option A: Railway.app (Easiest)
1. Fork this repository to your GitHub.
2. Sign up at [Railway.app](https://railway.app/).
3. Create a **New Project** -> **Deploy from GitHub** -> Select your repo.
4. Railway will automatically detect the `Dockerfile`.
5. **Add Environment Variables** in the Railway dashboard.
6. **Important:** By default, Docker containers are ephemeral (files are lost on restart).
   - **Recommended:** Add a **PostgreSQL** service in Railway and update `DATABASE_URL` to point to it.
   - **Alternative (SQLite):** Add a persistent volume mount for `/app/prisma/db`.

### Option B: Render.com
1. Create a "Web Service" connected to your repo.
2. Choose "Docker" as the environment.
3. Add a "Disk" attached to `/app/prisma/db` if sticking with SQLite.

### Option C: Generic VPS (DigitalOcean/EC2)
1. Install Docker on your server.
2. Clone your repo.
3. Build and run:
   ```bash
   docker build -t bank-extractor .
   docker run -d -p 3000:3000 --env-file .env -v $(pwd)/db_data:/app/prisma/db bank-extractor
   ```

## 3. Production Database (Highly Recommended)

SQLite works for testing but isn't great for production deployments where containers restart often. To switch to PostgreSQL:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Delete the `migrations` folder if it exists.
3. Commit and push.
4. Set `DATABASE_URL` to your PostgreSQL connection string (e.g., `postgres://user:pass@host:5432/db`).

## 4. Admin Dashboard

Once deployed, access the admin backend at:
`https://your-app-url.com/admin`

Enter the `ADMIN_KEY` you set in the environment variables to view and manage saved templates.
