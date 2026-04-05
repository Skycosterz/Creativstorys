// Centralized configuration for the frontend to communicate with the backend.
// In production, we assume the backend and frontend are on the same domain (relative calls).
// In development, we point to the local server running on PORT 3000.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? '' : 'http://localhost:3000');

/**
 * Constructs a full API URL for any given path.
 * @param {string} path - The sub-path of the API (e.g. '/characters', 'stories/start')
 * @returns {string} The full concatenated URL.
 */
export function apiUrl(path = '') {
  const base = API_BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  // All backend routes are served under the /api prefix
  return `${base}/api${clean}`;
}

/**
 * Resolves an asset URL (images, static files) from the backend.
 * Handles both absolute URLs and local relative paths.
 */
export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `${base}${clean}`;
}