import type { QueueEntity, QueueType } from '../local/queueRepo';

/**
 * O que o servidor aceita em cada operação do `/sync/push` (espelho de `SyncService`/`SessionService` do backend, que
 * recusa campo desconhecido e exige `sessao_uuid` no corpo das operações que não são da própria sessão). Serve para os
 * testes pegarem uma operação que o servidor recusaria, em vez de descobrir só no aparelho.
 */
const ALLOWED: Record<string, readonly string[]> = {
  'sessao_treino:criar': ['sessao_uuid', 'tipo', 'ficha_uuid', 'titulo_avulso', 'iniciada_em', 'exercicios'],
  'sessao_treino:atualizar': ['observacoes'],
  'sessao_treino:concluir': ['encerrada_em'],
  'sessao_treino:cancelar': ['motivo'],
  'sessao_pausa:criar': ['sessao_uuid', 'iniciada_em'],
  'sessao_pausa:atualizar': ['sessao_uuid', 'encerrada_em'],
  'sessao_exercicio:criar': ['sessao_uuid', 'uuid', 'exercicio_uuid', 'ordem', 'substitui_uuid'],
  'sessao_serie:criar': ['sessao_uuid', 'uuid', 'sessao_exercicio_uuid', 'tipo'],
  'sessao_serie:atualizar': ['sessao_uuid', 'carga_kg', 'repeticoes', 'duracao_segundos', 'rir_real', 'status', 'concluida_em', 'atualizado_cliente_em', 'tipo'],
};

const REQUIRED: Record<string, readonly string[]> = {
  'sessao_treino:criar': ['iniciada_em', 'tipo'],
  'sessao_pausa:criar': ['sessao_uuid', 'iniciada_em'],
  'sessao_pausa:atualizar': ['sessao_uuid', 'encerrada_em'],
  'sessao_exercicio:criar': ['sessao_uuid', 'exercicio_uuid'],
  'sessao_serie:criar': ['sessao_uuid', 'sessao_exercicio_uuid'],
  'sessao_serie:atualizar': ['sessao_uuid'],
};

export function serverContractProblems(op: { entidade: QueueEntity; tipo: QueueType; payload: Record<string, unknown> }): string[] {
  const key = `${op.entidade}:${op.tipo}`;
  const allowed = ALLOWED[key];
  if (!allowed) {
    return [`${key}: o servidor não aceita esta combinação`];
  }
  const problems: string[] = [];
  for (const field of Object.keys(op.payload)) {
    if (!allowed.includes(field)) {
      problems.push(`${key}: campo desconhecido "${field}"`);
    }
  }
  for (const field of REQUIRED[key] ?? []) {
    if (op.payload[field] === undefined || op.payload[field] === null) {
      problems.push(`${key}: falta "${field}"`);
    }
  }
  if (key === 'sessao_treino:criar' && op.payload.tipo !== undefined) {
    if ((op.payload.tipo === 'programado') !== (op.payload.ficha_uuid !== undefined && op.payload.ficha_uuid !== null)) {
      problems.push(`${key}: "tipo" tem de ser programado se, e só se, houver ficha_uuid`);
    }
  }
  return problems;
}
