-- The Lead Desk — database schema
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- Note: db.js embeds this same schema as a JS string for Vercel bundling reasons;
-- this file is kept for reference / manual use only, not read at runtime.

CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  beat_label  TEXT NOT NULL DEFAULT '',
  interests   TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  seniority   TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'red'
);

ALTER TABLE people ADD COLUMN IF NOT EXISTS last_searched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'tip',   -- 'wire' | 'tip'
  status      TEXT NOT NULL DEFAULT 'open',  -- 'candidate' | 'open' | 'filed'
  date_added  TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_filed  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS blocked_companies (
  id          SERIAL PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(person_id, company)
);

-- Seed the two default profiles if the table is empty.
INSERT INTO people (id, name, beat_label, interests, location, seniority, color)
VALUES
  ('p1', '', 'Politics & Policy', 'Political and opinion writing, health policy commentary', 'Hybrid — Northern NJ / NYC', 'Mid-level preferred, open to high-paying entry-level', 'red'),
  ('p2', '', 'Style & Beauty', 'Fashion and beauty coverage', 'Hybrid — Northern NJ / NYC', 'Mid-level preferred, open to high-paying entry-level', 'teal')
ON CONFLICT (id) DO NOTHING;
