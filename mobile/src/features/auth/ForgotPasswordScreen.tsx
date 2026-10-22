import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { t } from '@/i18n';

import { describeAuthError } from './errors';
import { validateEmail } from './validation';

/** TEL-004: pede o link de redefinição. A resposta é sempre a mesma (não revela se o e-mail tem conta). */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validateEmail(email);
    setError(invalid);
    setFormError(null);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setFormError(describeAuthError(e, ['email'] as const).form ?? t('auth.erro.generico'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('auth.recuperar.titulo')}
      </Text>
      {sent ? (
        <Notice kind="success" message={t('auth.recuperar.enviado')} />
      ) : (
        <>
          <Text color="secondary">{t('auth.recuperar.texto')}</Text>
          {formError ? <Notice kind="error" message={formError} /> : null}
          <TextField
            label={t('auth.recuperar.email')}
            value={email}
            onChangeText={setEmail}
            error={error}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Button label={t('auth.recuperar.botao')} onPress={submit} loading={busy} />
        </>
      )}
      <Button label={t('auth.recuperar.voltar')} variant="text" onPress={() => router.replace('/entrar')} />
    </Screen>
  );
}
