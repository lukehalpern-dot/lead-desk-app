const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL. Copy .env.example to .env locally, or set it in your Render environment variables."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase (and most hosted Postgres) require SSL; this accepts their cert chain.
  ssl: { rejectUnauthorized: false },
});

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Database ready.");
}

async function getPeople() {
  const { rows } = await pool.query("SELECT * FROM people ORDER BY id");
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
  await pool.query(`UPDATE people SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getPerson(id);
}

async function getPerson(id) {
  const { rows } = await pool.query("SELECT * FROM people WHERE id = $1", [id]);
  return rows[0] ? rowToPerson(rows[0]) : null;
}

async function getJobs() {
  const { rows } = await pool.query("SELECT * FROM jobs ORDER BY date_added DESC");
  return rows.map(rowToJob);
}

async function addJob(job) {
  const { rows } = await pool.query(
    `INSERT INTO jobs (id, person_id, title, company, location, url, notes, source, status, date_added)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open', now())
     RETURNING *`,
    [job.id, job.personId, job.title, job.company || "", job.location || "", job.url || "", job.notes || "", job.source || "tip"]
  );
  return rowToJob(rows[0]);
}

async function setJobStatus(id, status) {
  const dateFiled = status === "filed" ? "now()" : "NULL";
  const { rows } = await pool.query(
    `UPDATE jobs SET status = $1, date_filed = ${dateFiled} WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] ? rowToJob(rows[0]) : null;
}

async function deleteJob(id) {
  await pool.query("DELETE FROM jobs WHERE id = $1", [id]);
}

async function resetJobs() {
  await pool.query("DELETE FROM jobs");
}

async function existingUrlsForPerson(personId) {
  const { rows } = await pool.query("SELECT url FROM jobs WHERE person_id = $1 AND url <> ''", [personId]);
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
  init,
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
