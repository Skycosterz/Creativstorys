export const API_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

export function apiUrl(path = '') {
  const base = API_BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api${clean}`;
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE_URL.replace(/\/$/, '');
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `${base}${clean}`;
}