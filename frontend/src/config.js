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
