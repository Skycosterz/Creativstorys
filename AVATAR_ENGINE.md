# Avatar Engine

The Avatar Engine generates AI portrait images for characters in **Creativstorias** using **Replicate + Flux Schnell**.

- ✅ Cloud-only — no local GPU required  
- ✅ Cheap (~$0.003 per image, ~4 s generation time)  
- ✅ Square 1:1 portraits, ideal for character cards  
- ✅ Persisted to the database — only generated once per character unless you regenerate

---

## Setup

### 1. Get a Replicate API token

1. Sign up (free) at [replicate.com](https://replicate.com)
2. Go to **Account → API Tokens** and create a new token
3. Add it to your `.env`:

```env
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
AVATAR_PROVIDER=replicate
```

### 2. Run the migration (one-time)

The `avatarUrl` column is already migrated if you pulled this repo after March 2026.  
If you need to re-run it:

```bash
npx prisma migrate dev
npx prisma generate
```

---

## How It Works

```
POST /api/avatars/generate
        │
        ▼
avatarService.js
  buildPrompt()        ← constructs the image prompt from character metadata
  callReplicateFlux()  ← calls Replicate API (Prefer: wait, no polling)
        │
        ▼
  imageUrl persisted to Character.avatarUrl in SQLite
        │
        ▼
{ imageUrl, characterId } returned to caller
```

---

## REST API

### `POST /api/avatars/generate`

Generates and saves an avatar for an existing character.

**Request body:**
```json
{
  "characterId": "1",
  "characterName": "Akira",
  "shortDescription": "japanese cyberpunk hacker with pink neon bangs, intense gaze",
  "style": "realistic"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `characterId` | string | ✅ | Integer ID of the character in the DB |
| `characterName` | string | ✅ | Display name |
| `shortDescription` | string | ✅ | Visual description for the prompt |
| `style` | string | ❌ | `realistic` (default) \| `anime` \| `illustration` |

**Success response `200`:**
```json
{
  "imageUrl": "https://replicate.delivery/pbxt/xxx.webp",
  "characterId": "1"
}
```

**Error responses:**
| Status | Meaning |
|---|---|
| `400` | Missing / invalid input fields |
| `404` | Character not found |
| `503` | `REPLICATE_API_TOKEN` not configured |
| `502` | Replicate API failed (retry) |

### cURL example

```bash
curl -X POST http://localhost:3000/api/avatars/generate \
  -H "Content-Type: application/json" \
  -d '{
    "characterId": "1",
    "characterName": "Akira",
    "shortDescription": "japanese cyberpunk hacker with pink neon bangs",
    "style": "realistic"
  }'
```

---

## Frontend (React hook)

The hook lives at `frontend/src/hooks/useAvatarGeneration.js`.

```jsx
import { useAvatarGeneration } from './hooks/useAvatarGeneration';

function CharacterCard({ character, onAvatarGenerated }) {
  const { generateAvatarForCharacter, loading, error } = useAvatarGeneration({
    // Called once the image URL is saved. Update your characters state here.
    onSuccess: (characterId, imageUrl) => onAvatarGenerated(characterId, imageUrl),
    defaultStyle: 'realistic', // optional
  });

  return (
    <div>
      {character.avatarUrl
        ? <img src={character.avatarUrl} alt={character.name} />
        : <div className="placeholder">{character.name[0]}</div>
      }

      <button
        onClick={() => generateAvatarForCharacter(character)}
        disabled={loading}
      >
        {loading ? '⏳ Generando...' : character.avatarUrl ? '🔄 Regenerar' : '✨ Generar avatar'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

> The hook automatically builds the prompt from `character.description` + `character.persona`. You can pass a custom `style` as the second argument to `generateAvatarForCharacter(character, 'anime')`.

---

## Changing the Image Model

Edit `src/services/avatarService.js`:

```js
// Line ~24 — swap to a higher-quality model:
const DEFAULT_AVATAR_MODEL = 'black-forest-labs/flux-dev'; // was flux-schnell
```

Or set `AVATAR_MODEL` in your `.env`:
```env
AVATAR_MODEL=black-forest-labs/flux-1.1-pro
```

---

## File Map

```
Creativstorias/
├── src/
│   └── services/
│       └── avatarService.js        ← Core: prompt builder + Replicate API
├── frontend/
│   └── src/
│       └── hooks/
│           └── useAvatarGeneration.js  ← React hook
├── prisma/
│   └── schema.prisma               ← Character.avatarUrl field
└── AVATAR_ENGINE.md                ← This file
```
