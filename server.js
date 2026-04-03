require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./prismaClient');
const { config, validateConfig } = require('./src/config');

// ── Plan Limits ────────────────────────────────────────────────
const PLAN_LIMITS = {
  FREE: 3,
  PRO: 20, // Example limit for PRO
  ADMIN: Infinity
};

async function ensureDefaultUser() {
  const defaultUser = await prisma.user.findFirst({
    where: { email: 'guest@webtooni.app' }
  });

  if (!defaultUser) {
    console.log('[Setup] Creating default guest user...');
    await prisma.user.create({
      data: {
        email: 'guest@webtooni.app',
        plan: 'FREE'
      }
    });
  }
}

// Global reference for current user for simpler MVP
// In production, this would come from Auth middleware (req.user)
async function getCurrentUser() {
  return await prisma.user.findFirst({
    where: { email: 'guest@webtooni.app' }
  });
}
const { generateAvatar } = require('./src/services/avatarService');
const { composeConsistentScenePrompt, generateSceneImageInBackground } = require('./src/services/sceneImageService');
const { exportComicStrip } = require('./src/services/comicStripExporter');
const rateLimit = require('express-rate-limit');


// Validate required env vars early — fails fast in production
try {
  validateConfig();
  ensureDefaultUser(); // [NEW] Seed default guest user
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
const PORT = config.port;

// ── Rate Limiters ──────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiGenerationLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxAiRequests,
  message: { error: 'AI generation limit reached. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Middlewares ────────────────────────────────────────────────

app.use(cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(globalLimiter);
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));


function parseId(value) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    return null;
  }
  return numberValue;
}

function normalizeCharacterIds(rawIds) {
  const ids = [];
  const invalid = [];

  for (const raw of rawIds) {
    const id = parseId(raw);
    if (id === null) {
      invalid.push(raw);
    } else {
      ids.push(id);
    }
  }

  return { ids, invalid };
}

function normalizeStoredCharacterIds(rawIds) {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  return rawIds.map((id) => parseId(id)).filter((id) => id !== null);
}

function toCharacterResponse(character) {
  return {
    id: String(character.id),
    name: character.name,
    description: character.description || '',
    persona: character.persona || '',
    goals: character.goals || '',
    limits: character.limits || '',
    avatarUrl: character.avatarUrl || null,
  };
}

function toLogEntry(scene) {
  const entry = {
    type: 'scene',
    chapter: scene.chapter,
    text: scene.text,
    createdAt: scene.createdAt.toISOString(),
    imageStatus: scene.imageStatus || 'none',
    imageUrl: scene.imageUrl || null,
    imagePrompt: scene.imagePrompt || null,
  };

  if (scene.playerInput) {
    entry.playerInput = scene.playerInput;
  }

  return entry;
}

const DEFAULT_WORLD_FLAGS = {
  confessionHappened: false,
  secretRevealed: false,
  firstKiss: false,
  fightHappened: false,
  allianceFormed: false,
};

const DEFAULT_PROTAGONIST = {
  name: 'Protagonista',
  personality: 'decidido, sensible',
  goals: 'avanzar la historia con coherencia emocional',
};

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function buildInitialRelationships(characterIds) {
  const relationships = {};
  for (const id of characterIds) {
    relationships[id] = {
      closeness: 1,
      romance: 0,
      trust: 2,
    };
  }
  return relationships;
}

function initWorldState({ genre, scenario, characterIds, protagonistId }) {
  return {
    genre: genre || 'fantasia urbana',
    scenario: scenario || '',
    chapter: 1,
    tension: 2,
    relationships: buildInitialRelationships(characterIds),
    flags: { ...DEFAULT_WORLD_FLAGS },
    arc: {
      act: 1,
      progress: 0,
      nextBeat: 'Establecer la premisa inicial',
      stakes: 'Bajos'
    },
    memories: { global: [] },
    lastActivityAt: new Date().toISOString(),
    protagonistId: protagonistId || characterIds[0] || null,
  };
}

function ensureWorldStateShape(rawState, { genre, scenario, characterIds, protagonistId }) {
  const base = initWorldState({ genre, scenario, characterIds, protagonistId });
  const state =
    rawState && typeof rawState === 'object' && !Array.isArray(rawState) ? { ...rawState } : {};

  const mergedFlags = { ...DEFAULT_WORLD_FLAGS, ...(state.flags || {}) };
  const existingRelationships =
    state.relationships && typeof state.relationships === 'object' && !Array.isArray(state.relationships)
      ? { ...state.relationships }
      : {};

  const normalizedRelationships = buildInitialRelationships(characterIds);
  for (const [id, relation] of Object.entries(existingRelationships)) {
    normalizedRelationships[id] = {
      closeness: clampNumber(ensureNumber(relation?.closeness, 1), -10, 10),
      romance: clampNumber(ensureNumber(relation?.romance, 0), 0, 10),
      trust: clampNumber(ensureNumber(relation?.trust, 2), 0, 10),
    };
  }

  const arc = state.arc && typeof state.arc === 'object' ? { ...base.arc, ...state.arc } : { ...base.arc };
  const memories = state.memories && typeof state.memories === 'object' ? { ...base.memories, ...state.memories } : { ...base.memories };

  return {
    ...base,
    ...state,
    chapter: ensureNumber(state.chapter, base.chapter),
    tension: clampNumber(ensureNumber(state.tension, base.tension), 0, 10),
    relationships: normalizedRelationships,
    flags: mergedFlags,
    arc,
    memories,
    protagonistId: state.protagonistId || base.protagonistId,
  };
}

