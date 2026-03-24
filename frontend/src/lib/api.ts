import { supabase } from '@/integrations/supabase/client';

const API_PATH_PREFIX = '/api/v1';
const LOCAL_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
const DEPLOYED_API_BASE_URL = 'https://solarsense-backend.prouddune-0da5686d.centralindia.azurecontainerapps.io/api/v1';
const DEFAULT_API_TIMEOUT_MS = 30000;
const DISABLED_TIMEOUT_VALUES = new Set([
  '0',
  'false',
  'off',
  'none',
  'disable',
  'disabled',
  'infinite',
  'infinity',
]);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function withApiPrefix(url: string): string {
  const normalized = normalizeBaseUrl(url);
  return normalized.endsWith(API_PATH_PREFIX) ? normalized : `${normalized}${API_PATH_PREFIX}`;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function uniqueUrls(urls: Array<string | undefined | null>): string[] {
  return [...new Set(urls.map((url) => url?.trim()).filter((url): url is string => !!url))];
}

function getApiTimeoutMs(): number | null {
  const rawTimeout = import.meta.env.VITE_API_TIMEOUT_MS?.trim();
  if (!rawTimeout) return DEFAULT_API_TIMEOUT_MS;

  if (DISABLED_TIMEOUT_VALUES.has(rawTimeout.toLowerCase())) {
    return null;
  }

  const parsedTimeout = Number(rawTimeout);
  return Number.isFinite(parsedTimeout) && parsedTimeout > 0
    ? parsedTimeout
    : DEFAULT_API_TIMEOUT_MS;
}

function getConfiguredBaseUrls(): string[] {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN?.trim();

  return uniqueUrls([
    configuredBaseUrl ? withApiPrefix(configuredBaseUrl) : undefined,
    configuredOrigin ? withApiPrefix(configuredOrigin) : undefined,
  ]);
}

function getBaseUrlCandidates(): string[] {
  const configured = getConfiguredBaseUrls();

  if (typeof window === 'undefined') {
    return uniqueUrls([...configured, LOCAL_API_BASE_URL, DEPLOYED_API_BASE_URL]);
  }

  const sameOriginBaseUrl = withApiPrefix(window.location.origin);
  const remoteClient = !isLoopbackHost(window.location.hostname);

  if (remoteClient) {
    return uniqueUrls([
      ...configured,
      sameOriginBaseUrl,
      DEPLOYED_API_BASE_URL,
      LOCAL_API_BASE_URL,
    ]);
  }

  return uniqueUrls([
    ...configured,
    LOCAL_API_BASE_URL,
    sameOriginBaseUrl,
    DEPLOYED_API_BASE_URL,
  ]);
}

function isRetriableResponse(response: Response): boolean {
  return [404, 405, 502, 503, 504].includes(response.status);
}

function resolveUrl(path: string, baseUrl: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (typeof window === 'undefined') return path;
    try {
      const parsed = new URL(path);
      const runtimeHost = window.location.hostname;
      if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(runtimeHost)) {
        const suffix = parsed.pathname.startsWith(API_PATH_PREFIX)
          ? parsed.pathname.slice(API_PATH_PREFIX.length)
          : parsed.pathname;
        return `${normalizeBaseUrl(baseUrl)}${suffix}${parsed.search}`;
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
  const timeoutMs = getApiTimeoutMs();
  const timeoutController = new AbortController();
  let detachAbortRelay: (() => void) | undefined;
  const baseUrlCandidates = getBaseUrlCandidates();
  const resolvedUrls = uniqueUrls(baseUrlCandidates.map((baseUrl) => resolveUrl(path, baseUrl)));

  if (init.signal) {
    if (init.signal.aborted) {
      timeoutController.abort();
    } else {
      const relayAbort = () => timeoutController.abort();
      init.signal.addEventListener('abort', relayAbort, { once: true });
      detachAbortRelay = () => init.signal?.removeEventListener('abort', relayAbort);
    }
  }

  const timeoutId = timeoutMs === null
    ? undefined
    : window.setTimeout(() => {
        timeoutController.abort();
      }, Math.max(1, timeoutMs));

  const requestInit = { ...init, headers, signal: timeoutController.signal };
  let lastError: unknown;

  try {
    for (let index = 0; index < resolvedUrls.length; index += 1) {
      const requestUrl = resolvedUrls[index];

      try {
        const response = await fetch(requestUrl, requestInit);
        const hasMoreCandidates = index < resolvedUrls.length - 1;
        if (!hasMoreCandidates || response.ok || !isRetriableResponse(response)) {
          return response;
        }
        lastError = new Error(`Request failed (${response.status}) for ${requestUrl}`);
      } catch (error) {
        lastError = error;
        if (timeoutController.signal.aborted) {
          throw error;
        }
      }

      if (timeoutController.signal.aborted) {
        throw lastError;
      }
    }

    if (timeoutMs !== null && timeoutController.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${resolvedUrls[0] ?? path}`);
    }

    throw lastError ?? new Error(`Request failed for ${resolvedUrls[0] ?? path}`);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    detachAbortRelay?.();
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
