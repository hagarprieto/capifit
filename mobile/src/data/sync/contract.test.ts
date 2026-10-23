import { serverContractProblems } from './contract';

const uuid = '00000000-0000-4000-8000-000000000001';

describe('contrato das operações do /sync/push', () => {
  it('aceita as operações bem formadas', () => {
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload: { sessao_uuid: uuid, tipo: 'avulso', iniciada_em: 'x', exercicios: [] } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload: { sessao_uuid: uuid, tipo: 'programado', ficha_uuid: uuid, iniciada_em: 'x', exercicios: [] } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'concluir', payload: { encerrada_em: 'x' } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'cancelar', payload: {} })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_serie', tipo: 'atualizar', payload: { sessao_uuid: uuid, repeticoes: 8, status: 'realizada', atualizado_cliente_em: 'x' } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_pausa', tipo: 'criar', payload: { sessao_uuid: uuid, iniciada_em: 'x' } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_pausa', tipo: 'atualizar', payload: { sessao_uuid: uuid, encerrada_em: 'x' } })).toEqual([]);
  });

  it('pega operação de série ou pausa sem o UUID da sessão (o servidor responderia 422)', () => {
    expect(serverContractProblems({ entidade: 'sessao_serie', tipo: 'atualizar', payload: { repeticoes: 8 } })).toEqual(['sessao_serie:atualizar: falta "sessao_uuid"']);
    expect(serverContractProblems({ entidade: 'sessao_serie', tipo: 'criar', payload: { uuid, sessao_exercicio_uuid: uuid } })).toEqual(['sessao_serie:criar: falta "sessao_uuid"']);
    expect(serverContractProblems({ entidade: 'sessao_pausa', tipo: 'criar', payload: { iniciada_em: 'x' } })).toEqual(['sessao_pausa:criar: falta "sessao_uuid"']);
  });

  it('pega treino de ficha sem "tipo" ou com tipo incoerente, e campo que o servidor não conhece', () => {
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload: { sessao_uuid: uuid, ficha_uuid: uuid, iniciada_em: 'x' } })).toContain('sessao_treino:criar: falta "tipo"');
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload: { sessao_uuid: uuid, tipo: 'avulso', ficha_uuid: uuid, iniciada_em: 'x' } })).toContain('sessao_treino:criar: "tipo" tem de ser programado se, e só se, houver ficha_uuid');
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'concluir', payload: { encerrada_em: 'x', motivo: 'y' } })).toEqual(['sessao_treino:concluir: campo desconhecido "motivo"']);
  });

  it('recusa combinação que o servidor não tem', () => {
    expect(serverContractProblems({ entidade: 'sessao_pausa', tipo: 'concluir', payload: {} })).toEqual(['sessao_pausa:concluir: o servidor não aceita esta combinação']);
  });
});

describe('contrato: exercícios da sessão', () => {
  it('aceita adicionar e trocar exercício', () => {
    expect(serverContractProblems({ entidade: 'sessao_exercicio', tipo: 'criar', payload: { sessao_uuid: uuid, exercicio_uuid: uuid } })).toEqual([]);
    expect(serverContractProblems({ entidade: 'sessao_exercicio', tipo: 'criar', payload: { sessao_uuid: uuid, exercicio_uuid: uuid, substitui_uuid: uuid } })).toEqual([]);
  });

  it('pega troca com "ordem", o UUID do item no corpo e falta de sessao_uuid', () => {
    expect(serverContractProblems({ entidade: 'sessao_exercicio', tipo: 'criar', payload: { sessao_uuid: uuid, exercicio_uuid: uuid, substitui_uuid: uuid, ordem: 2 } })).toEqual(['sessao_exercicio:criar: troca de exercício não aceita "ordem"']);
    expect(serverContractProblems({ entidade: 'sessao_exercicio', tipo: 'criar', payload: { sessao_uuid: uuid, exercicio_uuid: uuid, uuid } })).toEqual(['sessao_exercicio:criar: campo desconhecido "uuid"']);
    expect(serverContractProblems({ entidade: 'sessao_exercicio', tipo: 'criar', payload: { exercicio_uuid: uuid } })).toEqual(['sessao_exercicio:criar: falta "sessao_uuid"']);
  });
});