function detectNarrativeFlags(text) {
  if (!text || typeof text !== 'string') return {};
  const lower = text.toLowerCase();

  return {
    confessionHappened: /(te amo|te quiero|me gustas|confieso|confesión|declara su amor)/.test(lower),
    secretRevealed: /(secreto|verdad oculta|revela la verdad|confiesa el secreto)/.test(lower),
    firstKiss: /(primer beso|beso|se besan|me besa|lo besa|la besa|nos besamos)/.test(lower),
    fightHappened: /(pelea|discusión fuerte|golpe|gritos|amenaza|se enfrenta)/.test(lower),
    allianceFormed: /(alianza|se unen|pacto|acuerdo|equipo|promesa)/.test(lower),
  };
}

function updateWorldStateAfterScene(worldState, sceneText, { protagonistId } = {}) {
  const next = ensureWorldStateShape(worldState, {
    genre: worldState?.genre,
    scenario: worldState?.scenario,
    characterIds: Object.keys(worldState?.relationships || {}),
    protagonistId: worldState?.protagonistId || protagonistId,
  });

  next.chapter = ensureNumber(next.chapter, 0) + 1;
  next.tension = clampNumber(ensureNumber(next.tension, 0) + 1, 0, 10);
  next.lastActivityAt = new Date().toISOString();

  if (protagonistId && next.relationships?.[protagonistId]) {
    const current = next.relationships[protagonistId];
    next.relationships[protagonistId] = {
      ...current,
      closeness: clampNumber(ensureNumber(current.closeness, 1) + 1, -10, 10),
    };
  }

  const detectedFlags = detectNarrativeFlags(sceneText);
  const mergedFlags = { ...DEFAULT_WORLD_FLAGS, ...next.flags };
  for (const [key, value] of Object.entries(detectedFlags)) {
    if (value) mergedFlags[key] = true;
  }
  next.flags = mergedFlags;

  return next;
}

/**
 * Utilidad: llamada al LLM en Ollama Cloud
 */
async function callLLM({ systemPrompt, worldState, messages }) {
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_MODEL || 'llama3.2:cloud';
  const host = process.env.OLLAMA_HOST || 'https://ollama.com';

  if (!apiKey) {
    throw new Error('Falta OLLAMA_API_KEY en .env');
  }

  const chatMessages = [
    {
      role: 'system',
      content:
        systemPrompt +
        '\n\nEstado actual del mundo (JSON, no lo muestres literal al usuario, solo úsalo como contexto interno):\n' +
        JSON.stringify(worldState),
    },
    ...messages,
  ];

  const url = `${host}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: false,
      options: {
        temperature: 0.9,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Error Ollama Cloud:', response.status, text);
    throw new Error(`Ollama Cloud error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.message?.content || '';

  return content;
}

/**
 * Asynchronously evaluates the latest scene to extract memories and progress the story arc.
 */
async function updateMemoryAndArcInBackground(storyId, latestSceneText) {
  try {
    const story = await prisma.story.findUnique({ where: { id: parseInt(storyId) } });
    if (!story) return;

    // Use ensureWorldStateShape to provide defaults if missing
    const ws = ensureWorldStateShape(story.worldState, { characterIds: [] });
    
    const prompt = `Analiza la ultima escena de la historia.
Escena: "${latestSceneText}"

Estado actual del arco narrativo:
Progreso actual: ${ws.arc?.progress || 0}%
Objetivo actual: ${ws.arc?.nextBeat || 'Desconocido'}
Riesgo: ${ws.arc?.stakes || 'Bajos'}

Actualiza el progreso de la historia (0 a 100), el proximo objetivo narrativo (nextBeat) y el nivel de riesgo (stakes). Si hubo un evento muy importante, extrae una nueva memoria global (máximo 1 o 2 oraciones, o omitelo si no es muy relevante).

Responde ÚNICAMENTE en JSON válido con esta estructura:
{
  "arc": {
     "act": 1,
     "progress": <number>,
     "nextBeat": "<string>",
     "stakes": "<string>"
  },
  "newMemories": ["str1"]
}`;

    const jsonStr = await callLLM({
       systemPrompt: 'Responde puramente en formato JSON estricto sin bloques Markdown.',
       worldState: {},
       messages: [{ role: 'user', content: prompt }]
    });

    const cleanJson = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (parsed.arc) {
       ws.arc = { ...ws.arc, ...parsed.arc };
    }
    
    if (Array.isArray(parsed.newMemories) && parsed.newMemories.length > 0) {
       ws.memories = ws.memories || { global: [] };
       ws.memories.global = [...(ws.memories.global || []), ...parsed.newMemories].slice(-15);
    }

    await prisma.story.update({
       where: { id: parseInt(storyId) },
       data: { worldState: ws }
    });
    console.log(`[Memory Engine] Story ${storyId} Arc/Memory updated. Progress: ${ws.arc.progress}%`);
  } catch (error) {
    console.error('[Memory Engine] Error:', error.message);
  }
}

