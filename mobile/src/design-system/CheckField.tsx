import { Pressable, View } from 'react-native';

import { t } from '@/i18n';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  testID?: string;
};

/** Caixa de seleção com rótulo (aceite de termos, maioridade). O estado e o erro são textuais, não só de cor. */
export function CheckField({ label, checked, onChange, error = null, testID }: Props) {
  const { theme } = useTheme();
  const { colors, radius, space, size } = theme;

  return (
    <View style={{ gap: space[0] }}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: size.touchMin.android }}
      >
        <View
          style={{
            width: size.icon[1],
            height: size.icon[1],
            borderRadius: radius.sm / 2,
            borderWidth: 2,
            borderColor: error ? colors.feedback.error : colors.border.strong,
            backgroundColor: checked ? colors.brand.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? (
            <Text variant="caption" style={{ color: colors.brand.onPrimary }}>
              {t('campo.marcado')}
            </Text>
          ) : null}
        </View>
        <Text variant="bodySmall" style={{ flex: 1 }}>
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="bodySmall" accessibilityLiveRegion="polite" style={{ color: colors.feedback.error }}>
          {t('campo.erro', { mensagem: error })}
        </Text>
      ) : null}
    </View>
  );
}
