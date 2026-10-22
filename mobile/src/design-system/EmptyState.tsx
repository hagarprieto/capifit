import { View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type Props = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Estado vazio: frase curta e uma única ação. (A Capi estática do Doc 08 entra quando o asset da marca existir.) */
export function EmptyState({ title, message, actionLabel, onAction }: Props) {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel={`${title}. ${message}`} style={{ alignItems: 'center', gap: theme.space[2], paddingVertical: theme.space[5] }}>
      <Text variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text color="secondary" style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
