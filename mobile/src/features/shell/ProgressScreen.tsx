import { EmptyState } from '@/design-system/EmptyState';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { t } from '@/i18n';

/** Aba Evolução: reservada até o histórico e os gráficos (E09-03); por ora só explica o que virá. */
export function ProgressScreen() {
  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('aba.evolucao')}
      </Text>
      <EmptyState title={t('evolucao.emBreveTitulo')} message={t('evolucao.emBreveTexto')} />
    </Screen>
  );
}
