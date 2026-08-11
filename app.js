const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");

const app = express();
app.use(express.json());

// Make sure the database schema exists before handling any request.
// ensureInit() only actually runs the schema once per warm process, so this is cheap after the first hit.
app.use(async (req, res, next) => {
  try {
    await db.ensureInit();
    next();
  } catch (err) {
    console.error("Database not reachable:", err);
    res.status(500).json({ error: "Database not reachable. Check DATABASE_URL." });
  }
});

// Serves public/ locally (npm start / node server.js). On Vercel, files in public/
// are served automatically by the platform itself before requests ever reach this
// function, so this middleware is effectively unused there — kept for local dev.
app.use(express.static(path.join(__dirname, "public")));

function uid() {
  return crypto.randomBytes(6).toString("hex");
}

// ---- People ----

app.get("/api/people", async (req, res) => {
  try {
    res.json(await db.getPeople());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profiles." });
  }
});

app.put("/api/people/:id", async (req, res) => {
  try {
    const person = await db.updatePerson(req.params.id, req.body || {});
    if (!person) return res.status(404).json({ error: "No such person." });
    res.json(person);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save profile." });
  }
});

// ---- Jobs ----

app.get("/api/jobs", async (req, res) => {
  try {
    res.json(await db.getJobs());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load jobs." });
  }
});

app.post("/api/jobs", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.personId || !body.title) {
      return res.status(400).json({ error: "personId and title are required." });
    }
    // source defaults to "tip" (manually filed). The Find leads preview flow explicitly
    // passes "wire" when you choose to save a search result, so its badge stays accurate.
    const source = body.source === "wire" ? "wire" : "tip";
    const job = await db.addJob({
      id: uid(),
      personId: body.personId,
      title: body.title,
      company: body.company,
      location: body.location,
      url: body.url,
      notes: body.notes,
      source,
    });
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add that lead." });
  }
});

app.patch("/api/jobs/:id", async (req, res) => {
  try {
    const status = req.body && req.body.status;
    if (status !== "open" && status !== "filed") {
      return res.status(400).json({ error: "status must be 'open' or 'filed'." });
    }
    const job = await db.setJobStatus(req.params.id, status);
    if (!job) return res.status(404).json({ error: "No such job." });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update that lead." });
  }
});

app.delete("/api/jobs/:id", async (req, res) => {
  try {
    await db.deleteJob(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove that lead." });
  }
});

app.delete("/api/jobs", async (req, res) => {
  try {
    await db.resetJobs();
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not clear the board." });
  }
});

// ---- Find leads (live search) ----
// Disabled until ANTHROPIC_API_KEY is set in the environment. See README for how to turn it on.

app.post("/api/find-leads", async (req, res) => {
  const personId = req.body && req.body.personId;
  if (!personId) return res.status(400).json({ error: "personId is required." });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({
      ok: false,
      leads: [],
      message:
        "Live search isn't turned on yet. Add an ANTHROPIC_API_KEY environment variable to enable it — see README.md.",
    });
  }

  try {
    const person = await db.getPerson(personId);
    if (!person) return res.status(404).json({ error: "No such person." });

    const Anthropic = require("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt =
      "You are sourcing job leads for a working journalist.\n" +
      "Candidate profile:\n" +
      "- Current role: journalist at MJH Life Sciences, writes for Pharmacy Times (a healthcare/clinical trade publication); over two years there plus a prior summer internship on the same team.\n" +
      "- Seeking: " + person.seniority + " roles in healthcare-adjacent journalism, editorial, or content roles.\n" +
      "- Location requirement: " + person.location + ".\n" +
      "- Additional interest area to weight toward: " + person.interests + ".\n\n" +
      "Search thoroughly and from multiple angles before answering: check direct company career pages, LinkedIn Jobs, Indeed, MediaBistro, JournalismJobs.com, and other reputable journalism/media/health-media job boards. Vary your search terms (job titles, employer names, beats) rather than stopping after a single search — use as many searches as you're given to genuinely cover this well.\n\n" +
      "Only include REAL, currently open postings you can directly verify from your search results — never invent a posting, employer, or URL. Note any evidence of how recent/active the listing is (a posting date, 'currently accepting applications' language, etc.) in the notes field. If a listing looks stale, expired, or you can't confirm it's still open, leave it out.\n\n" +
      "Respond with ONLY a JSON array (no markdown code fences, no commentary before or after) of up to 8 objects, each with exactly these keys: \"title\", \"company\", \"location\", \"url\", \"notes\" (one short sentence on why it fits this profile, plus any recency signal you found).";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
    });

    const joined = (message.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const cleaned = joined.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("No results parsed from model response.");
    const leads = JSON.parse(cleaned.slice(start, end + 1));

    // Every result gets saved as a "candidate" — a persistent, reviewable search-history
    // entry that's separate from the real Open board. Nothing lands on the actual board
    // until the frontend explicitly promotes one via PATCH /api/jobs/:id {status:"open"}.
    const existingUrls = await db.existingUrlsForPerson(personId);
    let added = 0;
    for (const lead of leads) {
      if (!lead || !lead.title) continue;
      if (lead.url && existingUrls.has(lead.url)) continue; // already saved somewhere (candidate, open, or filed)
      await db.addJob({
        id: uid(),
        personId,
        title: lead.title,
        company: lead.company || "",
        location: lead.location || "",
        url: lead.url || "",
        notes: lead.notes || "",
        source: "wire",
        status: "candidate",
      });
      added++;
    }

    res.json({
      ok: true,
      added,
      message:
        added > 0
          ? `${added} new lead${added === 1 ? "" : "s"} found — review below and add the ones you want.`
          : "No new leads this pass.",
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false, added: 0, message: "Couldn't reach the wire. Try again in a moment." });
  }
});

module.exports = app;
