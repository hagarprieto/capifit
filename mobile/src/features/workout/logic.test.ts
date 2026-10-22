import { formatDecimal, parseDecimal, parseWhole, requiredFields, validateDraft } from './input';
import { initialDraft, lastTimeSummary, type LastRecord, type SessionSeries } from './prefill';

const series = (ordem: number, over: Partial<SessionSeries> = {}): SessionSeries => ({ id: `s${ordem}`, ordem, tipo: 'normal', status: 'pendente', revision: 1, ...over });
const last: LastRecord = {
  exercicio_id: 'e1',
  sessao_id: 'x',
  data: '2026-10-10T10:00:00.000Z',
  series: [
    { ordem: 1, carga_kg: 40, repeticoes: 10 },
    { ordem: 2, carga_kg: 40, repeticoes: 10 },
    { ordem: 3, carga_kg: 40, repeticoes: 8 },
  ],
};

describe('parse e formatação', () => {
  it('aceita vírgula ou ponto na carga e recusa o que não é número válido', () => {
    expect(parseDecimal('42,5')).toBe(42.5);
    expect(parseDecimal(' 42.5 ')).toBe(42.5);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-5')).toBeNull();
    expect(parseDecimal('12,345')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('100000')).toBeNull();
    expect(formatDecimal(42.5)).toBe('42,5');
    expect(formatDecimal(40)).toBe('40');
    expect(formatDecimal(null)).toBe('');
  });

  it('repetições são inteiros dentro do limite', () => {
    expect(parseWhole('10', 1000)).toBe(10);
    expect(parseWhole('10,5', 1000)).toBeNull();
    expect(parseWhole('1001', 1000)).toBeNull();
    expect(parseWhole('', 1000)).toBeNull();
  });
});

describe('validateDraft (mesmas exigências do servidor)', () => {
  it('reps_carga exige carga (zero vale) e repetições', () => {
    expect(requiredFields('reps_carga')).toEqual(['reps', 'carga']);
    expect(validateDraft('reps_carga', { carga: '', reps: '10', duracao: '' })).toMatchObject({ ok: false, errors: { carga: expect.any(String) } });
    expect(validateDraft('reps_carga', { carga: '0', reps: '10', duracao: '' })).toEqual({ ok: true, values: { carga_kg: 0, repeticoes: 10 } });
    expect(validateDraft('reps_carga', { carga: '40', reps: '0', duracao: '' })).toMatchObject({ ok: false, errors: { reps: expect.any(String) } });
  });

  it('peso corporal e assistido: só repetições; carga em branco não vai, carga digitada vai', () => {
    expect(validateDraft('reps_peso_corporal', { carga: '', reps: '12', duracao: '' })).toEqual({ ok: true, values: { repeticoes: 12 } });
    expect(validateDraft('reps_assistido', { carga: '20', reps: '8', duracao: '' })).toEqual({ ok: true, values: { carga_kg: 20, repeticoes: 8 } });
    expect(validateDraft('reps_peso_corporal', { carga: 'x', reps: '12', duracao: '' })).toMatchObject({ ok: false, errors: { carga: expect.any(String) } });
  });

  it('tempo exige a duração em segundos', () => {
    expect(validateDraft('tempo', { carga: '', reps: '', duracao: '45' })).toEqual({ ok: true, values: { duracao_segundos: 45 } });
    expect(validateDraft('tempo', { carga: '', reps: '', duracao: '' })).toMatchObject({ ok: false, errors: { duracao: expect.any(String) } });
  });
});

describe('initialDraft (D-14: referência, não registro)', () => {
  it('usa a série de mesma posição do último treino', () => {
    expect(initialDraft(series(3), [series(1), series(2), series(3)], last)).toEqual({ draft: { carga: '40', reps: '8', duracao: '' }, prefilled: true });
  });

  it('além da última série registrada, repete a última', () => {
    expect(initialDraft(series(5), [], last).draft).toMatchObject({ carga: '40', reps: '8' });
  });

  it('a série anterior já concluída nesta sessão tem preferência sobre o último treino', () => {
    const done = series(1, { status: 'realizada', carga_kg: 45, repeticoes: 9 });

    expect(initialDraft(series(2), [done, series(2)], last)).toEqual({ draft: { carga: '45', reps: '9', duracao: '' }, prefilled: true });
  });

  it('sem histórico, os campos ficam em branco e sem marca de pré-preenchido', () => {
    expect(initialDraft(series(1), [series(1)], undefined)).toEqual({ draft: { carga: '', reps: '', duracao: '' }, prefilled: false });
  });

  it('série já concluída mostra o que foi registrado, sem marca de pré-preenchido', () => {
    expect(initialDraft(series(1, { status: 'realizada', carga_kg: 42.5, repeticoes: 10 }), [], last)).toEqual({ draft: { carga: '42,5', reps: '10', duracao: '' }, prefilled: false });
  });
});

describe('lastTimeSummary', () => {
  it('resume carga única e repetições por série', () => {
    expect(lastTimeSummary('reps_carga', last)).toEqual({ load: '40', values: '10/10/8' });
  });

  it('carga variada não é resumida em um número só; sem registro devolve null; tempo lista segundos', () => {
    const varied: LastRecord = { ...last, series: [{ ordem: 1, carga_kg: 40, repeticoes: 10 }, { ordem: 2, carga_kg: 45, repeticoes: 8 }] };
    expect(lastTimeSummary('reps_carga', varied)).toEqual({ load: null, values: '10/8' });
    expect(lastTimeSummary('reps_carga', undefined)).toBeNull();
    expect(lastTimeSummary('tempo', { ...last, series: [{ ordem: 1, duracao_segundos: 45 }, { ordem: 2, duracao_segundos: 40 }] })).toEqual({ load: null, values: '45/40' });
  });
});
