import type { Schemas } from '@/api/client';

import { applyConfig, configOf, fichaCode, fromVersion, isDirty, newItem, prescriptionSummary, publishIssues, saveIssues, toPayload, validateConfig, type EditorExercise, type EditorState } from './model';
import { editorReducer } from './reducer';

let mockCounter = 0;
jest.mock('@/lib/uuid', () => ({ newUuid: () => `key-${++mockCounter}` }));

const supino: EditorExercise = { id: 'ex-supino', nome: 'Supino reto', modalidade: 'reps_carga' };
const prancha: EditorExercise = { id: 'ex-prancha', nome: 'Prancha', modalidade: 'tempo' };
const empty: EditorState = { fichas: [] };

function withFicha(): EditorState {
  return editorReducer(empty, { type: 'addFicha' });
}

describe('códigos e títulos de ficha', () => {
  it('A…Z e depois AA, BB (únicos por posição)', () => {
    expect([0, 1, 25, 26, 27].map(fichaCode)).toEqual(['A', 'B', 'Z', 'AA', 'BB']);
  });
});

describe('redutor do editor', () => {
  beforeEach(() => {
    mockCounter = 0;
  });

  it('cria fichas "Treino A", "Treino B" e respeita o limite de 14', () => {
    let state = empty;
    for (let n = 0; n < 16; n += 1) {
      state = editorReducer(state, { type: 'addFicha' });
    }

    expect(state.fichas).toHaveLength(14);
    expect(state.fichas[0].titulo).toBe('Treino A');
    expect(state.fichas[13].titulo).toBe('Treino N');
  });

  it('renomeia, reordena e remove fichas', () => {
    let state = editorReducer(editorReducer(withFicha(), { type: 'addFicha' }), { type: 'renameFicha', fichaKey: 'key-1', titulo: 'Peito e tríceps' });
    const [a, b] = state.fichas.map((f) => f.key);

    state = editorReducer(state, { type: 'moveFicha', fichaKey: b, direction: -1 });
    expect(state.fichas.map((f) => f.key)).toEqual([b, a]);
    expect(editorReducer(state, { type: 'moveFicha', fichaKey: b, direction: -1 })).toEqual(state); // já é a primeira

    state = editorReducer(state, { type: 'removeFicha', fichaKey: a });
    expect(state.fichas.map((f) => f.key)).toEqual([b]);
  });

  it('duplicar copia a ficha com chaves novas logo depois dela', () => {
    let state = withFicha();
    state = editorReducer(state, { type: 'addItem', fichaKey: state.fichas[0].key, exercise: supino });

    const duplicated = editorReducer(state, { type: 'duplicateFicha', fichaKey: state.fichas[0].key });

    expect(duplicated.fichas).toHaveLength(2);
    expect(duplicated.fichas[1].titulo).toBe('Treino A (cópia)');
    expect(duplicated.fichas[1].key).not.toBe(duplicated.fichas[0].key);
    expect(duplicated.fichas[1].items[0].key).not.toBe(duplicated.fichas[0].items[0].key);
    expect(duplicated.fichas[1].items[0].series).toEqual(duplicated.fichas[0].items[0].series);
  });

  it('adiciona exercício com 3 séries de 8–12 e descanso padrão; tempo vira séries por duração', () => {
    let state = withFicha();
    const fichaKey = state.fichas[0].key;
    state = editorReducer(editorReducer(state, { type: 'addItem', fichaKey, exercise: supino }), { type: 'addItem', fichaKey, exercise: prancha });

    const [reps, time] = state.fichas[0].items;
    expect(reps.series).toHaveLength(3);
    expect(reps.series[0]).toMatchObject({ tipo: 'normal', repsMin: 8, repsMax: 12, durationSeconds: null });
    expect(reps.restSeconds).toBe(90);
    expect(time.series[0]).toMatchObject({ repsMin: null, repsMax: null, durationSeconds: 45 });
  });

  it('reordena e remove exercícios dentro da ficha', () => {
    let state = withFicha();
    const fichaKey = state.fichas[0].key;
    state = editorReducer(editorReducer(state, { type: 'addItem', fichaKey, exercise: supino }), { type: 'addItem', fichaKey, exercise: prancha });
    const [first, second] = state.fichas[0].items.map((i) => i.key);

    state = editorReducer(state, { type: 'moveItem', fichaKey, itemKey: second, direction: -1 });
    expect(state.fichas[0].items.map((i) => i.key)).toEqual([second, first]);

    state = editorReducer(state, { type: 'removeItem', fichaKey, itemKey: second });
    expect(state.fichas[0].items.map((i) => i.key)).toEqual([first]);
  });

  it('limita 30 exercícios por ficha', () => {
    let state = withFicha();
    const fichaKey = state.fichas[0].key;
    for (let n = 0; n < 32; n += 1) {
      state = editorReducer(state, { type: 'addItem', fichaKey, exercise: supino });
    }

    expect(state.fichas[0].items).toHaveLength(30);
  });
});

