import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Mostra o indicador de progresso mantendo o texto; enquanto carrega, o toque é ignorado (sem envio duplo). */
  loading?: boolean;
  accessibilityHint?: string;
  /** Rótulo falado, quando precisa ser mais descritivo que o texto do botão ("Concluir série 2 de Supino reto: 40 kg, 10 repetições"). */
  accessibilityLabel?: string;
  testID?: string;
};

/** Botão do design system (Doc 08 §8): primário 56 dp com `brand.primary`, secundário com contorno e texto simples. */
export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, accessibilityHint, accessibilityLabel, testID }: Props) {
  const { theme } = useTheme();
  const { colors, radius, size, space } = theme;
  const inactive = disabled || loading;
  const minHeight = variant === 'text' ? size.touchMin[Platform.OS === 'ios' ? 'ios' : 'android'] : size.touchPreferred;

  const background = variant === 'primary' ? (disabled ? colors.bg.elevated : colors.brand.primary) : 'transparent';
  const textColor = variant === 'primary' ? (disabled ? colors.text.disabled : colors.brand.onPrimary) : variant === 'secondary' ? colors.text.primary : colors.brand.text;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight,
        alignSelf: variant === 'text' ? 'center' : 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[3],
        borderRadius: radius.md,
        backgroundColor: background,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: variant === 'secondary' ? colors.border.strong : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        {loading ? <ActivityIndicator color={textColor} /> : null}
        <Text variant="bodyStrong" style={{ color: textColor, textDecorationLine: variant === 'text' ? 'underline' : 'none' }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
