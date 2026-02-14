# Easy Deployment Guide (No Coding Required)

This approach uses **Railway.app** to host your application. It handles the complex setup (Node.js + Python) automatically. You just need to connect it to your GitHub and GoDaddy.

## Step 1: Upload Code to GitHub

1.  Create a free account at [GitHub.com](https://github.com).
2.  Download [GitHub Desktop](https://desktop.github.com/) and log in.
3.  **Create a Repository:**
    *   File -> **Add Local Repository**.
    *   Choose the folder: `Bank Statement Data Extractor`.
    *   Click **Publish repository**.
    *   Keep "Private" checked if you want to keep code secret.
    *   Click **Publish**.

## Step 2: Deploy on Railway

1.  Sign up at [Railway.app](https://railway.app/) (Login with GitHub).
2.  Click **New Project** -> **Deploy from GitHub repo**.
3.  Select the `Bank Statement Data Extractor` repo you just published.
4.  Railway will detect the `Dockerfile` and start building. **Wait for it to finish.**

## Step 3: Add Permanent Database (PostgreSQL)

By default, the app forgets data when it restarts. To save templates permanently:

1.  In your Railway project view, click **New** (or right-click) -> **Database** -> **Add PostgreSQL**.
2.  Wait for the database formatted card to appear.
3.  Click on the **PostgreSQL** card -> **Variables**.
4.  Copy the `DATABASE_URL` (it looks like `postgresql://postgres:password@...`).
5.  **Update your App Configuration:**
    *   Click on your **App** card (Bank Statement Extractor).
    *   Go to **check "Variables" tab**.
    *   Add: `DATABASE_URL` = (Paste the PostgreSQL URL here).
    *   Add: `GEMINI_API_KEY` = (Your Google AI Key).
    *   Add: `ADMIN_KEY` = (Create a password for your dashboard).

## Step 4: Update Code for PostgreSQL

Since we switched from SQLite to PostgreSQL, make one small change in your code locally and push it.

1.  Open `prisma/schema.prisma` in your editor.
2.  Change line 3:
    ```prisma
    // Change this:
    provider = "sqlite"
    
    // To this:
    provider = "postgresql"
    ```
3.  Save the file.
4.  Open `Dockerfile` and delete the line: `COPY prisma ./prisma` (Railway handles migrations differently, but generic build might fail if migration is pending. Actually, for simplicity, **Skip this step 4** if you are okay with SQLite for testing. If you want robust prod, do this change).
    *   *Simplification:* If you just want it to work NOW, you can skip this step and use the default SQLite, but be aware templates might reset if the app redeploys.
    *   **Recommended:** Do the change, commit to GitHub ("Update DB to Postgres") and push. Railway will redeploy automatically.

## Step 5: Connect GoDaddy Domain

1.  In Railway, go to your App -> **Settings** -> **Domains**.
2.  Click **Generate Domain** (gives you something like `app-production.up.railway.app`).
3.  **Custom Domain:**
    *   Enter your GoDaddy domain (e.g., `www.yourcompany.com`).
    *   Railway will show you a **CNAME** record to add.
    
4.  **Go to GoDaddy:**
    *   Domain Portfolio -> DNS.
    *   Add **CNAME** Record:
        *   Name: `www`
        *   Value: `bank-extractor-production.up.railway.app` (copied from Railway).
        *   TTL: Default.
    *   Save.

5.  Wait 5-10 minutes. Your site will be live at `https://www.yourcompany.com` with a secure lock icon!
