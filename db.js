const { Pool } = require("pg");

// The schema is embedded as a string (rather than read from schema.sql at runtime)
// so it's always bundled correctly by Vercel's serverless function packaging —
// schema.sql itself is kept alongside this file purely for reference/manual use.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  beat_label  TEXT NOT NULL DEFAULT '',
  interests   TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  seniority   TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'red'
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'tip',
  status      TEXT NOT NULL DEFAULT 'open',
  date_added  TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_filed  TIMESTAMPTZ
);

INSERT INTO people (id, name, beat_label, interests, location, seniority, color)
VALUES
  ('p1', '', 'Politics & Policy', 'Political and opinion writing, health policy commentary', 'Hybrid — Northern NJ / NYC', 'Mid-level preferred, open to high-paying entry-level', 'red'),
  ('p2', '', 'Style & Beauty', 'Fashion and beauty coverage', 'Hybrid — Northern NJ / NYC', 'Mid-level preferred, open to high-paying entry-level', 'teal')
ON CONFLICT (id) DO NOTHING;
`;

let pool = null;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Missing DATABASE_URL. Copy .env.example to .env locally, or set it in your Vercel project's Environment Variables."
    );
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase (and most hosted Postgres) require SSL; this accepts their cert chain.
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

// Serverless functions can be invoked many times against the same warm process,
// so we only want to run the schema once per process rather than on every request.
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = getPool()
      .query(SCHEMA_SQL)
      .then(() => console.log("Database ready."))
      .catch((err) => {
        initPromise = null; // allow retry on the next request instead of caching a permanent failure
        throw err;
      });
  }
  return initPromise;
}

async function getPeople() {
  const { rows } = await getPool().query("SELECT * FROM people ORDER BY id");
  return rows.map(rowToPerson);
}

async function updatePerson(id, fields) {
  const allowed = ["name", "beat_label", "interests", "location", "seniority"];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    const camel = toCamel(key);
    if (Object.prototype.hasOwnProperty.call(fields, camel)) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[camel]);
    }
  }
  if (sets.length === 0) return getPerson(id);
  values.push(id);
  await getPool().query(`UPDATE people SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getPerson(id);
}

async function getPerson(id) {
  const { rows } = await getPool().query("SELECT * FROM people WHERE id = $1", [id]);
  return rows[0] ? rowToPerson(rows[0]) : null;
}

async function getJobs() {
  const { rows } = await getPool().query("SELECT * FROM jobs ORDER BY date_added DESC");
  return rows.map(rowToJob);
}

async function addJob(job) {
  const { rows } = await getPool().query(
    `INSERT INTO jobs (id, person_id, title, company, location, url, notes, source, status, date_added)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open', now())
     RETURNING *`,
    [job.id, job.personId, job.title, job.company || "", job.location || "", job.url || "", job.notes || "", job.source || "tip"]
  );
  return rowToJob(rows[0]);
}

async function setJobStatus(id, status) {
  const dateFiled = status === "filed" ? "now()" : "NULL";
  const { rows } = await getPool().query(
    `UPDATE jobs SET status = $1, date_filed = ${dateFiled} WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] ? rowToJob(rows[0]) : null;
}

async function deleteJob(id) {
  await getPool().query("DELETE FROM jobs WHERE id = $1", [id]);
}

async function resetJobs() {
  await getPool().query("DELETE FROM jobs");
}

async function existingUrlsForPerson(personId) {
  const { rows } = await getPool().query("SELECT url FROM jobs WHERE person_id = $1 AND url <> ''", [personId]);
  return new Set(rows.map((r) => r.url));
}

function rowToPerson(r) {
  return {
    id: r.id,
    name: r.name,
    beatLabel: r.beat_label,
    interests: r.interests,
    location: r.location,
    seniority: r.seniority,
    color: r.color,
  };
}

function rowToJob(r) {
  return {
    id: r.id,
    personId: r.person_id,
    title: r.title,
    company: r.company,
    location: r.location,
    url: r.url,
    notes: r.notes,
    source: r.source,
    status: r.status,
    dateAdded: r.date_added,
    dateFiled: r.date_filed,
  };
}

function toCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports = {
  ensureInit,
  getPeople,
  getPerson,
  updatePerson,
  getJobs,
  addJob,
  setJobStatus,
  deleteJob,
  resetJobs,
  existingUrlsForPerson,
};
