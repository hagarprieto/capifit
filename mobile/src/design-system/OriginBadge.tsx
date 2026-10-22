import { View } from 'react-native';

import { t } from '@/i18n';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type Origin = 'usuario' | 'coach' | 'app';

type Props = {
  origin: Origin;
  /** Nome de quem prescreveu (só para o coach). */
  authorName?: string;
};

/** Rótulo falado e escrito da origem: "Criado por você", "Prescrito por {nome}" ou "Sugerido pelo CapiFit". */
export function originLabel(origin: Origin, authorName?: string): string {
  return origin === 'coach' ? t('origem.coach', { nome: authorName ?? '' }) : t(origin === 'usuario' ? 'origem.usuario' : 'origem.app');
}

/**
 * Origem do programa (RN-08, UX-06): sempre ÍCONE + TEXTO + COR, nunca só a cor. O ícone é um símbolo de forma
 * distinta por origem (a Capi/ícones da marca substituem estes símbolos quando existirem).
 */
export function OriginBadge({ origin, authorName }: Props) {
  const { theme } = useTheme();
  const color = theme.colors.origin[origin];
  const label = originLabel(origin, authorName);
  const symbol = t(origin === 'usuario' ? 'origem.icone.usuario' : origin === 'coach' ? 'origem.icone.coach' : 'origem.icone.app');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.space[0],
        paddingHorizontal: theme.space[1],
        paddingVertical: 2,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Text variant="caption" accessibilityElementsHidden importantForAccessibility="no" style={{ color }}>
        {symbol}
      </Text>
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
