'use strict';

const prisma = require('../../prismaClient');
const { buildPrompt: baseBuildPrompt } = require('./avatarService');

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_AVATAR_MODEL = 'black-forest-labs/flux-schnell';

/**
 * Composes a consistent scene prompt using the character's canonical identity,
 * locking the output to the precise anime aesthetics of the story engine.
 * @param {object} characterIdentity - The character's DB object containing visual traits
 * @param {string} sceneText - The text of the current scene
 * @returns {string} The final prompt
 */
function composeConsistentScenePrompt(characterIdentity, sceneText) {
  // Extract key sentences from the scene text to guide the prompt (first and last sentence usually have action)
  const sentences = sceneText.split(/[.?!]/).filter(s => s.trim().length > 5);
  const narrativeSummary = sentences.slice(0, 2).concat(sentences.slice(-1)).join('. ');
  
  // 1. Character Identity Block
  let identityBlock = characterIdentity.canonicalDescription || characterIdentity.name;
  if (characterIdentity.visualTraits) {
    try {
       const traits = JSON.parse(characterIdentity.visualTraits);
       const traitStrings = Object.entries(traits).map(([k, v]) => `${k}: ${v}`).join(', ');
       identityBlock += `. Specific visual traits: ${traitStrings}`;
    } catch(e) { /* ignore parse error */ }
  }
  
  // 2. Anime Style Lock Block
  const fallbackStyle = "Premium anime character portrait, clean lineart, cel shading, expressive anime eyes, detailed hair, high-quality anime illustration, consistent character design";
  const styleBlock = characterIdentity.styleProfile || fallbackStyle;
  
  // 3. Scene/Action Block (FRONT-LOADED)
  const actionBlock = `CURRENT SCENE AND ACTION: ${narrativeSummary}. Focus heavily on portraying this setting and movement. Main Subject Identity: (${identityBlock}).`;
  
  // 4. Negative Prompt Block
  const defaultNeg = "photorealistic, 3d render, realistic skin, photography, live action, bad anatomy";
  const negativeBlock = characterIdentity.negativePrompt ? ` Avoid: ${characterIdentity.negativePrompt}, ${defaultNeg}.` : ` Avoid: ${defaultNeg}.`;
  
  return `${styleBlock}. ${actionBlock}. No text, no watermark.${negativeBlock}`;
}

/**
 * Background worker to call Replicate and update the scene status in the database.
 * 
 * @param {number} sceneId - The ID of the scene in the DB
 * @param {string} prompt - The image prompt
 * @param {object} [options] - Optional generation settings like seed
 */
async function generateSceneImageInBackground(sceneId, prompt, options = {}) {
  const model = process.env.AVATAR_MODEL || DEFAULT_AVATAR_MODEL;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    console.error('[sceneImageService] Missing REPLICATE_API_TOKEN, skipping background image generation.');
    await prisma.scene.update({
      where: { id: sceneId },
      data: { imageStatus: 'error' },
    });
    return;
  }

  const url = `${REPLICATE_API_BASE}/models/${model}/predictions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000); // 90s hard timeout

  try {
    console.log(`[sceneImageService] Start generation for scene ${sceneId} via ${model}`);
    
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${apiToken}`,
        Prefer: 'wait', // Block until prediction completes
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: '16:9', // Wide cinematic view
          output_format: 'webp',
          output_quality: 90,
          num_outputs: 1,
          ...(options.seed !== undefined && options.seed !== null ? { seed: options.seed } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Replicate API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Replicate did not return a valid image URL');
    }

    // Success! Update DB
    await prisma.scene.update({
      where: { id: sceneId },
      data: {
        imageStatus: 'ready',
        imageUrl,
        finalPrompt: prompt,
        negativePrompt: options.negativePrompt || null,
        referenceImageUrl: options.referenceImageUrl || null,
        seed: options.seed || null,
        providerModel: model,
        styleProfile: options.styleProfile || null
      },
    });
    console.log(`[sceneImageService] Generation successful for scene ${sceneId}`);

  } catch (error) {
    console.error(`[sceneImageService] Generation failed for scene ${sceneId}:`, error.message);
    // Mark as error
    await prisma.scene.update({
      where: { id: sceneId },
      data: { 
        imageStatus: 'error',
        finalPrompt: prompt,
        providerModel: model
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  composeConsistentScenePrompt,
  generateSceneImageInBackground,
};
