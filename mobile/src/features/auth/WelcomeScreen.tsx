import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

/** TEL-002: proposta de valor e os dois caminhos (entrar ou criar conta). */
export function WelcomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <Screen>
      <View style={{ gap: theme.space[2], paddingTop: theme.space[5] }}>
        <Text variant="display" accessibilityRole="header">
          {t('auth.boasVindas.titulo')}
        </Text>
        <Text color="secondary">{t('auth.boasVindas.texto')}</Text>
      </View>
      <View style={{ gap: theme.space[2], paddingTop: theme.space[4] }}>
        <Button label={t('auth.boasVindas.criar')} onPress={() => router.push('/cadastrar')} />
        <Button label={t('auth.boasVindas.entrar')} variant="secondary" onPress={() => router.push('/entrar')} />
      </View>
    </Screen>
  );
}
