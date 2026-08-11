# The Lead Desk — hosted app

This is the real, standalone version of "The Lead Desk" — same look and features as the Claude artifact, but it runs as a normal website with its own database, so it works for both of you, in any browser, and nothing gets lost on refresh.

## How it's built (plain terms)

- **Frontend**: the same HTML/CSS/JS look as before, in `public/`.
- **Backend**: a small Node.js server (`server.js`) that the frontend talks to instead of Claude's `window.storage`.
- **Database**: Postgres, hosted for free on **Supabase**. This is where profiles and job leads actually live, permanently.
- **"Find leads" search**: wired up in the code, but turned **off** until you add an `ANTHROPIC_API_KEY`. Until then, clicking the button just shows a friendly "not turned on yet" message instead of erroring.

Two free accounts are required — I can't create these for you, but each one takes a few minutes:

1. **Supabase** (database) — supabase.com
2. **Render** (hosting the app itself) — render.com

## Step 1 — Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**. Pick any name/region, set a database password (save it somewhere), and wait ~2 minutes for it to spin up.
3. Once it's ready, go to **Project Settings → Database → Connection string → URI**. Copy that string — it looks like:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres`
4. Replace `[YOUR-PASSWORD]` with the password you set. Save this full string — you'll paste it into Render in Step 3 as `DATABASE_URL`.

You don't need to manually create tables — the app does that automatically the first time it starts (see `schema.sql`).

## Step 2 — Push this code to GitHub

Render deploys from a GitHub repository.

```bash
cd lead-desk-app
git init
git add .
git commit -m "Initial version of The Lead Desk hosted app"
```

Then create a new empty repository on [github.com/new](https://github.com/new) (doesn't matter if public or private), and follow GitHub's instructions to push an existing local repo, e.g.:

```bash
git remote add origin https://github.com/YOUR-USERNAME/lead-desk-app.git
git branch -M main
git push -u origin main
```

## Step 3 — Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free), then **New → Web Service**.
2. Connect your GitHub account and pick the `lead-desk-app` repo.
3. Settings:
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free
4. Under **Environment Variables**, add:
   - `DATABASE_URL` → the Supabase connection string from Step 1
   - (leave `ANTHROPIC_API_KEY` unset for now — see below for adding it later)
5. Click **Create Web Service**. Render will build and start it — first deploy takes a couple minutes. You'll get a URL like `https://lead-desk-app.onrender.com` — that's the link you both use from now on, from any browser, no Claude Code needed.

**About the free tier:** Render's free instances "sleep" after periods of no traffic, so the first visit after a while takes ~30-50 seconds to wake up, then it's normal speed. Your data is unaffected either way — it lives in Supabase, not on the Render instance itself, so sleeping/waking never touches it.

## Turning on live search later

When you're ready to enable the "Find leads" button:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) (requires setting up billing there — usage is pay-as-you-go, typically a few cents per search).
2. In Render, go to your service → **Environment** → add `ANTHROPIC_API_KEY` with that key.
3. Render will automatically redeploy. No code changes needed — the search logic is already built in `server.js`, just gated behind this variable.

## Running it locally (optional, for testing before you deploy)

```bash
cd lead-desk-app
npm install
cp .env.example .env
# edit .env and paste in your DATABASE_URL from Supabase
npm start
```

Then open `http://localhost:3000`.

## What's different from the old Claude artifact

- Data is saved to a real database (Supabase), not `window.storage` — so it works outside claude.ai and never resets.
- The board is an open link — anyone with the URL can view and edit it, same as before.
- "Find leads" is present but inactive until an API key is added (see above).
