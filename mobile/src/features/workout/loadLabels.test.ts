import { loadCaption, loadUnit } from './loadLabels';

describe('rótulo da carga por convenção (Doc 09 §6, CAT-10)', () => {
  it('cada convenção tem o seu rótulo', () => {
    expect(loadUnit('total', 'reps_carga')).toBe('kg (total)');
    expect(loadUnit('por_halter', 'reps_carga')).toBe('kg por halter');
    expect(loadUnit('por_lado', 'reps_carga')).toBe('kg por lado');
    expect(loadUnit('selecao_maquina', 'reps_carga')).toBe('kg (máquina)');
    expect(loadUnit('adicional_corporal', 'reps_peso_corporal')).toBe('kg extra');
    expect(loadUnit('assistencia', 'reps_assistido')).toBe('kg de assistência');
  });

  it('sem convenção informada vale a modalidade; convenção desconhecida cai no padrão', () => {
    expect(loadUnit(null, 'reps_carga')).toBe('kg');
    expect(loadUnit(undefined, 'reps_peso_corporal')).toBe('kg extra');
    expect(loadUnit(null, 'reps_assistido')).toBe('kg de assistência');
    expect(loadUnit('inventada', 'reps_carga')).toBe('kg');
  });

  it('a legenda só aparece quando há algo a esclarecer', () => {
    expect(loadCaption(null, 'reps_carga', false)).toBeNull();
    expect(loadCaption('por_halter', 'reps_carga', false)).toBe('Carga em kg por halter');
    expect(loadCaption('por_halter', 'reps_carga', true)).toBe('Carga em kg por halter · Repetições por lado');
    expect(loadCaption(null, 'reps_carga', true)).toBe('Repetições por lado');
    expect(loadCaption('adicional_corporal', 'reps_peso_corporal', false)).toBe('Carga em kg extra');
    expect(loadCaption(null, 'tempo', false)).toBeNull();
    expect(loadCaption(null, 'tempo', true)).toBe('Tempo de cada lado');
  });
});
