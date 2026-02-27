import { supabase } from '@/integrations/supabase/client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${path}`;
}

async function getAuthHeaders(headers?: HeadersInit): Promise<Headers> {
  const merged = new Headers(headers || {});
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (userId) {
    merged.set('X-User-Id', userId);
  }
  return merged;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders(init.headers);
  return fetch(resolveUrl(path), { ...init, headers });
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: 'GET' });
  return parseResponse<T>(res);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const headers = new Headers();
  if (!(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await apiFetch(path, {
    method: 'POST',
    headers,
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: 'DELETE' });
  return parseResponse<T>(res);
}
