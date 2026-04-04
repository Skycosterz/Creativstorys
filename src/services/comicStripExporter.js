'use strict';

/**
 * @file src/services/comicStripExporter.js
 * @description Composites a sequence of scene images into a single comic-strip PNG.
 *
 * Storage:
 *   - Local dev  → saved to public/comics/ via storageService (disk fallback)
 *   - Production → uploaded to S3 via storageService, returns CDN URL
 */

const sharp = require('sharp');
const prisma = require('../../prismaClient');
const { uploadImageBuffer } = require('./storageService');

const PANEL_WIDTH = 512;
const PANEL_HEIGHT = 512;
const GUTTER = 24;
const CAPTION_HEIGHT = 48;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches a remote image URL into a Node Buffer.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[comicStripExporter] Failed to fetch panel image (${response.status}): ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Builds an SVG caption overlay for one panel.
 * @param {string} text
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} SVG buffer
 */
function buildCaptionSvg(text, width, height) {
  const safe = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const truncated = safe.length > 55 ? `${safe.substring(0, 52)}…` : safe;

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.78)"/>
  <text x="50%" y="50%"
    font-family="Arial, sans-serif" font-size="20" fill="white" font-weight="bold"
    text-anchor="middle" dominant-baseline="middle">${truncated}</text>
</svg>`;

  return Buffer.from(svg);
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Exports a story's scenes as a multi-panel comic-strip PNG.
 *
 * @param {object}   opts
 * @param {number|string} opts.storyId
 * @param {number[]} [opts.sceneIds]  — optional subset of scene IDs
 * @param {number}   [opts.maxPanels=4]
 * @param {'horizontal'|'grid'} [opts.layout='horizontal']
 * @returns {Promise<{ imageUrl: string }>}
 */
async function exportComicStrip({ storyId, sceneIds, maxPanels = 4, layout = 'horizontal' }) {
  const numericStoryId = Number(storyId);
  console.log(`[comicStripExporter] Starting export — story ${numericStoryId}, layout: ${layout}, maxPanels: ${maxPanels}`);

  // 1. Verify story exists
  const story = await prisma.story.findUnique({ where: { id: numericStoryId } });
  if (!story) throw new Error('Story not found');

  // 2. Fetch eligible scenes (must have a generated imageUrl)
  const whereClause = {
    storyId: numericStoryId,
    imageUrl: { not: null },
    imageStatus: 'ready',
  };
  if (sceneIds?.length) {
    whereClause.id = { in: sceneIds.map(Number) };
  }

  const scenes = await prisma.scene.findMany({
    where: whereClause,
    orderBy: { createdAt: 'asc' },
    take: maxPanels,
  });

  if (scenes.length === 0) {
    throw new Error('No scenes with generated images found for this story. Generate scene images first.');
  }

  const count = scenes.length;
  console.log(`[comicStripExporter] Compositing ${count} panel(s)`);

  // 3. Compute canvas geometry
  let cols, rows;
  if (layout === 'grid') {
    cols = Math.min(2, count);
    rows = Math.ceil(count / cols);
  } else {
    cols = count;
    rows = 1;
  }

  const canvasWidth  = cols * PANEL_WIDTH  + (cols + 1) * GUTTER;
  const canvasHeight = rows * PANEL_HEIGHT + (rows + 1) * GUTTER;

  // 4. Download all panel images in parallel
  const imageBuffers = await Promise.all(scenes.map(s => fetchImageBuffer(s.imageUrl)));

  // 5. Build composite job list
  const compositeJobs = [];

  for (let i = 0; i < count; i++) {
    const colIdx = i % cols;
    const rowIdx = Math.floor(i / cols);

    const left = GUTTER + colIdx * (PANEL_WIDTH + GUTTER);
    const top  = GUTTER + rowIdx * (PANEL_HEIGHT + GUTTER);

    // Resize + center-crop panel to a square
    const panelBuffer = await sharp(imageBuffers[i])
      .resize(PANEL_WIDTH, PANEL_HEIGHT, { fit: 'cover', position: 'center' })
      .toBuffer();

    compositeJobs.push({ input: panelBuffer, top, left });

    // Caption overlay at bottom of each panel
    const captionSvg = buildCaptionSvg(scenes[i].text, PANEL_WIDTH, CAPTION_HEIGHT);
    compositeJobs.push({
      input: captionSvg,
      top:  top + PANEL_HEIGHT - CAPTION_HEIGHT,
      left,
    });
  }

  // 6. Render the final composite image
  const baseCanvas = {
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 26, g: 26, b: 26, alpha: 1 },
    },
  };

  const pngBuffer = await sharp(baseCanvas)
    .composite(compositeJobs)
    .png({ quality: 90, compressionLevel: 8 })
    .toBuffer();

  console.log(`[comicStripExporter] Rendered ${(pngBuffer.length / 1024).toFixed(0)} KB PNG`);

  // 7. Upload to storage (S3 in production, local disk in dev)
  const filename = `comic-strip-${numericStoryId}-${Date.now()}.png`;
  const publicUrl = await uploadImageBuffer({
    buffer: pngBuffer,
    filename,
    folder: 'comics',
    contentType: 'image/png',
  });

  // 8. Persist result URL on the story record
  await prisma.story.update({
    where: { id: numericStoryId },
    data: { comicStripUrl: publicUrl },
  });

  console.log(`[comicStripExporter] ✅ Done — ${publicUrl}`);
  return { imageUrl: publicUrl };
}

module.exports = { exportComicStrip };
