// Local development entry point only (npm start / node server.js).
// On Vercel, api/[...all].js exports app.js directly — this file is never used there.
require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Lead Desk running on http://localhost:${PORT}`));
