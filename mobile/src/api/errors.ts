/** Erro de uma chamada à API: já traduzido do envelope de erro do contrato (Doc 05 §3.2) ou de uma falha de rede. */
export class ApiError extends Error {
  /** 0 = sem resposta do servidor (rede, tempo esgotado). */
  readonly status: number;
  /** Código estável do contrato (ex.: `VALIDATION_ERROR`, `RATE_LIMITED`) ou `NETWORK_ERROR` / `INVALID_RESPONSE`. */
  readonly code: string;
  /** Mensagens por campo quando `code` é `VALIDATION_ERROR`. */
  readonly fields: Record<string, string[]>;
  readonly requestId: string | null;
  /** Segundos até poder tentar de novo (429). */
  readonly retryAfter: number | null;
  readonly details: Record<string, unknown>;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    requestId?: string | null;
    retryAfter?: number | null;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.details = init.details ?? {};
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
