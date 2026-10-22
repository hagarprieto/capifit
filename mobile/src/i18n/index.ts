import { ptBR, type MessageKey } from './pt-BR';

export type { MessageKey };

/** Traduz uma chave do catálogo, substituindo `{nome}` pelos parâmetros. Chave inexistente devolve a própria chave. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template: string = ptBR[key] ?? key;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
