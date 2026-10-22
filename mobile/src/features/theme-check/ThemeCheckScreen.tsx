import { Pressable, View } from 'react-native';

import { Screen } from '@/design-system/Screen';
import { Text, type TextVariant } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { flattenTokens, type Preference } from '@/design-system/theme';
import { t, type MessageKey } from '@/i18n';

const OPTIONS: { value: Preference; label: MessageKey }[] = [
  { value: 'system', label: 'tema.sistema' },
  { value: 'light', label: 'tema.claro' },
  { value: 'dark', label: 'tema.escuro' },
];

/**
 * Tela de verificação do M0: mostra os tokens aplicados (cores, tipografia) e permite alternar o tema,
 * para conferir contraste, fonte ampliada (até 200%) e tempo de abertura no aparelho (Doc 11, bloco G).
 */
export function ThemeCheckScreen() {
  const { theme, preference, setPreference } = useTheme();
  const { colors, space, radius, size } = theme;
  const variants = Object.keys(theme.typography.scale) as TextVariant[];
  const swatches = flattenTokens(colors);
  const schemeLabel = t(theme.scheme === 'dark' ? 'tema.escuro' : 'tema.claro').toLowerCase();

  return (
    <Screen>
      <View style={{ gap: space[0] }}>
        <Text variant="headline" accessibilityRole="header">
          {t('themeCheck.titulo')}
        </Text>
        <Text variant="bodySmall" color="secondary">
          {t('themeCheck.subtitulo')}
        </Text>
      </View>

      <View style={{ gap: space[1] }}>
        <Text variant="title" accessibilityRole="header">
          {t('themeCheck.secaoTema')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {OPTIONS.map((option) => {
            const selected = preference === option.value;
            const name = t(option.label);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t('a11y.selecionarTema', { tema: name.toLowerCase() })}
                onPress={() => setPreference(option.value)}
                style={{
                  minHeight: size.touchPreferred,
                  minWidth: size.touchPreferred,
                  paddingHorizontal: space[3],
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: selected ? colors.brand.primary : colors.border.strong,
                  backgroundColor: selected ? colors.brand.primary : colors.bg.elevated,
                }}
              >
                <Text variant="bodyStrong" style={{ color: selected ? colors.brand.onPrimary : colors.text.primary }}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="bodySmall" color="secondary">
          {[t('themeCheck.temaAtual', { tema: schemeLabel }), t('themeCheck.versaoTokens', { versao: theme.version })].join(' · ')}
        </Text>
      </View>

      <View style={{ gap: space[1] }}>
        <Text variant="title" accessibilityRole="header">
          {t('themeCheck.secaoCores')}
        </Text>
        <View style={{ gap: space[1] }}>
          {swatches.map(([name, value]) => (
            <View
              key={name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[2],
                padding: space[1],
                borderRadius: radius.sm,
                backgroundColor: colors.bg.surface,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.sm,
                  backgroundColor: value,
                  borderWidth: 1,
                  borderColor: colors.border.strong,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall">{name}</Text>
                <Text variant="caption" color="secondary" tabular>
                  {value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: space[1] }}>
        <Text variant="title" accessibilityRole="header">
          {t('themeCheck.secaoTipografia')}
        </Text>
        {variants.map((variant) => (
          <View key={variant} style={{ gap: 2 }}>
            <Text variant="caption" color="secondary">
              {`${variant} · ${theme.typography.scale[variant].size}/${theme.typography.scale[variant].line}`}
            </Text>
            <Text variant={variant}>{t('themeCheck.amostra')}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: space[1] }}>
        <Text variant="title" accessibilityRole="header">
          {t('themeCheck.secaoFonte')}
        </Text>
        <Text variant="body" color="secondary">
          {t('themeCheck.dicaFonte')}
        </Text>
      </View>
    </Screen>
  );
}
