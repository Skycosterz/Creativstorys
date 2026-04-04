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
  import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export function resolveApiUrl(path = '') {
  const base = API_BASE_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return url.startsWith('/') ? url : `/${url}`;
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(resolveApiUrl(path), options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON para ${path}: ${text}`);
  }
}