describe('configuração do exercício (TEL-023)', () => {
  beforeEach(() => {
    mockCounter = 0;
  });

  it('lê do item os parâmetros comuns e reconstrói as séries ao aplicar', () => {
    const item = newItem(supino);
    const config = { ...configOf(item), workSets: 4, warmup: true, repsMin: 6, repsMax: 8, loadKg: 60, rir: 2, restSeconds: 120, notes: ' Pausa de 1 s no peito ' };

    const applied = applyConfig(item, config);

    expect(applied.series.map((s) => s.tipo)).toEqual(['aquecimento', 'normal', 'normal', 'normal', 'normal']);
    expect(applied.series[0]).toMatchObject({ repsMin: 6, repsMax: 8, loadKg: null, rir: null }); // aquecimento sem carga-alvo
    expect(applied.series[1]).toMatchObject({ repsMin: 6, repsMax: 8, loadKg: 60, rir: 2 });
    expect(applied.restSeconds).toBe(120);
    expect(applied.notes).toBe(' Pausa de 1 s no peito ');
    expect(configOf(applied)).toMatchObject({ workSets: 4, warmup: true, repsMin: 6, repsMax: 8, loadKg: 60, rir: 2 });
  });

  it('exercício de tempo usa a duração e ignora repetições e carga', () => {
    const applied = applyConfig(newItem(prancha), { ...configOf(newItem(prancha)), durationSeconds: 60, repsMin: 5, repsMax: 9, loadKg: 20 });

    expect(applied.series[0]).toEqual({ tipo: 'normal', repsMin: null, repsMax: null, loadKg: null, rir: null, durationSeconds: 60 });
  });

  it('resume a prescrição legível: 3 × 8–12, 3 × 10, 3 × 45 s e sem faixa', () => {
    expect(prescriptionSummary(newItem(supino))).toEqual({ sets: 3, warmup: false, range: '8–12', kind: 'reps' });
    expect(prescriptionSummary(applyConfig(newItem(supino), { ...configOf(newItem(supino)), repsMin: 10, repsMax: 10, warmup: true }))).toMatchObject({ range: '10', warmup: true });
    expect(prescriptionSummary(newItem(prancha))).toEqual({ sets: 3, warmup: false, range: '45', kind: 'time' });
    expect(prescriptionSummary({ ...newItem(supino), series: [] })).toMatchObject({ sets: 0, kind: 'none' });
  });

  it('valida faixa de repetições, carga, RIR, séries, descanso e notas com as regras do servidor', () => {
    const ok = configOf(newItem(supino));

    expect(validateConfig(supino, ok)).toEqual({});
    expect(validateConfig(supino, { ...ok, repsMin: 12, repsMax: 8 })).toMatchObject({ reps: 'editor.erro.reps' });
    expect(validateConfig(supino, { ...ok, repsMin: null })).toMatchObject({ reps: 'editor.erro.reps' });
    expect(validateConfig(supino, { ...ok, repsMax: 1001 })).toMatchObject({ reps: 'editor.erro.reps' });
    expect(validateConfig(supino, { ...ok, loadKg: -1 })).toMatchObject({ load: 'editor.erro.carga' });
    expect(validateConfig(supino, { ...ok, rir: 11 })).toMatchObject({ rir: 'editor.erro.rir' });
    expect(validateConfig(supino, { ...ok, workSets: 0 })).toMatchObject({ workSets: 'editor.erro.series' });
    expect(validateConfig(supino, { ...ok, workSets: 20, warmup: true })).toMatchObject({ workSets: 'editor.erro.series' });
    expect(validateConfig(supino, { ...ok, restSeconds: 3601 })).toMatchObject({ rest: 'editor.erro.descanso' });
    expect(validateConfig(supino, { ...ok, notes: 'x'.repeat(2001) })).toMatchObject({ notes: 'editor.erro.notas' });
    expect(validateConfig(prancha, { ...configOf(newItem(prancha)), durationSeconds: null })).toMatchObject({ duration: 'editor.erro.duracao' });
  });
});

