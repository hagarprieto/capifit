import { LIMITS, applyConfig, defaultFichaTitle, newItem, type EditorExercise, type EditorState, type ItemConfig } from './model';
import { newUuid } from '@/lib/uuid';

export type EditorAction =
  | { type: 'replace'; state: EditorState }
  | { type: 'addFicha' }
  | { type: 'removeFicha'; fichaKey: string }
  | { type: 'moveFicha'; fichaKey: string; direction: -1 | 1 }
  | { type: 'renameFicha'; fichaKey: string; titulo: string }
  | { type: 'duplicateFicha'; fichaKey: string }
  | { type: 'addItem'; fichaKey: string; exercise: EditorExercise }
  | { type: 'removeItem'; fichaKey: string; itemKey: string }
  | { type: 'moveItem'; fichaKey: string; itemKey: string; direction: -1 | 1 }
  | { type: 'configureItem'; fichaKey: string; itemKey: string; config: ItemConfig };

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) {
    return list;
  }
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Edições do programa em memória. Funções puras: nada aqui fala com a rede (salvar é uma ação à parte). */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'replace':
      return action.state;

    case 'addFicha':
      return state.fichas.length >= LIMITS.fichas ? state : { fichas: [...state.fichas, { key: newUuid(), titulo: defaultFichaTitle(state.fichas.length), items: [] }] };

    case 'removeFicha':
      return { fichas: state.fichas.filter((f) => f.key !== action.fichaKey) };

    case 'moveFicha':
      return { fichas: move(state.fichas, state.fichas.findIndex((f) => f.key === action.fichaKey), action.direction) };

    case 'renameFicha':
      return { fichas: state.fichas.map((f) => (f.key === action.fichaKey ? { ...f, titulo: action.titulo } : f)) };

    case 'duplicateFicha': {
      const index = state.fichas.findIndex((f) => f.key === action.fichaKey);
      if (index < 0 || state.fichas.length >= LIMITS.fichas) {
        return state;
      }
      const source = state.fichas[index];
      const copy = { key: newUuid(), titulo: `${source.titulo} (cópia)`.slice(0, LIMITS.title), items: source.items.map((item) => ({ ...item, key: newUuid(), series: item.series.map((s) => ({ ...s })) })) };
      return { fichas: [...state.fichas.slice(0, index + 1), copy, ...state.fichas.slice(index + 1)] };
    }

    case 'addItem':
      return {
        fichas: state.fichas.map((f) => (f.key === action.fichaKey && f.items.length < LIMITS.itemsPerFicha ? { ...f, items: [...f.items, newItem(action.exercise)] } : f)),
      };

    case 'removeItem':
      return { fichas: state.fichas.map((f) => (f.key === action.fichaKey ? { ...f, items: f.items.filter((i) => i.key !== action.itemKey) } : f)) };

    case 'moveItem':
      return {
        fichas: state.fichas.map((f) => (f.key === action.fichaKey ? { ...f, items: move(f.items, f.items.findIndex((i) => i.key === action.itemKey), action.direction) } : f)),
      };

    case 'configureItem':
      return {
        fichas: state.fichas.map((f) => (f.key === action.fichaKey ? { ...f, items: f.items.map((i) => (i.key === action.itemKey ? applyConfig(i, action.config) : i)) } : f)),
      };
  }
}
