import { createApiClient } from './client';
import { ApiError } from './errors';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function setup(responses: Response[], extra: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) {
      throw new Error('sem resposta preparada');
    }
    return next;
  });
  const client = createApiClient({ baseUrl: 'https://api.exemplo.invalid', getAccessToken: () => 'token-a', fetchImpl: fetchImpl as unknown as typeof fetch, ...extra });
  return { client, calls, fetchImpl };
}

describe('createApiClient', () => {
  it('desembrulha o envelope de sucesso e a paginação', async () => {
    const { client, calls } = setup([json(200, { data: [{ id: 1 }], pagination: { limit: 20, next_cursor: 'abc' }, meta: { request_id: 'req_1' } })]);

    const result = await client.get<{ id: number }[]>('/me/sessoes', { query: { limit: 20, status: 'concluida', vazio: undefined, nulo: null } });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.pagination).toEqual({ limit: 20, next_cursor: 'abc' });
    expect(result.requestId).toBe('req_1');
    expect(calls[0].url).toBe('https://api.exemplo.invalid/me/sessoes?limit=20&status=concluida');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer token-a');
  });

  it('não envia o token nas rotas públicas e manda o corpo em JSON', async () => {
    const { client, calls } = setup([json(200, { data: { ok: true } })]);

    await client.post('/auth/login', { email: 'a@b.c' }, { auth: false });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{"email":"a@b.c"}');
  });

  it('gera a chave de idempotência e aceita uma chave dada', async () => {
    const { client, calls } = setup([json(201, { data: {} }), json(201, { data: {} })]);

    await client.post('/me/programas', { titulo: 'x' }, { idempotencyKey: true });
    await client.post('/me/programas', { titulo: 'x' }, { idempotencyKey: 'chave-fixa' });

    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect((calls[1].init.headers as Record<string, string>)['Idempotency-Key']).toBe('chave-fixa');
  });

  it('traduz o envelope de erro, com campos e request_id', async () => {
    const { client } = setup([json(422, { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', request_id: 'req_9', details: { fields: { email: ['Inválido.'] } } } })]);

    const error = await client.post('/auth/register', {}, { auth: false }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'VALIDATION_ERROR', requestId: 'req_9', fields: { email: ['Inválido.'] } });
  });

  it('lê o Retry-After do 429', async () => {
    const { client } = setup([json(429, { error: { code: 'RATE_LIMITED', message: 'x' } }, { 'Retry-After': '120' })]);

    await expect(client.post('/auth/login', {}, { auth: false })).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 120 });
  });

  it('trata 204 sem corpo e resposta que não é JSON', async () => {
    const empty = setup([new Response(null, { status: 204 })]);
    await expect(empty.client.delete('/me/dispositivos/x')).resolves.toMatchObject({ data: undefined });

    const broken = setup([new Response('<html>erro</html>', { status: 502 })]);
    await expect(broken.client.get('/me')).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('avisa se o servidor respondeu (mesmo com erro) ou se a conexão falhou', async () => {
    const reachable = jest.fn();
    const ok = setup([json(200, { data: {} }), json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } })], { onReachable: reachable });

    await ok.client.get('/a');
    await expect(ok.client.get('/b')).rejects.toBeInstanceOf(ApiError);
    expect(reachable.mock.calls).toEqual([[true], [true]]); // erro do servidor ainda é "o servidor respondeu"

    const down = createApiClient({ baseUrl: 'https://api.exemplo.invalid', getAccessToken: () => null, fetchImpl: (jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown) as typeof fetch, onReachable: reachable });
    await expect(down.get('/c')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(reachable).toHaveBeenLastCalledWith(false);
  });

  it('falha de rede vira NETWORK_ERROR', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const client = createApiClient({ baseUrl: 'https://x.invalid', getAccessToken: () => null, fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await client.get('/me').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it('em 401 renova o token uma vez e repete a chamada com a MESMA chave de idempotência', async () => {
    const refresh = jest.fn().mockResolvedValue('token-b');
    const { client, calls } = setup([json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }), json(201, { data: { id: 'ok' } })], { refreshAccessToken: refresh });

    const result = await client.post<{ id: string }>('/me/sessoes', { a: 1 }, { idempotencyKey: true });

    expect(result.data).toEqual({ id: 'ok' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer token-b');
    expect((calls[1].init.headers as Record<string, string>)['Idempotency-Key']).toBe((calls[0].init.headers as Record<string, string>)['Idempotency-Key']);
  });

  it('se a renovação falha, avisa que a sessão acabou e devolve o 401', async () => {
    const expired = jest.fn();
    const { client } = setup([json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })], { refreshAccessToken: async () => null, onSessionExpired: expired });

    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('um segundo 401 depois de renovar encerra a sessão em vez de entrar em laço', async () => {
    const expired = jest.fn();
    const refresh = jest.fn().mockResolvedValue('token-b');
    const { client, fetchImpl } = setup([json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }), json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })], { refreshAccessToken: refresh, onSessionExpired: expired });

    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('rota pública com 401 (login errado) não tenta renovar', async () => {
    const refresh = jest.fn();
    const { client } = setup([json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })], { refreshAccessToken: refresh });

    await expect(client.post('/auth/login', {}, { auth: false })).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });
});
