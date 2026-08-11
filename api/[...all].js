// Vercel serverless function entry point.
// The bracket "catch-all" filename means this one file handles every request
// under /api/* (e.g. /api/people, /api/jobs/abc123, /api/find-leads) —
// no vercel.json rewrite rules are needed for that to work.
// Requests to "/", "/app.js", "/style.css" etc. never reach here at all — Vercel
// serves everything in the public/ folder automatically, straight from disk.
module.exports = require("../app");
