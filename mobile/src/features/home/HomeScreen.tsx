import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { t } from '@/i18n';

/** Início provisório da área logada; o TEL-010 (Início com estados) substitui esta tela no marco M2. */
export function HomeScreen() {
  const router = useRouter();
  const { user, offline, signOut } = useAuth();

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('home.ola', { nome: user?.nome ?? '' })}
      </Text>
      <Text color="secondary">{t('home.texto')}</Text>
      {offline ? <Notice kind="info" message={t('home.offline')} /> : null}
      <Button label={t('home.verTema')} variant="secondary" onPress={() => router.push('/tema')} />
      <Button label={t('home.sair')} variant="text" onPress={() => void signOut()} />
    </Screen>
  );
}
