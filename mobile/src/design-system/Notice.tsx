import { View } from 'react-native';

import { t, type MessageKey } from '@/i18n';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type NoticeKind = 'error' | 'warning' | 'info' | 'success';

const TITLE: Record<NoticeKind, MessageKey> = {
  error: 'aviso.erro',
  warning: 'aviso.atencao',
  info: 'aviso.info',
  success: 'aviso.sucesso',
};

/** Aviso em bloco (erro, atenção, informação, sucesso): título textual + mensagem, anunciado por leitor de tela. */
export function Notice({ kind = 'info', message, testID }: { kind?: NoticeKind; message: string; testID?: string }) {
  const { theme } = useTheme();
  const color = theme.colors.feedback[kind];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        gap: theme.space[0],
        padding: theme.space[2],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: theme.colors.bg.surface,
      }}
    >
      <Text variant="bodyStrong" style={{ color }}>
        {t(TITLE[kind])}
      </Text>
      <Text variant="bodySmall">{message}</Text>
    </View>
  );
}
