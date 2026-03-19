import { supabase } from '@/integrations/supabase/client';

const LOCAL_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
const DEPLOYED_API_BASE_URL = 'https://graduation-project-d7tm.onrender.com/api/v1';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function getRawBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured;

  if (typeof window !== 'undefined' && !isLoopbackHost(window.location.hostname)) {
    return DEPLOYED_API_BASE_URL;
  }

  return LOCAL_API_BASE_URL;
}

function getResolvedBaseUrl(): string {
  const normalized = normalizeBaseUrl(getRawBaseUrl());
  if (typeof window === 'undefined') return normalized;

  try {
    const parsed = new URL(normalized);
    const currentHost = window.location.hostname;

    // A deployed frontend can never reach a loopback backend like 127.0.0.1:8000.
    // Fall back to the deployed Render API instead of inventing host:8000 URLs.
    if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(currentHost)) {
      return normalizeBaseUrl(DEPLOYED_API_BASE_URL);
    }
  } catch {
    // Keep the raw configured value if parsing fails.
  }

  return normalized;
}

const BASE_URL = getResolvedBaseUrl();

function resolveUrl(path: string, baseUrl: string = BASE_URL): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (typeof window === 'undefined') return path;
    try {
      const parsed = new URL(path);
      const runtimeHost = window.location.hostname;
      if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(runtimeHost)) {
        return `${normalizeBaseUrl(DEPLOYED_API_BASE_URL)}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Keep provided absolute URL unchanged if parsing fails.
    }
    return path;
  }
  if (path.startsWith('/')) return `${baseUrl}${path}`;
  return `${baseUrl}/${path}`;
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
  const requestInit = { ...init, headers };
  const primaryUrl = resolveUrl(path);

  try {
    return await fetch(primaryUrl, requestInit);
  } catch (error) {
    // Retry once with the deployed backend when loopback hosts are unreachable from remote clients.
    if (typeof window !== 'undefined') {
      try {
        const parsed = new URL(primaryUrl);
        const runtimeHost = window.location.hostname;
        if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(runtimeHost)) {
          const retryUrl = `${normalizeBaseUrl(DEPLOYED_API_BASE_URL)}${parsed.pathname}${parsed.search}`;
          return await fetch(retryUrl, requestInit);
        }
      } catch {
        // Fall through to the original error.
      }
    }

    throw error;
  }
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