/**
 * Construye el prompt de sistema a partir de estado del mundo y personajes.
 * Aquí puedes ser tan hardcore como quieras con reglas, tono, género, etc.
 */
function buildSystemPrompt(story, characterObjects) {
  const worldState = story?.worldState || {};
  const flags = { ...DEFAULT_WORLD_FLAGS, ...(worldState.flags || {}) };
  const relationships = worldState.relationships || {};
  const protagonistId = worldState.protagonistId;
  const protagonist =
    characterObjects.find((c) => String(c.id) === String(protagonistId)) || characterObjects[0];
  const protagonistProfile = {
    name: protagonist?.name || DEFAULT_PROTAGONIST.name,
    personality: protagonist?.persona || DEFAULT_PROTAGONIST.personality,
    goals: protagonist?.goals || DEFAULT_PROTAGONIST.goals,
  };

  const flagsSummary = Object.entries(flags)
    .map(([key, value]) => `- ${key}: ${value ? 'sí' : 'no'}`)
    .join('\n');

  const characterSummary = characterObjects
    .map((character) => {
      const relation = relationships[character.id] || { closeness: 1, romance: 0, trust: 2 };
      const closeness = ensureNumber(relation.closeness, 1);
      const romance = ensureNumber(relation.romance, 0);
      const trust = ensureNumber(relation.trust, 2);

      return `- ${character.name}
  - Personalidad: ${character.persona || 'no definida'}
  - Objetivos: ${character.goals || 'no definidos'}
  - Límites de contenido: ${character.limits || 'no definidos'}
  - Relación con el protagonista: cercanía ${closeness}, romance ${romance}, confianza ${trust}`;
    })
    .join('\n');

  const arcStr = worldState.arc ? `
ARCO NARRATIVO (Acto ${worldState.arc.act || 1})
- Progreso de historia: ${worldState.arc.progress}%
- Siguiente objetivo / Beat: ${worldState.arc.nextBeat}
- Nivel de riesgo (Stakes): ${worldState.arc.stakes}` : '';

  const mems = worldState.memories?.global || [];
  const memStr = mems.length > 0 ? `
HECHOS Y MEMORIAS CLAVES:
${mems.map(m => '- ' + m).join('\n')}` : '';

  return `
ROL DEL MODELO
Eres un Narrative Engine / Game Master. Tu trabajo es crear escenas con ritmo, tensión y emoción.

REGLAS DE ESTILO
- Idioma: español latino neutro.
- El jugador escribe en primera persona ("yo"). Tú narras en tercera persona como NARRADOR e incluyes diálogos.
- NO uses "el jugador", "tú" ni "usuario". SIEMPRE usa el nombre del protagonista en tercera persona: ${protagonistProfile.name}.
- Tono: fantasía urbana / slice of life con romance y drama ligero.
- Evita gore, violencia extrema o contenido explícito.
- Cada respuesta es UNA escena que avanza la historia y deja un gancho claro.
- No menciones que eres una IA ni hables de prompts, tokens o sistema.

ARQUITECTURA NARRATIVA
- Mantén una progresión clara: planteamiento → tensión → revelación → consecuencia.
- Da prioridad a emociones, gestos y decisiones pequeñas con impacto.
- Muestra conflictos internos y subtexto en los diálogos.

MUNDO Y ESTADO ACTUAL
- Título: ${story?.title || 'Historia sin título'}
- Género: ${worldState.genre || 'fantasia urbana'}
- Escenario: ${worldState.scenario || 'sin escenario definido'}
- Capítulo actual: ${ensureNumber(worldState.chapter, 1)}
- Tensión (0-10): ${ensureNumber(worldState.tension, 2)}
- Flags de eventos clave:
${flagsSummary}
${arcStr}
${memStr}

PROTAGONISTA
- Nombre: ${protagonistProfile.name}
- Personalidad: ${protagonistProfile.personality}
- Objetivos: ${protagonistProfile.goals}

PERSONAJES
${characterSummary || 'No hay personajes definidos.'}

INSTRUCCIONES DE MEMORIA
- Mantén continuidad con eventos pasados y decisiones del jugador.
- Si un evento clave está marcado en flags, debe influir en el comportamiento, diálogo y tono.
- No contradigas datos esenciales del worldState (p. ej. no revivir personajes muertos).

REGLAS DE RESPUESTA
- Entrega una sola escena.
- Comienza con "NARRADOR:".
- Incluye diálogos de personajes cuando sea natural.
- Cierra con una situación abierta, pregunta o tensión latente.

USO DEL INPUT DEL JUGADOR (CRÍTICO)
- El jugador escribe acciones y diálogos en primera persona ("yo").
- NUNCA repitas ni copies literalmente el texto del jugador.
- No empieces resumiendo o parafraseando el input del jugador.
- Usa el input SOLO como referencia interna para continuar la escena desde donde quedó.
- Describe las CONSECUENCIAS de la acción del jugador, las reacciones del entorno y de los demás personajes.
- Si el jugador ya describió una acción, tu respuesta muestra lo que pasa DESPUÉS, no re-narras lo mismo.
- Nunca escribas en primera persona como si fueras el jugador; siempre en tercera persona y diálogo de personajes.
- Interpreta el input del jugador como acciones de ${protagonistProfile.name} y nómbralo explícitamente en tus respuestas.
- Akira (y el resto) deben reaccionar siguiendo su personalidad del BD sin volverse genéricos.
`;
}

