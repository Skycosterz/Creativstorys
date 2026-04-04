'use strict';

/**
 * @file src/services/storageService.js
 * @description Pluggable asset storage layer.
 *
 * Behaviour:
 *   - PRODUCTION (S3_BUCKET set): uploads buffer to S3-compatible storage,
 *     returns a persistent CDN/S3 public URL.
 *   - LOCAL DEV (S3_BUCKET not set): writes buffer to `public/comics/` on disk
 *     and returns a server-relative URL. Express serves it via /public.
 *
 * This means zero code changes are needed between local and production —
 * just set the S3 env vars and it switches automatically.
 */

const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// ── Local-dev fallback ───────────────────────────────────────────────────────

const LOCAL_PUBLIC_DIR = path.join(__dirname, '../../public/comics');

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_PUBLIC_DIR)) {
    fs.mkdirSync(LOCAL_PUBLIC_DIR, { recursive: true });
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} key  e.g. "comic-strip-1-1712345678.png"
 * @returns {string} server-relative URL e.g. "/public/comics/comic-strip-1.png"
 */
async function saveLocally(buffer, key) {
  ensureLocalDir();
  const filePath = path.join(LOCAL_PUBLIC_DIR, key);
  fs.writeFileSync(filePath, buffer);
  const url = `/public/comics/${key}`;
  console.log(`[storageService] 💾 Saved locally → ${url}`);
  return url;
}

// ── S3 upload ────────────────────────────────────────────────────────────────

/**
 * Lazily loads the AWS SDK only when S3 is configured.
 * This avoids the import overhead in local dev.
 */
let _s3Client = null;
let _PutObjectCommand = null;

async function getS3Client() {
  if (!_s3Client) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    _PutObjectCommand = PutObjectCommand;
    _s3Client = new S3Client({
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    });
  }
  return { client: _s3Client, PutObjectCommand: _PutObjectCommand };
}

/**
 * @param {Buffer} buffer
 * @param {string} key       S3 object key, e.g. "comics/comic-strip-1.png"
 * @param {string} contentType  MIME type e.g. "image/png"
 * @returns {string} Public CDN URL
 */
async function uploadToS3(buffer, key, contentType) {
  const { client, PutObjectCommand } = await getS3Client();

  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // Make the object publicly readable (adjust ACL for private buckets + signed URLs)
    ACL: 'public-read',
  });

  await client.send(command);

  // Prefer CDN base URL if configured, otherwise use the standard S3 virtual-hosted URL
  const publicUrl = config.cdnBaseUrl
    ? `${config.cdnBaseUrl.replace(/\/$/, '')}/${key}`
    : `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${key}`;

  console.log(`[storageService] ☁️  Uploaded to S3 → ${publicUrl}`);
  return publicUrl;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload an image buffer to the configured storage backend.
 *
 * @param {object}  opts
 * @param {Buffer}  opts.buffer        Raw image data
 * @param {string}  opts.filename      Base filename, e.g. "comic-strip-1-1712345.png"
 * @param {string}  [opts.folder]      S3 prefix / sub-folder, e.g. "comics". Defaults to "comics".
 * @param {string}  [opts.contentType] MIME type. Defaults to "image/png".
 * @returns {Promise<string>} Absolute or server-relative public URL
 */
async function uploadImageBuffer({ buffer, filename, folder = 'comics', contentType = 'image/png' }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('[storageService] `buffer` must be a Buffer');
  }
  if (!filename) {
    throw new TypeError('[storageService] `filename` is required');
  }

  if (config.useS3Storage) {
    const key = `${folder}/${filename}`;
    return uploadToS3(buffer, key, contentType);
  }

  // Local dev fallback
  return saveLocally(buffer, filename);
}

module.exports = { uploadImageBuffer };
