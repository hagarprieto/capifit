import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { useTheme } from './ThemeProvider';
import { fontFamilyFor } from './theme';

export type TextVariant = 'caption' | 'bodySmall' | 'body' | 'bodyStrong' | 'title' | 'headline' | 'display' | 'numeric';
export type TextColor = 'primary' | 'secondary' | 'disabled';

type Props = NativeTextProps & {
  variant?: TextVariant;
  color?: TextColor;
  /** Algarismos de largura fixa (carga, repetições, tempo): alinham colunas no executor. */
  tabular?: boolean;
};

/** Texto com a escala tipográfica do design system. Respeita a fonte do sistema até 200%. */
export function Text({ variant = 'body', color = 'primary', tabular = variant === 'numeric', style, ...rest }: Props) {
  const { theme } = useTheme();
  const scale = theme.typography.scale[variant];

  return (
    <NativeText
      maxFontSizeMultiplier={theme.typography.maxFontScale}
      style={[
        {
          fontFamily: fontFamilyFor(scale.weight),
          fontSize: scale.size,
          lineHeight: scale.line,
          color: theme.colors.text[color],
          fontVariant: tabular ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
