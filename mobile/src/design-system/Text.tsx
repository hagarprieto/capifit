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
          // Sempre um valor, nunca `undefined`: quando a mesma instância de Text deixa de ser tabular (ex.: o cartão do
          // descanso troca o relógio pela mensagem de fim), `undefined` vira `null` na atualização nativa e o React Native
          // quebra em `processFontVariant` ("Cannot read property 'split' of null"). Achado na validação em aparelho.
          fontVariant: tabular ? ['tabular-nums'] : ['proportional-nums'],
        },
        style,
      ]}
      {...rest}
    />
  );
}