describe('payload, conversão e problemas', () => {
  beforeEach(() => {
    mockCounter = 0;
  });

  function sample(): EditorState {
    let state = withFicha();
    const fichaKey = state.fichas[0].key;
    state = editorReducer(state, { type: 'addItem', fichaKey, exercise: supino });
    return state;
  }

  it('monta o corpo do PUT com ordem, código e séries numeradas', () => {
    const payload = toPayload(sample());

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ codigo: 'A', titulo: 'Treino A', ordem: 1 });
    expect(payload[0].exercicios[0]).toMatchObject({ exercicio_uuid: 'ex-supino', ordem: 1, descanso_segundos: 90, instrucoes: null });
    expect(payload[0].exercicios[0].series.map((s) => s.ordem)).toEqual([1, 2, 3]);
    expect(payload[0].exercicios[0].series[0]).toEqual({ ordem: 1, tipo: 'normal', reps_min: 8, reps_max: 12, carga_alvo_kg: null, rir_alvo: null, duracao_alvo_segundos: null });
  });

  it('ida e volta com a versão do servidor não suja o editor', () => {
    const version = {
      numero: 1,
      estado: 'rascunho',
      revision: 3,
      fichas: [
        {
          id: 'f1',
          codigo: 'A',
          titulo: 'Peito',
          ordem: 1,
          exercicios: [
            {
              id: 'i1',
              exercicio: { id: 'ex-supino', nome: 'Supino reto', modalidade: 'reps_carga' },
              ordem: 1,
              descanso_segundos: 90,
              series: [{ id: 's1', ordem: 1, tipo: 'normal', reps_min: 8, reps_max: 12, carga_alvo_kg: 40 }],
            },
          ],
        },
      ],
    } as unknown as Schemas['Versao'];

    const loaded = fromVersion(version);

    expect(loaded.fichas[0]).toMatchObject({ key: 'f1', titulo: 'Peito' });
    expect(loaded.fichas[0].items[0].series[0]).toMatchObject({ repsMin: 8, repsMax: 12, loadKg: 40, rir: null });
    expect(isDirty(loaded, fromVersion(version))).toBe(false);
    expect(isDirty(editorReducer(loaded, { type: 'renameFicha', fichaKey: 'f1', titulo: 'Peito e tríceps' }), loaded)).toBe(true);
  });

  it('só reordenar já conta como alteração; desfazer volta a limpo', () => {
    let state = sample();
    const saved = state;
    state = editorReducer(state, { type: 'addFicha' });
    const second = state.fichas[1].key;

    expect(isDirty(state, saved)).toBe(true);
    expect(isDirty(editorReducer(state, { type: 'removeFicha', fichaKey: second }), saved)).toBe(false);
  });

  it('salvar exige título de ficha e série em cada exercício; publicar exige exercício em todas as fichas', () => {
    let state = sample();
    expect(saveIssues(state)).toEqual([]);
    expect(publishIssues(state)).toEqual([]);

    expect(saveIssues(editorReducer(state, { type: 'renameFicha', fichaKey: state.fichas[0].key, titulo: '   ' }))).toEqual(['editor.erro.fichaTitulo']);
    expect(publishIssues(empty)).toEqual(['editor.erro.fichaSemExercicio']);

    state = editorReducer(state, { type: 'addFicha' });
    expect(saveIssues(state)).toEqual([]); // ficha vazia vale em rascunho
    expect(publishIssues(state)).toEqual(['editor.erro.fichaSemExercicio']);

    const noSeries: EditorState = { fichas: [{ ...state.fichas[0], items: [{ ...state.fichas[0].items[0], series: [] }] }] };
    expect(saveIssues(noSeries)).toEqual(['editor.erro.itemSemSerie']);
  });
});
