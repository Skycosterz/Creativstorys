'use strict';

/**
 * @file src/config.js
 * @description Centralized environment configuration for the backend.
 *
 * ALL process.env reads must happen here — never inline in service files.
 * Call `validateConfig()` once during server startup to catch missing vars.
 */

const config = {
  // ── Server ────────────────────────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // ── Database ──────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL,

  // ── Ollama LLM ────────────────────────────────────────────────
  ollamaApiKey: process.env.OLLAMA_API_KEY,
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:cloud',
  ollamaHost: process.env.OLLAMA_HOST || 'https://ollama.com',

  // ── Image Generation (Replicate) ──────────────────────────────
  replicateApiToken: process.env.REPLICATE_API_TOKEN,
  avatarProvider: process.env.AVATAR_PROVIDER || 'replicate',
  avatarModel: process.env.AVATAR_MODEL || 'black-forest-labs/flux-schnell',

  // ── Asset Storage (S3-compatible) ─────────────────────────────
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  cdnBaseUrl: process.env.CDN_BASE_URL || '',

  // ── Security ──────────────────────────────────────────────────
  // List of origins allowed to access the API. In prod, this must be restricted.
  // Defaults to '*' in development for ease of use.
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*',

  // Rate Limiting settings
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,      // Global limit
  rateLimitMaxAiRequests: parseInt(process.env.RATE_LIMIT_MAX_AI_REQUESTS, 10) || 10,   // Strict AI limit

  // ── Derived helpers ───────────────────────────────────────────
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  get useS3Storage() {
    return Boolean(this.s3Bucket && this.s3AccessKeyId && this.s3SecretAccessKey);
  },
};

/**
 * Validate that all required env vars are present.
 * Call this once during startup — throws on missing vars so the
 * process fails fast instead of silently misbehaving in production.
 *
 * @throws {Error} if any required variable is missing
 */
function validateConfig() {
  const required = [
    ['OLLAMA_API_KEY', config.ollamaApiKey],
    ['DATABASE_URL', config.databaseUrl],
    ['REPLICATE_API_TOKEN', config.replicateApiToken],
  ];

  const missing = required
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in the values.'
    );
  }

  if (config.isProduction) {
    if (!process.env.ALLOWED_ORIGINS) {
      throw new Error(
        '[config] ❌ SECURITY ALERT: ALLOWED_ORIGINS must be set in production mode.\n' +
        'Example: ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://another-domain.com'
      );
    }

    if (!config.useS3Storage) {
      console.warn(
        '[config] WARNING: Running in production without S3 storage configured.\n' +
        'Comic strip images will be written to the local filesystem and will be\n' +
        'lost on restart. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.'
      );
    }
  }

  console.log(`[config] ✅ Environment validated — mode: ${config.nodeEnv}`);
}

module.exports = { config, validateConfig };
