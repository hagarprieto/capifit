import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { t } from '@/i18n';

/** Aba Perfil: conta e saída. Preferências, privacidade e vínculos entram com as histórias de perfil. */
export function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('aba.perfil')}
      </Text>
      <Text variant="title">{user?.nome ?? ''}</Text>
      <Button label={t('home.verTema')} variant="secondary" onPress={() => router.push('/tema')} />
      <Button label={t('home.sair')} variant="text" onPress={() => void signOut()} />
    </Screen>
  );
}
