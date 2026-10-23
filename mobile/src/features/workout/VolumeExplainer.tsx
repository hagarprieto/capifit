import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

/**
 * Explica de onde vem o número de volume (Doc 03 §5.6, Doc 09 §6): a conta, o que fica de fora e por que ele não é uma
 * nota. A frase curta fica sempre visível; os detalhes abrem sob demanda para não pesar a tela.
 */
export function VolumeExplainer() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="caption" color="secondary">
        {t('resumo.volumeExplicacao')}
      </Text>
      <Button label={t(open ? 'volume.ocultar' : 'volume.comoCalculamos')} variant="text" accessibilityHint={t('volume.dica')} onPress={() => setOpen((value) => !value)} />
      {open ? (
        <View accessibilityLiveRegion="polite" style={{ gap: theme.space[1], padding: theme.space[2], borderRadius: theme.radius.md, backgroundColor: theme.colors.bg.surface }}>
          <Text variant="bodySmall">{t('volume.formula')}</Text>
          <Text variant="bodySmall">{t('volume.naoEntram')}</Text>
          <Text variant="bodySmall">{t('volume.comparar')}</Text>
          <Text variant="bodySmall" color="secondary">
            {t('volume.naoNota')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
