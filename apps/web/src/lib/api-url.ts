const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Builds a full API URL from a path, normalizing slashes on the boundary. */
export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
