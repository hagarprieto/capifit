/**
 * Configuração em tempo de execução. Só valores públicos: variáveis EXPO_PUBLIC_* ficam dentro do app.
 * Versões dos documentos legais enviadas no cadastro (a API grava o aceite com a versão).
 */
export const config = {
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/+$/, ''),
  termsVersion: '1',
  privacyVersion: '1',
} as const;
