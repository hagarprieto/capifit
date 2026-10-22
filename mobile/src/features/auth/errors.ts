import { isApiError } from '@/api/errors';
import { t } from '@/i18n';

export type FormFailure<K extends string> = {
  /** Mensagem geral do formulário (aviso no topo). */
  form?: string;
  /** Mensagens por campo, quando o servidor as indica. */
  fields?: Partial<Record<K, string>>;
};

/**
 * Traduz um erro da API em mensagens para o usuário. Credenciais erradas têm UMA mensagem (sem dizer se o e-mail existe).
 * Mensagens por campo vêm do servidor (texto fixo em português, sem eco do que foi digitado).
 */
export function describeAuthError<K extends string>(error: unknown, fieldNames: readonly K[]): FormFailure<K> {
  if (!isApiError(error)) {
    return { form: t('auth.erro.generico') };
  }
  if (error.isNetwork) {
    return { form: t('auth.erro.rede') };
  }
  if (error.status === 429) {
    return { form: t('auth.erro.limite', { minutos: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) }) };
  }
  if (error.code === 'UNAUTHENTICATED' || error.status === 401) {
    return { form: t('auth.erro.credenciais') };
  }
  if (error.code === 'EMAIL_ALREADY_REGISTERED') {
    return { fields: { email: t('auth.erro.emailCadastrado') } as Partial<Record<K, string>> };
  }
  if (error.code === 'VALIDATION_ERROR') {
    const fields: Partial<Record<K, string>> = {};
    for (const name of fieldNames) {
      const message = error.fields[name]?.[0];
      if (message) {
        fields[name] = message;
      }
    }
    // O servidor recusou algo que o app não soube mapear para um campo: aviso geral.
    return Object.keys(fields).length > 0 ? { fields } : { form: t('auth.erro.generico') };
  }
  return { form: t('auth.erro.generico') };
}
