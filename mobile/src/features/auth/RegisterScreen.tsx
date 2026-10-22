import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { CheckField } from '@/design-system/CheckField';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { describeAuthError } from './errors';
import { validateRegister, type FieldErrors } from './validation';

type Field = 'nome' | 'email' | 'senha' | 'aceite' | 'maior18';
const SERVER_FIELDS = ['nome', 'email', 'senha', 'aceita_termos', 'maior_de_18'] as const;

/** TEL-003 (cadastro): nome, e-mail, senha, aceite dos documentos e declaração de maioridade (RG: 18+). */
export function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { theme } = useTheme();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [maior18, setMaior18] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = validateRegister({ nome, email, senha, aceite, maior18 });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      await signUp({ nome, email, senha });
    } catch (error) {
      const failure = describeAuthError(error, SERVER_FIELDS);
      setFormError(failure.form ?? null);
      setErrors({
        nome: failure.fields?.nome,
        email: failure.fields?.email,
        senha: failure.fields?.senha,
        aceite: failure.fields?.aceita_termos,
        maior18: failure.fields?.maior_de_18,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('auth.cadastro.titulo')}
      </Text>
      {formError ? <Notice kind="error" message={formError} /> : null}
      <View style={{ gap: theme.space[2] }}>
        <TextField label={t('auth.cadastro.nome')} value={nome} onChangeText={setNome} error={errors.nome} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" maxLength={160} />
        <TextField
          label={t('auth.cadastro.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          maxLength={190}
        />
        <TextField
          label={t('auth.cadastro.senha')}
          value={senha}
          onChangeText={setSenha}
          error={errors.senha}
          hint={t('auth.cadastro.senhaDica')}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={200}
        />
        <CheckField label={t('auth.cadastro.aceite')} checked={aceite} onChange={setAceite} error={errors.aceite} />
        <CheckField label={t('auth.cadastro.maior18')} checked={maior18} onChange={setMaior18} error={errors.maior18} />
      </View>
      <Button label={t('auth.cadastro.botao')} onPress={submit} loading={busy} />
      <Button label={t('auth.cadastro.jaTenho')} variant="text" onPress={() => router.replace('/entrar')} />
    </Screen>
  );
}
