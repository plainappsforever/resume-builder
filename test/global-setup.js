// Jest runs every test in German local time (CLAUDE.md, V1_PLAN rule 14): "current year" and timestamps are local.
// Set here (before workers start) so `npx jest <path>` gets it too.
module.exports = () => {
  process.env.TZ = 'Europe/Berlin';
};