// Health check (for Railway / Render / Fly.io)
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

// Legacy root health check — kept for backward compat
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Story/roleplay engine MVP online' });
});

/**
 * POST /characters
 * Crea un personaje
 * body: { name, description?, persona?, goals?, limits? }
 */
app.post('/characters', async (req, res) => {
  const { name, description, persona, goals, limits } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name es requerido' });
  }

  // Freemium Enforcement
  const user = await getCurrentUser();
  const currentCount = await prisma.character.count({
    where: { userId: user.id }
  });

  const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.FREE;

  if (currentCount >= limit) {
    return res.status(403).json({
      error: 'Limit hit',
      limit,
      currentCount,
      plan: user.plan,
      message: `Has alcanzado el limite de ${limit} personajes para tu plan ${user.plan}. ¡Sube a PRO para crear mas!`
    });
  }

  const character = await prisma.character.create({
    data: {
      name,
      description: description || '',
      persona: persona || '',
      goals: goals || '',
      limits: limits || '',
      userId: user.id, // [NEW] Link to default user
    },
  });

  res.status(201).json(toCharacterResponse(character));
});

/**
 * GET /characters
 * Lista personajes (MVP)
 */
app.get('/characters', async (req, res) => {
  const characters = await prisma.character.findMany({ orderBy: { id: 'desc' } });
  res.json(characters.map(toCharacterResponse));
});

/**
 * POST /stories/start
 * Crea una nueva historia
 * body: { title, genre, scenario, characterIds: [] }
 */
app.post('/stories/start', aiGenerationLimiter, async (req, res) => {

  const { title, genre, scenario, characterIds } = req.body;

  if (!title || !genre || !scenario || !Array.isArray(characterIds) || characterIds.length === 0) {
    return res.status(400).json({
      error: 'title, genre, scenario y characterIds[] son requeridos',
    });
  }

  const { ids, invalid } = normalizeCharacterIds(characterIds);
  if (invalid.length > 0) {
    return res.status(400).json({ error: 'characterIds inválidos', invalid });
  }

  const uniqueIds = [...new Set(ids)];
  const characters = await prisma.character.findMany({
    where: { id: { in: uniqueIds } },
  });

  const foundIds = new Set(characters.map((c) => c.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id)).map(String);

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Algunos characterIds no existen', missing });
  }

  const characterMap = new Map(characters.map((c) => [c.id, c]));
  const characterObjects = ids.map((id) => characterMap.get(id)).filter(Boolean);

  // Estado inicial de mundo para esta historia
  const worldState = initWorldState({
    genre,
    scenario,
    characterIds: ids,
    protagonistId: ids[0],
  });

  // Primera escena generada por el modelo
  const systemPrompt = buildSystemPrompt({ title, worldState }, characterObjects);
  const firstScene = await callLLM({
    systemPrompt,
    worldState,
    messages: [
      {
        role: 'user',
        content: `Empieza la historia "${title}" en el escenario: ${scenario}.`,
      },
    ],
  });

  const now = new Date();
  const mainCharId = worldState.protagonistId || ids[0];
  const primaryCharacter = characterObjects.find(c => String(c.id) === String(mainCharId)) || characterObjects[0];
  const imagePrompt = composeConsistentScenePrompt(primaryCharacter, firstScene);

  const user = await getCurrentUser();
  const story = await prisma.story.create({
    data: {
      title,
      genre,
      scenario,
      status: 'in_progress',
      worldState,
      characterIds: ids,
      lastActivityAt: now,
      messageCount: 1,
      userId: user.id, // [NEW] Link to default user
      scenes: {
        create: {
          chapter: worldState.chapter,
          text: firstScene,
          imageStatus: 'pending',
          imagePrompt: imagePrompt,
        },
      },
    },
    include: {
      scenes: { orderBy: { createdAt: 'asc' } },
    },
  });

  const newSceneRecord = story.scenes[0];
  const dynamicSceneSeed = Math.floor(Math.random() * 2147483647);
  generateSceneImageInBackground(newSceneRecord.id, imagePrompt, {
    seed: dynamicSceneSeed, // Explicitly separate from avatar seed to force variation
    negativePrompt: primaryCharacter.negativePrompt,
    referenceImageUrl: primaryCharacter.referenceImageUrl,
    styleProfile: primaryCharacter.styleProfile
  }).catch(console.error);

  res.status(201).json({
    storyId: String(story.id),
    title: story.title,
    worldState: story.worldState,
    log: story.scenes.map(toLogEntry),
    synopsis: story.synopsis || '',
    status: story.status,
    lastActivityAt: story.lastActivityAt,
    messageCount: story.messageCount,
  });
});

