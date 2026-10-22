import { useState } from 'react';
import { TextInput } from 'react-native';

import { useTheme } from './ThemeProvider';

type Props = {
  /** Rótulo para leitor de tela, completo: "Carga em kg, série 2 de Supino". */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  kind?: 'decimal' | 'integer';
  /** Valor sugerido (referência), ainda não confirmado: aparece em cor secundária até o usuário editar ou concluir. */
  prefilled?: boolean;
  invalid?: boolean;
  editable?: boolean;
  testID?: string;
};

/** Campo numérico do executor (Doc 08 §8): teclado numérico/decimal, largura fixa, anel de foco e contorno de erro. */
export function NumberField({ label, value, onChangeText, kind = 'integer', prefilled = false, invalid = false, editable = true, testID }: Props) {
  const { theme } = useTheme();
  const { colors, radius, size, space } = theme;
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      editable={editable}
      keyboardType={kind === 'decimal' ? 'decimal-pad' : 'number-pad'}
      inputMode={kind === 'decimal' ? 'decimal' : 'numeric'}
      selectTextOnFocus
      maxLength={kind === 'decimal' ? 8 : 5}
      maxFontSizeMultiplier={theme.typography.maxFontScale}
      style={{
        width: size.setField.width,
        minHeight: size.touchPreferred,
        textAlign: 'center',
        paddingHorizontal: space[1],
        borderRadius: radius.md,
        borderWidth: focused || invalid ? 2 : 1,
        borderColor: invalid ? colors.feedback.error : focused ? colors.focus.ring : colors.border.strong,
        backgroundColor: editable ? colors.bg.elevated : 'transparent',
        color: prefilled ? colors.text.secondary : colors.text.primary,
        fontFamily: 'Inter_700Bold',
        fontSize: theme.typography.scale.numeric.size,
        fontVariant: ['tabular-nums'],
      }}
    />
  );
}
