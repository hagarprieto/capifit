import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { isApiError } from '@/api/errors';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { t } from '@/i18n';

import { describeAuthError } from './errors';
import { validateNewPassword } from './validation';

/** Destino do link do e-mail (`capifit://redefinir-senha?token=...`): define a nova senha. O token nunca é exibido nem registrado. */
export function ResetPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (typeof token !== 'string' || token === '') {
    return (
      <Screen>
        <Text variant="headline" accessibilityRole="header">
          {t('auth.redefinir.titulo')}
        </Text>
        <Notice kind="warning" message={t('auth.redefinir.linkInvalido')} />
        <Button label={t('auth.redefinir.pedirNovo')} onPress={() => router.replace('/recuperar')} />
      </Screen>
    );
  }

  async function submit() {
    const invalid = validateNewPassword(senha);
    setError(invalid);
    setFormError(null);
    if (invalid || typeof token !== 'string') {
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, senha);
      setDone(true);
    } catch (e) {
      // O servidor responde igual para token inválido, vencido ou já usado (422 em `token`).
      if (isApiError(e) && e.fields.token) {
        setFormError(t('auth.redefinir.linkInvalido'));
      } else {
        const failure = describeAuthError(e, ['nova_senha'] as const);
        setError(failure.fields?.nova_senha);
        setFormError(failure.form ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('auth.redefinir.titulo')}
      </Text>
      {done ? (
        <>
          <Notice kind="success" message={t('auth.redefinir.ok')} />
          <Button label={t('auth.boasVindas.entrar')} onPress={() => router.replace('/entrar')} />
        </>
      ) : (
        <>
          {formError ? <Notice kind="error" message={formError} /> : null}
          <TextField
            label={t('auth.redefinir.senha')}
            value={senha}
            onChangeText={setSenha}
            error={error}
            hint={t('auth.cadastro.senhaDica')}
            secret
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={200}
          />
          <Button label={t('auth.redefinir.botao')} onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
