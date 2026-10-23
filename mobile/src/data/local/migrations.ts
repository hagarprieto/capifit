import type { LocalDb } from './db';

/**
 * Migrações do banco local, em ordem. A posição no vetor + 1 é a versão (`PRAGMA user_version`). Nunca edite uma
 * migração já publicada: acrescente outra ao fim. Datas ficam em texto ISO 8601 UTC; booleanos em INTEGER 0/1.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessao (
    uuid TEXT PRIMARY KEY NOT NULL,
    usuario_uuid TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('programado', 'avulso')),
    titulo TEXT,
    programa_uuid TEXT,
    versao_numero INTEGER,
    ficha_uuid TEXT,
    status TEXT NOT NULL CHECK (status IN ('em_andamento', 'concluida', 'cancelada')),
    iniciada_em TEXT NOT NULL,
    encerrada_em TEXT,
    duracao_ativa_segundos INTEGER,
    observacoes TEXT,
    sincronizada INTEGER NOT NULL DEFAULT 0 CHECK (sincronizada IN (0, 1))
  );
  CREATE INDEX idx_sessao_usuario ON sessao (usuario_uuid, status, iniciada_em);

  CREATE TABLE sessao_exercicio (
    uuid TEXT PRIMARY KEY NOT NULL,
    sessao_uuid TEXT NOT NULL REFERENCES sessao (uuid) ON DELETE CASCADE,
    exercicio_uuid TEXT NOT NULL,
    exercicio_json TEXT NOT NULL,
    ficha_exercicio_uuid TEXT,
    exercicio_prescrito_uuid TEXT,
    tipo_item TEXT NOT NULL CHECK (tipo_item IN ('prescrito', 'substituido', 'adicionado')),
    ordem INTEGER NOT NULL
  );
  CREATE INDEX idx_sessao_exercicio_sessao ON sessao_exercicio (sessao_uuid, ordem);

  CREATE TABLE sessao_serie (
    uuid TEXT PRIMARY KEY NOT NULL,
    sessao_exercicio_uuid TEXT NOT NULL REFERENCES sessao_exercicio (uuid) ON DELETE CASCADE,
    serie_prescrita_uuid TEXT,
    ordem INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('aquecimento', 'normal', 'preparatoria', 'dropset')),
    status TEXT NOT NULL CHECK (status IN ('pendente', 'realizada', 'ignorada')),
    carga_kg REAL,
    repeticoes INTEGER,
    duracao_segundos INTEGER,
    rir_real INTEGER,
    concluida_em TEXT,
    revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_sessao_serie_exercicio ON sessao_serie (sessao_exercicio_uuid, ordem);

  CREATE TABLE sessao_pausa (
    uuid TEXT PRIMARY KEY NOT NULL,
    sessao_uuid TEXT NOT NULL REFERENCES sessao (uuid) ON DELETE CASCADE,
    iniciada_em TEXT NOT NULL,
    encerrada_em TEXT
  );
  CREATE INDEX idx_sessao_pausa_sessao ON sessao_pausa (sessao_uuid);

  CREATE TABLE fila_operacao (
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    operacao_uuid TEXT NOT NULL UNIQUE,
    usuario_uuid TEXT NOT NULL,
    entidade TEXT NOT NULL CHECK (entidade IN ('sessao_treino', 'sessao_pausa', 'sessao_exercicio', 'sessao_serie')),
    entidade_uuid TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('criar', 'atualizar', 'concluir', 'cancelar')),
    payload TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'enviando', 'aplicada', 'rejeitada', 'conflito')),
    tentativas INTEGER NOT NULL DEFAULT 0,
    erro_codigo TEXT,
    erro_mensagem TEXT,
    criada_em TEXT NOT NULL,
    atualizada_em TEXT NOT NULL
  );
  CREATE INDEX idx_fila_usuario_estado ON fila_operacao (usuario_uuid, estado, sequencia);

  CREATE TABLE cache_json (
    usuario_uuid TEXT NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT NOT NULL,
    atualizado_em TEXT NOT NULL,
    PRIMARY KEY (usuario_uuid, chave)
  );
  `,
  // v2: cada operação da fila sabe a qual sessão pertence (para saber quando a sessão foi toda confirmada).
  `
  ALTER TABLE fila_operacao ADD COLUMN sessao_uuid TEXT;
  CREATE INDEX idx_fila_sessao ON fila_operacao (usuario_uuid, sessao_uuid, estado);
  `,
];

export const LATEST_VERSION = MIGRATIONS.length;

export class DatabaseTooNewError extends Error {
  constructor(public readonly found: number) {
    super(`O banco local está na versão ${found}, mais nova que a deste app (${LATEST_VERSION}).`);
    this.name = 'DatabaseTooNewError';
  }
}

/**
 * Leva o banco até a versão mais recente. Cada passo roda numa transação com a troca de `user_version`: se algo falhar,
 * o banco volta ao estado anterior e a migração tenta de novo na próxima abertura. Banco mais novo que o app (volta de
 * versão) NÃO é alterado: lança `DatabaseTooNewError` para o chamador decidir, em vez de apagar dados de treino.
 */
export async function migrate(db: LocalDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > LATEST_VERSION) {
    throw new DatabaseTooNewError(current);
  }
  for (let version = current; version < LATEST_VERSION; version += 1) {
    await db.transaction(async (tx) => {
      await tx.execAsync(MIGRATIONS[version]);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return LATEST_VERSION;
}
