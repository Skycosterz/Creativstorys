import { useState, useCallback } from 'react';

import { apiUrl } from '../config';


/**
 * @typedef {object} Character
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string | null} [avatarUrl]
 */

/**
 * useAvatarGeneration
 *
 * A React hook that wraps the Avatar Engine's POST /api/avatars/generate endpoint.
 *
 * Usage in a Character card:
 * ─────────────────────────────────────────────────────────────
 * import { useAvatarGeneration } from '../hooks/useAvatarGeneration';
 *
 * function CharacterCard({ character, onAvatarGenerated }) {
 *   const { generateAvatarForCharacter, loading, error } = useAvatarGeneration({
 *     onSuccess: (characterId, imageUrl) => {
 *       // Update your characters list in parent state:
 *       onAvatarGenerated(characterId, imageUrl);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       {character.avatarUrl
 *         ? <img src={character.avatarUrl} alt={character.name} />
 *         : <button onClick={() => generateAvatarForCharacter(character)}>
 *             ✨ Generar avatar
 *           </button>
 *       }
 *       {loading && <span>Generando...</span>}
 *       {error   && <span style={{ color: 'red' }}>{error}</span>}
 *     </div>
 *   );
 * }
 * ─────────────────────────────────────────────────────────────
 *
 * @param {object} [options]
 * @param {(characterId: string, imageUrl: string) => void} [options.onSuccess]
 *   Called with the character ID and new image URL after a successful generation.
 *
 * @returns {{
 *   generateAvatarForCharacter: (character: Character) => Promise<void>,
 *   loading: boolean,
 *   error: string | null,
 * }}
 */
export function useAvatarGeneration({ onSuccess } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Triggers avatar generation for the given character.
   *
   * @param {Character} character - The character object from your state
   */
  const generateAvatarForCharacter = useCallback(
    async (character) => {
      if (!character?.id || !character?.name) {
        setError('El personaje debe tener id y name');
        return;
      }

      setLoading(true);
      setError(null);

      // Build a short description from whatever the character object has.
      // Combine description + persona for richer prompt material.
      const parts = [character.description, character.persona].filter(Boolean);
      const shortDescription = parts.length > 0 ? parts.join(', ') : character.name;

      try {
        const response = await fetch(apiUrl('/avatars/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: String(character.id),
            characterName: character.name,
            shortDescription,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        if (typeof onSuccess === 'function') {
          onSuccess(data.characterId, data.imageUrl);
        }
      } catch (err) {
        console.error('[useAvatarGeneration] Error:', err.message);
        setError(err.message || 'Error desconocido al generar el avatar');
      } finally {
        setLoading(false);
      }
    },
    [onSuccess]
  );

  return { generateAvatarForCharacter, loading, error };
}
