// Inlined at build time. '' (production images) = same-origin: requests go to
// /api/... on the current domain and nginx routes them to the api container.
// Unset (bare local dev) falls back to the local API port; Docker dev sets it
// explicitly via docker-compose.yml.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Builds a full API URL from a path, normalizing slashes on the boundary. */
export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
