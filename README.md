# The Lead Desk — hosted app

This is the real, standalone version of "The Lead Desk" — same look and features as the Claude artifact, but it runs as a normal website with its own database, so it works for both of you, in any browser, and nothing gets lost on refresh.

## How it's built (plain terms)

- **Frontend**: the same HTML/CSS/JS look as before, in `public/` — Vercel serves these files directly, automatically.
- **Backend**: a small set of API routes (`app.js`, wired up as one Vercel serverless function via `api/[...all].js`) that the frontend talks to instead of Claude's `window.storage`.
- **Database**: Postgres, hosted for free on **Supabase**. This is where profiles and job leads actually live, permanently — Vercel functions don't keep anything in memory or on disk between requests, so all real data lives here.
- **"Find leads" search**: wired up in the code, but turned **off** until you add an `ANTHROPIC_API_KEY`. Until then, clicking the button just shows a friendly "not turned on yet" message instead of erroring.

Three free accounts are involved — sounds like you've already made all three:

1. **GitHub** — where the code lives
2. **Supabase** — the database
3. **Vercel** — runs the app and gives you the URL you'll both use

## Step 1 — Create the database (Supabase)

1. In your Supabase account, click **New project**. Pick any name/region, set a database password (save it somewhere), and wait ~2 minutes for it to spin up.
2. Once it's ready, go to **Project Settings → Database → Connection string**.
3. Because Vercel runs your app as short-lived serverless functions (each request can open a fresh database connection), use the **"Connection pooling"** string here instead of the direct one — look for a **URI** labeled "Transaction" mode pooler, on port `6543`. It looks like:
   `postgresql://postgres.xxxxxx:[YOUR-PASSWORD]@aws-0-xxxxx.pooler.supabase.com:6543/postgres`
4. Replace `[YOUR-PASSWORD]` with the password you set. Save this full string — you'll paste it into Vercel in Step 3 as `DATABASE_URL`.

You don't need to manually create tables — the app does that automatically the first time it runs (see `schema.sql` / `db.js`).

## Step 2 — Push this code to GitHub

```bash
cd lead-desk-app
git remote add origin https://github.com/YOUR-USERNAME/lead-desk-app.git
git branch -M main
git push -u origin main
```

(This folder already has an initial commit ready to go — just create an empty repo at [github.com/new](https://github.com/new) first, then run the commands above with your repo's URL.)

## Step 3 — Deploy on Vercel

1. In your Vercel account: **Add New → Project**, then import the `lead-desk-app` repo from GitHub.
2. Framework preset: leave as **Other** (no build step needed).
3. Open **Environment Variables** and add:
   - `DATABASE_URL` → the Supabase pooler connection string from Step 1
   - (leave `ANTHROPIC_API_KEY` unset for now — see below for adding it later)
4. Click **Deploy**. First deploy takes about a minute. You'll get a URL like `https://lead-desk-app.vercel.app` — that's the link you both use from now on, from any browser, no Claude Code needed.

**About the free tier:** Vercel's free functions "cold start" after being idle, but it's typically under a couple seconds — much faster than a sleeping server. Your data is unaffected either way since it all lives in Supabase, not on Vercel itself.

## Turning on live search later

When you're ready to enable the "Find leads" button:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) (requires setting up billing there — usage is pay-as-you-go, typically a few cents per search).
2. In Vercel, go to your project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` with that key.
3. Redeploy (Vercel usually prompts you to, or trigger one from the Deployments tab). No code changes needed — the search logic is already built in `app.js`, just gated behind this variable.
4. One thing to watch: Vercel's free tier caps a single request at 10 seconds by default. A live web search occasionally takes longer than that and could get cut off. If you see search failing specifically after turning this on, that's the likely cause — let Claude Code know and it's a quick config fix (raising `maxDuration` for that route).

## Running it locally (optional, for testing before you deploy)

Requires [Node.js](https://nodejs.org) installed on your machine (it isn't required just to deploy — Vercel runs Node for you).

```bash
cd lead-desk-app
npm install
cp .env.example .env
# edit .env and paste in your DATABASE_URL from Supabase (the direct one is fine for local use)
npm start
```

Then open `http://localhost:3000`.

## What's different from the old Claude artifact

- Data is saved to a real database (Supabase), not `window.storage` — so it works outside claude.ai and never resets.
- The board is an open link — anyone with the URL can view and edit it, same as before.
- "Find leads" is present but inactive until an API key is added (see above).

## Project structure

```
lead-desk-app/
  app.js            Express app: all API routes live here
  api/[...all].js   Vercel entry point — just re-exports app.js
  server.js         Local-dev-only entry point (npm start)
  db.js             Database queries + schema setup
  schema.sql         Schema for reference / manual use
  public/           Frontend (HTML/CSS/JS), served automatically by Vercel
```
