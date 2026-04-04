/**
 * @file frontend/src/config.js
 * @description Centralized frontend configuration.
 *
 * VITE_API_BASE_URL must be set at build time for production.
 * In local dev, it falls back to http://localhost:3000.
 *
 * Usage:
 *   import { API_BASE_URL } from './config';
 *   await fetch(`${API_BASE_URL}/stories`);
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';

/**
 * Resolves an asset URL based on whether it's an absolute URL (like from S3)
 * or a relative path (like from local development).
 *
 * @param {string} url The URL or path to resolve.
 * @returns {string} The full, usable URL.
 */
export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Ensure the URL is prefixed with API_BASE_URL for local relative paths
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}