/**
 * POST /stories/:id/continue
 * Continúa una historia existente con input del jugador
 * body: { input }  (lo que el jugador hace/dice en role-play)
 */
app.post('/stories/:id/continue', aiGenerationLimiter, async (req, res) => {

  const storyId = parseId(req.params.id);
  const { input } = req.body;

  if (storyId === null) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'input (string) es requerido' });
  }

  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  const storedCharacterIds = normalizeStoredCharacterIds(story.characterIds);
  const uniqueIds = [...new Set(storedCharacterIds)];
  const characters = uniqueIds.length
    ? await prisma.character.findMany({ where: { id: { in: uniqueIds } } })
    : [];

  const characterMap = new Map(characters.map((c) => [c.id, c]));
  const characterObjects = storedCharacterIds
    .map((id) => characterMap.get(id))
    .filter(Boolean);

  const worldState = ensureWorldStateShape(story.worldState, {
    genre: story.genre,
    scenario: story.scenario,
    characterIds: storedCharacterIds,
    protagonistId: story.worldState?.protagonistId || storedCharacterIds[0],
  });

  const systemPrompt = buildSystemPrompt({ title: story.title, worldState }, characterObjects);

  // Mensajes: podrías mandar también últimos N logs como contexto
  const messages = [
    {
      role: 'user',
      content: `El jugador hace/describe lo siguiente en primera persona: "${input}".
Genera la siguiente escena de la historia, avanzando la trama.`,
    },
  ];

  const newScene = await callLLM({
    systemPrompt,
    worldState,
    messages,
  });

  const protagonistId = worldState.protagonistId || storedCharacterIds[0];
  const updatedWorldState = updateWorldStateAfterScene(worldState, newScene, {
    protagonistId,
  });

  const now = new Date();
  const mainCharId = worldState.protagonistId || storedCharacterIds[0];
  const primaryCharacter = characterObjects.find(c => String(c.id) === String(mainCharId)) || characterObjects[0];
  const imagePrompt = composeConsistentScenePrompt(primaryCharacter, newScene);

  const [updatedStory, newSceneRecord] = await prisma.$transaction([
    prisma.story.update({
      where: { id: storyId },
      data: {
        worldState: updatedWorldState,
        lastActivityAt: now,
        messageCount: { increment: 1 },
      },
    }),
    prisma.scene.create({
      data: {
        storyId,
        chapter: updatedWorldState.chapter,
        text: newScene,
        playerInput: input,
        imageStatus: 'pending',
        imagePrompt: imagePrompt,
      },
    }),
  ]);

  const dynamicSceneSeed = Math.floor(Math.random() * 2147483647);
  generateSceneImageInBackground(newSceneRecord.id, imagePrompt, {
    seed: dynamicSceneSeed, // Explicitly separate from avatar seed to force variation
    negativePrompt: primaryCharacter.negativePrompt,
    referenceImageUrl: primaryCharacter.referenceImageUrl,
    styleProfile: primaryCharacter.styleProfile
  }).catch(console.error);

  // Trigger background extraction
  updateMemoryAndArcInBackground(storyId, newScene).catch(console.error);

  const scenes = await prisma.scene.findMany({
    where: { storyId },
    orderBy: { createdAt: 'asc' },
  });

  const newMessageCount =
    typeof story.messageCount === 'number' ? story.messageCount + 1 : scenes.length;

  res.json({
    storyId: String(storyId),
    worldState: updatedWorldState,
    latestScene: newScene,
    log: scenes.map(toLogEntry),
    lastActivityAt: now,
    messageCount: newMessageCount,
  });
});

/**
 * GET /stories
 * Lista historias guardadas
 */
