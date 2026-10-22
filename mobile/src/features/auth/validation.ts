import { t } from '@/i18n';

/** Regras do contrato (RegisterRequest/LoginRequest): senha de 10 a 200 caracteres, nome de 1 a 160, e-mail até 190. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  return value.length <= 190 && EMAIL.test(value) ? undefined : t('auth.valida.email');
}

export function validateNewPassword(password: string): string | undefined {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX ? undefined : t('auth.valida.senhaMinima');
}

export function validateLogin(email: string, password: string): FieldErrors<'email' | 'senha'> {
  const errors: FieldErrors<'email' | 'senha'> = {};
  const emailError = validateEmail(email);
  if (emailError) {
    errors.email = emailError;
  }
  if (password === '') {
    errors.senha = t('auth.valida.senhaObrigatoria');
  }
  return errors;
}

export function validateRegister(input: { nome: string; email: string; senha: string; aceite: boolean; maior18: boolean }): FieldErrors<'nome' | 'email' | 'senha' | 'aceite' | 'maior18'> {
  const errors: FieldErrors<'nome' | 'email' | 'senha' | 'aceite' | 'maior18'> = {};
  const name = input.nome.trim();
  if (name.length < 1 || name.length > 160) {
    errors.nome = t('auth.valida.nome');
  }
  const emailError = validateEmail(input.email);
  if (emailError) {
    errors.email = emailError;
  }
  const passwordError = validateNewPassword(input.senha);
  if (passwordError) {
    errors.senha = passwordError;
  }
  if (!input.aceite) {
    errors.aceite = t('auth.valida.aceite');
  }
  if (!input.maior18) {
    errors.maior18 = t('auth.valida.maior18');
  }
  return errors;
}
