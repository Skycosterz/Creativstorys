// Vercel entry point for the serverless function.
// It imports the primary Express app and exports it for the @vercel/node builder.
const app = require('../server');

module.exports = app;