app.get('/stories', async (req, res) => {
  const stories = await prisma.story.findMany({
    orderBy: { lastActivityAt: 'desc' },
    select: {
      id: true,
      title: true,
      synopsis: true,
      status: true,
      worldState: true,
      lastActivityAt: true,
      messageCount: true,
      createdAt: true,
    },
  });

  res.json(
    stories.map((story) => ({
      id: String(story.id),
      title: story.title,
      synopsis: story.synopsis || '',
      status: story.status,
      worldState: story.worldState,
      lastActivityAt: story.lastActivityAt,
      messageCount: story.messageCount,
      createdAt: story.createdAt,
    }))
  );
});

/**
 * PATCH /stories/:id
 * Actualiza campos básicos de una historia
 */
app.patch('/stories/:id', async (req, res) => {
  const storyId = parseId(req.params.id);

  if (storyId === null) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  const { title, synopsis, status } = req.body || {};
  const data = {};

  if (typeof title === 'string') {
    const trimmedTitle = title.trim();
    if (trimmedTitle) data.title = trimmedTitle;
  }

  if (typeof synopsis === 'string') {
    data.synopsis = synopsis.trim();
  }

  if (typeof status === 'string') {
    const allowed = new Set(['in_progress', 'paused', 'completed', 'archived']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  const existing = await prisma.story.findUnique({ where: { id: storyId } });
  if (!existing) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  const updated = await prisma.story.update({
    where: { id: storyId },
    data,
  });

  res.json({
    id: String(updated.id),
    title: updated.title,
    synopsis: updated.synopsis || '',
    status: updated.status,
    worldState: updated.worldState,
    lastActivityAt: updated.lastActivityAt,
    messageCount: updated.messageCount,
    createdAt: updated.createdAt,
  });
});

/**
 * GET /stories/:id
 * Devuelve el estado completo de una historia
 */
app.get('/stories/:id', async (req, res) => {
  const storyId = parseId(req.params.id);

  if (storyId === null) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { scenes: { orderBy: { createdAt: 'asc' } } },
  });

  if (!story) {
    return res.status(404).json({ error: 'Story no encontrada' });
  }

  res.json({
    id: String(story.id),
    title: story.title,
    synopsis: story.synopsis || '',
    status: story.status,
    lastActivityAt: story.lastActivityAt,
    messageCount: story.messageCount,
    createdAt: story.createdAt,
    characterIds: normalizeStoredCharacterIds(story.characterIds).map(String),
    worldState: story.worldState,
    log: story.scenes.map(toLogEntry),
  });
});

/**
 * GET /characters/:id
 * Devuelve un personaje por ID (incluye avatarUrl)
 */
app.get('/characters/:id', async (req, res) => {
  const characterId = parseId(req.params.id);
  if (characterId === null) {
    return res.status(400).json({ error: 'ID de personaje inválido' });
  }

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    return res.status(404).json({ error: 'Personaje no encontrado' });
  }

  res.json(toCharacterResponse(character));
});

/**
 * Uses the local/cloud LLM to expand a simple character description into a canonical identity.
 * Specifically engineered to enforce a premium anime aesthetic.
 */
