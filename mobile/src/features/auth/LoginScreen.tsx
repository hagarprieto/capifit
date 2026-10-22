import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { describeAuthError } from './errors';
import { validateLogin } from './validation';

/** TEL-003 (entrar): e-mail e senha. Erro de credencial tem uma só mensagem; o botão não envia duas vezes. */
export function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [errors, setErrors] = useState<{ email?: string; senha?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = validateLogin(email, senha);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      await signIn(email, senha); // o guard das rotas leva para a área logada
    } catch (error) {
      setFormError(describeAuthError(error, ['email', 'senha'] as const).form ?? t('auth.erro.generico'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('auth.entrar.titulo')}
      </Text>
      {formError ? <Notice kind="error" message={formError} /> : null}
      <View style={{ gap: theme.space[2] }}>
        <TextField
          label={t('auth.entrar.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label={t('auth.entrar.senha')}
          value={senha}
          onChangeText={setSenha}
          error={errors.senha}
          secret
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </View>
      <Button label={t('auth.entrar.botao')} onPress={submit} loading={busy} />
      <Button label={t('auth.entrar.esqueci')} variant="text" onPress={() => router.push('/recuperar')} />
      <Button label={t('auth.entrar.semConta')} variant="text" onPress={() => router.replace('/cadastrar')} />
    </Screen>
  );
}
