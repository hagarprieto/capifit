import { newUuid } from '@/lib/uuid';

import { ApiError } from './errors';
import type { components } from './schema.generated';

/** Tipos do contrato (gerados de docs/07_openapi.yaml): `Schemas['TokenResponse']`, etc. */
export type Schemas = components['schemas'];

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** `true` gera uma chave nova; uma string reaproveita a chave (reenvio da MESMA intenção). */
  idempotencyKey?: boolean | string;
  /** `false` nas rotas públicas (login, cadastro, recuperação): não envia nem renova o token. */
  auth?: boolean;
  signal?: AbortSignal;
};

export type ApiResult<T> = {
  data: T;
  pagination: { limit: number; next_cursor: string | null } | null;
  requestId: string | null;
};

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  /** Renova o token de acesso (deve ser de voo único) e devolve o novo, ou `null` se a sessão acabou. */
  refreshAccessToken?: () => Promise<string | null>;
  /** Chamado quando a sessão não pode mais ser renovada: o app volta para a tela de entrada. */
  onSessionExpired?: () => void;
  /** Avisa o resultado de cada tentativa de falar com o servidor: `true` se houve resposta (mesmo de erro), `false` se a conexão falhou. */
  onReachable?: (reachable: boolean) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiClient = {
  request<T = undefined>(method: Method, path: string, options?: RequestOptions): Promise<ApiResult<T>>;
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<ApiResult<T>>;
  post<T = undefined>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<ApiResult<T>>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<ApiResult<T>>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<ApiResult<T>>;
  delete(path: string, options?: Omit<RequestOptions, 'body'>): Promise<ApiResult<undefined>>;
};

function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const params = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${baseUrl}${path}${params === '' ? '' : `?${params}`}`;
}

async function parseError(response: Response): Promise<ApiError> {
  const retry = Number(response.headers.get('Retry-After'));
  let payload: { error?: { code?: unknown; message?: unknown; request_id?: unknown; details?: unknown } } = {};
  try {
    payload = await response.json();
  } catch {
    // corpo vazio ou que não é JSON (ex.: erro de proxy): cai no erro genérico abaixo
  }
  const error = payload.error ?? {};
  const details = typeof error.details === 'object' && error.details !== null ? (error.details as Record<string, unknown>) : {};
  const fields = typeof details.fields === 'object' && details.fields !== null ? (details.fields as Record<string, string[]>) : {};
  return new ApiError({
    status: response.status,
    code: typeof error.code === 'string' ? error.code : 'INVALID_RESPONSE',
    message: typeof error.message === 'string' ? error.message : '',
    fields,
    requestId: typeof error.request_id === 'string' ? error.request_id : null,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
    details,
  });
}

/** Cliente HTTP da API CapiFit: envelope `{data, meta, pagination}`, erros tipados, renovação única do token e tempo limite. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(method: Method, path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = typeof opts.idempotencyKey === 'string' ? opts.idempotencyKey : newUuid();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const response = await doFetch(buildUrl(options.baseUrl, path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      options.onReachable?.(true);
      return response;
    } catch {
      options.onReachable?.(false);
      throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    const authenticated = opts.auth !== false;
    // Uma chave gerada aqui vale para o reenvio após renovar o token (mesma intenção, mesmo efeito).
    const keyed: RequestOptions = opts.idempotencyKey === true ? { ...opts, idempotencyKey: newUuid() } : opts;

    let response = await send(method, path, keyed, authenticated ? options.getAccessToken() : null);
    if (response.status === 401 && authenticated && options.refreshAccessToken) {
      const fresh = await options.refreshAccessToken();
      if (fresh === null) {
        options.onSessionExpired?.();
        throw await parseError(response);
      }
      response = await send(method, path, keyed, fresh);
      if (response.status === 401) {
        options.onSessionExpired?.();
      }
    }
    if (!response.ok) {
      throw await parseError(response);
    }
    if (response.status === 204) {
      return { data: undefined as T, pagination: null, requestId: response.headers.get('X-Request-Id') };
    }
    let payload: { data?: T; pagination?: ApiResult<T>['pagination']; meta?: { request_id?: string } };
    try {
      payload = await response.json();
    } catch {
      throw new ApiError({ status: response.status, code: 'INVALID_RESPONSE', message: '' });
    }
    return {
      data: payload.data as T,
      pagination: payload.pagination ?? null,
      requestId: payload.meta?.request_id ?? response.headers.get('X-Request-Id'),
    };
  }

  return {
    request,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}