async function expandCharacterIdentity(characterName, shortDescription) {
  const prompt = `You are an expert anime character designer.
Analyze the following description for character "${characterName}":
"${shortDescription}"

You must design this character strictly in a premium anime style.
Output JSON ONLY with the following schema:
{
  "canonicalDescription": "A robust 2-sentence visual description of the character.",
  "visualTraits": {
    "genderPresentation": "...",
    "approximateAge": "...",
    "hair": "...",
    "eyes": "...",
    "skin": "...",
    "faceShape": "...",
    "build": "...",
    "signatureClothes": "...",
    "colorPalette": "..."
  },
  "styleProfile": "e.g., premium anime illustration, clean cel shading, highly detailed anime art",
  "negativePrompt": "e.g., photorealistic, 3d render, realistic skin, photography, live action, bad anatomy"
}`;
  
  try {
    const responseText = await callLLM({
       systemPrompt: 'Respond only with pure JSON. Do not use Markdown blocks.',
       worldState: {},
       messages: [{ role: 'user', content: prompt }]
    });
    
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch(e) {
     console.error('[expandCharacterIdentity] Failed to parse identity JSON:', e.message);
     return {
       canonicalDescription: shortDescription,
       visualTraits: { description: shortDescription },
       styleProfile: 'premium anime illustration, cel shading, highly detailed',
       negativePrompt: 'photorealistic, 3d render, realism, live action, deformed face, blurry'
     };
  }
}

/**
 * POST /api/avatars/generate
 * Genera un avatar AI para un personaje y persiste la identidad y URL en la DB.
 *
 * Body JSON:
 *   characterId     {string}  – ID del personaje en la DB
 *   characterName   {string}  – Nombre visible del personaje
 *   shortDescription{string}  – Descripción visual, e.g. "pink neon hair hacker"
 *   style           {string?} – "realistic" | "anime" | "illustration" (default: "realistic")
 *
 * Response JSON:
 *   { imageUrl: string, characterId: string }
 */
app.post('/api/avatars/generate', aiGenerationLimiter, async (req, res) => {
  const { characterId, characterName, shortDescription } = req.body || {};

  // --- Input validation ---
  if (!characterId) {
    return res.status(400).json({ error: 'characterId es requerido' });
  }
  if (!characterName || typeof characterName !== 'string' || !characterName.trim()) {
    return res.status(400).json({ error: 'characterName es requerido y debe ser texto' });
  }
  if (!shortDescription || typeof shortDescription !== 'string' || !shortDescription.trim()) {
    return res.status(400).json({ error: 'shortDescription es requerido y debe ser texto' });
  }

  const numericId = parseId(characterId);
  if (numericId === null) {
    return res.status(400).json({ error: 'characterId debe ser un número entero válido' });
  }

  // --- Verify character exists ---
  const existing = await prisma.character.findUnique({ where: { id: numericId } });
  if (!existing) {
    return res.status(404).json({ error: 'Personaje no encontrado' });
  }

  // --- Generate canonical identity ---
  const identity = await expandCharacterIdentity(characterName, shortDescription);
  const seed = Math.floor(Math.random() * 2147483647);

  // --- Generate avatar ---
  let imageUrl;
  try {
    const result = await generateAvatar({
      characterName: characterName.trim(),
      shortDescription: shortDescription.trim(),
      canonicalDescription: identity.canonicalDescription,
      negativePrompt: identity.negativePrompt, // passing negative prompt down
      seed,
    });
    imageUrl = result.imageUrl;
  } catch (err) {
    // Distinguish config errors from upstream API failures
    if (err.message.includes('REPLICATE_API_TOKEN')) {
      console.error('[/api/avatars/generate] Missing API token');
      return res.status(503).json({
        error: 'El servicio de avatares no está configurado. Agrega REPLICATE_API_TOKEN al .env',
      });
    }
    console.error('[/api/avatars/generate] Generation failed:', err.message);
    return res.status(502).json({ error: 'Error al generar el avatar. Inténtalo de nuevo.' });
  }

  // --- Persist URL and Identity to DB ---
  const updated = await prisma.character.update({
    where: { id: numericId },
    data: { 
      avatarUrl: imageUrl,
      referenceImageUrl: imageUrl, // Stored explicitly as a reusable reference image
      canonicalDescription: identity.canonicalDescription,
      visualTraits: JSON.stringify(identity.visualTraits),
      styleProfile: identity.styleProfile,
      negativePrompt: identity.negativePrompt,
      seed,
    },
  });

  res.json({
    imageUrl,
    characterId: String(updated.id),
  });
});

/**
 * ==========================================
 * WEBTOON PUBLISHING API ENDPOINTS
 * ==========================================
 */

/**
 * GET /api/home/stories
 * Fetch all published stories for the Home feed.
 */
app.get('/api/home/stories', async (req, res) => {
  try {
    const stories = await prisma.story.findMany({
      where: { publishStatus: 'published' },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        episodes: {
          where: { publishStatus: 'published' },
          orderBy: { episodeNumber: 'desc' },
          take: 1,
        },
      },
    });

    res.json(stories.map(story => ({
      id: String(story.id),
      title: story.title,
      synopsis: story.synopsis || '',
      genre: story.genre,
      coverImageUrl: story.coverImageUrl,
      publishStatus: story.publishStatus,
      lastActivityAt: story.lastActivityAt,
      latestEpisode: story.episodes[0] ? {
        id: String(story.episodes[0].id),
        title: story.episodes[0].title,
        episodeNumber: story.episodes[0].episodeNumber,
      } : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching home stories' });
  }
});

/**
 * GET /api/series/:id
 * Fetch a published story and its published episodes.
 */
app.get('/api/series/:id', async (req, res) => {
  const storyId = parseId(req.params.id);
  if (storyId === null) return res.status(404).json({ error: 'Story not found' });

  try {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        episodes: {
          where: { publishStatus: 'published' },
          orderBy: { episodeNumber: 'asc' },
        },
      },
    });

    if (!story) return res.status(404).json({ error: 'Story not found' });

    res.json({
      id: String(story.id),
      title: story.title,
      synopsis: story.synopsis || '',
      genre: story.genre,
      coverImageUrl: story.coverImageUrl,
      publishStatus: story.publishStatus,
      episodes: story.episodes.map(ep => ({
        id: String(ep.id),
        title: ep.title,
        episodeNumber: ep.episodeNumber,
        publishedAt: ep.publishedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching series' });
  }
});

/**
 * GET /api/episodes/:id
 * Fetch an episode and its scenes for the reader.
 */
app.get('/api/episodes/:id', async (req, res) => {
  const episodeId = parseId(req.params.id);
  if (episodeId === null) return res.status(404).json({ error: 'Episode not found' });

  try {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        story: { select: { title: true, id: true } },
        scenes: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!episode) return res.status(404).json({ error: 'Episode not found' });

    res.json({
      id: String(episode.id),
      storyId: String(episode.storyId),
      storyTitle: episode.story.title,
      title: episode.title,
      episodeNumber: episode.episodeNumber,
      scenes: episode.scenes.map(toLogEntry),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching episode' });
  }
});

/**
 * POST /api/stories/:id/episodes
 * Group unassigned scenes of a story into a new Episode.
 */
app.post('/api/stories/:id/episodes', async (req, res) => {
  const storyId = parseId(req.params.id);
  if (storyId === null) return res.status(404).json({ error: 'Story not found' });

  try {
    // 1. Get current max episode number
    const lastEpisode = await prisma.episode.findFirst({
      where: { storyId },
      orderBy: { episodeNumber: 'desc' },
    });
    const nextNumber = lastEpisode ? lastEpisode.episodeNumber + 1 : 1;

    // 2. Find unassigned scenes
    const unassignedScenes = await prisma.scene.findMany({
      where: { storyId, episodeId: null },
      orderBy: { createdAt: 'asc' },
    });

    if (unassignedScenes.length === 0) {
      return res.status(400).json({ error: 'No unassigned scenes available to form an episode' });
    }

    // 3. Create episode and assign scenes
    const newEpisode = await prisma.episode.create({
      data: {
        storyId,
        title: `Episodio ${nextNumber}`,
        episodeNumber: nextNumber,
        publishStatus: 'draft',
      },
    });

    await prisma.scene.updateMany({
      where: { id: { in: unassignedScenes.map(s => s.id) } },
      data: { episodeId: newEpisode.id },
    });

    // 4. Return new episode
    const episodeWithScenes = await prisma.episode.findUnique({
      where: { id: newEpisode.id },
      include: { scenes: { orderBy: { createdAt: 'asc' } } },
    });

    res.status(201).json({
      id: String(episodeWithScenes.id),
      title: episodeWithScenes.title,
      episodeNumber: episodeWithScenes.episodeNumber,
      publishStatus: episodeWithScenes.publishStatus,
      sceneCount: episodeWithScenes.scenes.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creating episode' });
  }
});

/**
 * PATCH /api/stories/:id/publish
 * Toggle publishStatus and coverImageUrl of a story.
 */
app.patch('/api/stories/:id/publish', async (req, res) => {
  const storyId = parseId(req.params.id);
  if (storyId === null) return res.status(404).json({ error: 'Story not found' });

  const { publishStatus, coverImageUrl } = req.body || {};
  const data = {};

  if (publishStatus === 'draft' || publishStatus === 'published') {
    data.publishStatus = publishStatus;
  }
  if (typeof coverImageUrl === 'string') {
    data.coverImageUrl = coverImageUrl;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const updated = await prisma.story.update({
      where: { id: storyId },
      data,
    });
    res.json({
      id: String(updated.id),
      publishStatus: updated.publishStatus,
      coverImageUrl: updated.coverImageUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating publish status' });
  }
});

/**
 * PATCH /api/episodes/:id/publish
 * Toggle publishStatus of an episode.
 */
app.patch('/api/episodes/:id/publish', async (req, res) => {
  const episodeId = parseId(req.params.id);
  if (episodeId === null) return res.status(404).json({ error: 'Episode not found' });

  const { publishStatus, title } = req.body || {};
  const data = {};

  if (publishStatus === 'draft' || publishStatus === 'published') {
    data.publishStatus = publishStatus;
    if (publishStatus === 'published') {
      data.publishedAt = new Date();
    }
  }
  if (typeof title === 'string' && title.trim()) {
      data.title = title.trim();
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const updated = await prisma.episode.update({
      where: { id: episodeId },
      data,
    });
    res.json({
      id: String(updated.id),
      title: updated.title,
      publishStatus: updated.publishStatus,
      publishedAt: updated.publishedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating episode' });
  }
});

/**
 * POST /api/stories/:id/comic-strip
 * Exports scenes into a single comic strip PNG format.
 */
app.post('/api/stories/:id/comic-strip', aiGenerationLimiter, async (req, res) => {

  const storyId = parseId(req.params.id);
  if (storyId === null) return res.status(404).json({ error: 'Story not found' });

  const { sceneIds, maxPanels, layout } = req.body || {};

  try {
    const result = await exportComicStrip({
      storyId,
      sceneIds,
      maxPanels: maxPanels || 4,
      layout: layout || 'horizontal'
    });
    
    res.json(result);
  } catch (err) {
    console.error('[/api/stories/:id/comic-strip] Error:', err.message);
    res.status(400).json({ error: err.message || 'Server error generating comic strip' });
  }
});

// Arrancar servidor
app.listen(PORT, () => {
  console.log(`Story engine MVP escuchando en http://localhost:${PORT}`);
});
