import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { t } from '@/i18n';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type Props = Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' | 'maxLength' | 'editable'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Mensagem de erro (já em texto do catálogo). Aparece com o prefixo "Erro:", então não depende só da cor. */
  error?: string | null;
  hint?: string;
  /** Campo de senha: oculta o texto e oferece "Mostrar/Ocultar". */
  secret?: boolean;
  testID?: string;
};

/** Campo de texto com rótulo visível, dica, erro com prefixo textual e anel de foco (Doc 08 §8). */
export function TextField({ label, value, onChangeText, error = null, hint, secret = false, testID, ...input }: Props) {
  const { theme } = useTheme();
  const { colors, radius, space, size } = theme;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = secret && !revealed;

  const borderColor = error ? colors.feedback.error : focused ? colors.focus.ring : colors.border.strong;

  return (
    <View style={{ gap: space[0] }}>
      <Text variant="bodySmall" color="secondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: size.touchPreferred,
          backgroundColor: colors.bg.elevated,
          borderRadius: radius.md,
          borderWidth: focused || error ? 2 : 1,
          borderColor,
          paddingHorizontal: space[2],
        }}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={hidden}
          autoCorrect={false}
          placeholderTextColor={colors.text.disabled}
          maxFontSizeMultiplier={theme.typography.maxFontScale}
          style={{ flex: 1, color: colors.text.primary, fontFamily: 'Inter_400Regular', fontSize: theme.typography.scale.body.size, paddingVertical: space[1] }}
          {...input}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealed ? 'campo.ocultarSenha' : 'campo.mostrarSenha')}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            style={{ minHeight: size.touchMin.android, justifyContent: 'center', paddingLeft: space[1] }}
          >
            <Text variant="bodySmall" style={{ color: colors.brand.text }}>
              {t(revealed ? 'campo.ocultar' : 'campo.mostrar')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="bodySmall" accessibilityLiveRegion="polite" style={{ color: colors.feedback.error }}>
          {t('campo.erro', { mensagem: error })}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
