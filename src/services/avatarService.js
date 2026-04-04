'use strict';

/**
 * @file avatarService.js
 * @description Avatar Engine — generates character portrait images via a
 *   cloud text-to-image API (default: Replicate + Flux Schnell).
 *
 * Environment variables:
 *   REPLICATE_API_TOKEN  – Required. Your Replicate API token.
 *   AVATAR_PROVIDER      – Optional. Only "replicate" is supported for now.
 *   AVATAR_MODEL         – Optional. Replicate model version to use.
 *                          Default: "black-forest-labs/flux-schnell"
 *
 * No local GPU is required. Everything runs in the cloud.
 */

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

/**
 * Default Replicate model for avatar generation.
 * Flux Schnell is the fastest / cheapest variant (~$0.003/image, ~3-5s).
 * Swap to "black-forest-labs/flux-dev" or "black-forest-labs/flux-1.1-pro"
 * for higher quality at extra cost / latency.
 */
const DEFAULT_AVATAR_MODEL = 'black-forest-labs/flux-schnell';

/**
 * The only supported visual style prompt base for the Avatar Engine.
 */
const ANIME_BASE_PROMPT = 'Premium anime character portrait, clean lineart, cel shading, expressive anime eyes, detailed hair, high-quality anime illustration, consistent character design';

/**
 * Builds the image generation prompt from character metadata, enforcing a
 * 4-block anime composition.
 *
 * @param {object} options
 * @param {string} options.characterName   - Character's display name
 * @param {string} options.canonicalDescription
 * @param {string} options.shortDescription
 * @param {string} [options.negativePrompt]
 * @returns {string} The full prompt string sent to the image model
 */
function buildPrompt({ characterName, canonicalDescription, shortDescription, negativePrompt }) {
  // 1. Character identity block
  const identityBlock = canonicalDescription || shortDescription;

  // 2. Anime style lock block
  const styleBlock = ANIME_BASE_PROMPT;

  // 3. Scene/action block
  const actionBlock = `square portrait, main subject: ${characterName}, centered face, neutral background`;

  // 4. Negative prompt block (forced organically into the string for model compatibility)
  const negBlock = negativePrompt ? ` Avoid: ${negativePrompt}.` : '';

  return `${identityBlock}. ${styleBlock}. ${actionBlock}. No text, no watermark.${negBlock}`;
}

/**
 * Validates input options for avatar generation.
 *
 * @param {object} options
 * @param {string} options.characterName
 * @param {string} options.shortDescription
 * @throws {Error} If required fields are missing or invalid
 */
function validateOptions({ characterName, shortDescription }) {
  if (!characterName || typeof characterName !== 'string' || !characterName.trim()) {
    throw new Error('avatarService: characterName is required and must be a non-empty string');
  }
  if (!shortDescription || typeof shortDescription !== 'string' || !shortDescription.trim()) {
    throw new Error('avatarService: shortDescription is required and must be a non-empty string');
  }
}

/**
 * Calls the Replicate API to generate a square avatar image.
 *
 * Uses the "Prefer: wait" header so the request blocks until the prediction
 * is done (max ~60s server-side). No polling loop needed.
 *
 * @param {string} prompt - The image generation prompt
 * @param {string} apiToken - Replicate API token
 * @param {string} model - Replicate model identifier (owner/model-name)
 * @returns {Promise<string>} The public URL of the generated image
 */
async function callReplicateFlux(prompt, apiToken, model, seed) {
  const url = `${REPLICATE_API_BASE}/models/${model}/predictions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000); // 90s hard timeout

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${apiToken}`,
        Prefer: 'wait', // Block until prediction completes (avoids polling)
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: '1:1',       // Square output — perfect for avatars
          output_format: 'webp',
          output_quality: 80,
          num_outputs: 1,
          ...(seed !== undefined && seed !== null ? { seed } : {}),
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Log status only — never log the full body in case it echoes the token
    console.error(`[avatarService] Replicate API error: HTTP ${response.status}`);
    throw new Error(`Replicate API returned HTTP ${response.status}`);
  }

  const data = await response.json();

  // Replicate wraps output in an array when using "Prefer: wait"
  const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;

  if (!imageUrl || typeof imageUrl !== 'string') {
    console.error('[avatarService] Unexpected Replicate response shape:', JSON.stringify(data).slice(0, 200));
    throw new Error('Replicate did not return a valid image URL');
  }

  return imageUrl;
}

/**
 * Generates a square AI avatar for a character.
 *
 * @param {object} options
 * @param {string} options.characterName        - e.g. "Akira"
 * @param {string} options.shortDescription     - e.g. "japanese cyberpunk hacker with pink neon bangs"
 * @param {string} [options.canonicalDescription]
 * @param {string} [options.negativePrompt]
 * @returns {Promise<{ imageUrl: string }>}
 *
 * @example
 * const { imageUrl } = await generateAvatar({
 *   characterName: 'Akira',
 *   shortDescription: 'japanese cyberpunk hacker with pink neon hair'
 * });
 */
async function generateAvatar({ characterName, shortDescription, canonicalDescription, negativePrompt, seed }) {
  // --- Validate inputs ---
  validateOptions({ characterName, shortDescription });

  // --- Check provider config ---
  const provider = process.env.AVATAR_PROVIDER || 'replicate';
  if (provider !== 'replicate') {
    throw new Error(`avatarService: unsupported AVATAR_PROVIDER "${provider}". Only "replicate" is supported.`);
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('avatarService: REPLICATE_API_TOKEN is not set in environment variables');
  }

  const model = process.env.AVATAR_MODEL || DEFAULT_AVATAR_MODEL;

  // --- Build prompt ---
  const prompt = buildPrompt({ characterName, shortDescription, canonicalDescription, negativePrompt });
  console.log(`[avatarService] Generating premium anime avatar for "${characterName}" [seed=${seed || 'random'}] via ${model}`);
  console.log(`[avatarService] Prompt: ${prompt}`);

  // --- Call image API ---
  const imageUrl = await callReplicateFlux(prompt, apiToken, model, seed);

  console.log(`[avatarService] Avatar generated successfully for "${characterName}"`);
  return { imageUrl };
}

module.exports = { generateAvatar, buildPrompt };
