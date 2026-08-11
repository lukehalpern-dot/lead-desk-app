// Vercel serverless function entry point.
// vercel.json rewrites every /api/* request here — Express (app.js) then routes
// internally based on the original path (e.g. /api/people/p1), which is why
// req.url arrives unmodified rather than as "/api/index".
// Requests to "/", "/app.js", "/style.css" etc. never reach here at all — Vercel
// serves everything in the public/ folder automatically, straight from disk.
module.exports = require("../app");
