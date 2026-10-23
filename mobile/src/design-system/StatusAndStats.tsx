import { View } from 'react-native';

import { t, type MessageKey } from '@/i18n';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type SyncState = 'synced' | 'pending' | 'offline' | 'conflict';

const SYNC_LABEL: Record<SyncState, MessageKey> = {
  synced: 'sync.sincronizado',
  pending: 'sync.pendente',
  offline: 'sync.offline',
  conflict: 'sync.conflito',
};

/** Estado de sincronização (Doc 08 §8): sempre texto + símbolo + cor, e o texto diz o que significa para os dados. */
export function SyncStatus({ state }: { state: SyncState }) {
  const { theme } = useTheme();
  const color = state === 'synced' ? theme.colors.feedback.success : state === 'conflict' ? theme.colors.feedback.error : theme.colors.feedback.warning;
  const label = t(SYNC_LABEL[state]);

  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[0] }}>
      <Text variant="caption" accessibilityElementsHidden importantForAccessibility="no" style={{ color }}>
        {t(state === 'synced' ? 'sync.icone.ok' : 'sync.icone.atencao')}
      </Text>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

export type WeekDay = { key: string; label: string; done: boolean; today: boolean; spoken: string };

/**
 * Semana de segunda a domingo (Doc 08 §8): concluído = marcador; hoje = anel; não treinado = ponto neutro (nunca um "x"
 * vermelho). A informação não depende de cor: cada dia tem rótulo falado ("Terça: treino concluído").
 */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  const { theme } = useTheme();
  const { colors, space, size } = theme;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((day) => (
        <View key={day.key} accessible accessibilityLabel={day.spoken} style={{ alignItems: 'center', gap: space[0] }}>
          <Text variant="caption" color="secondary">
            {day.label}
          </Text>
          <View
            style={{
              width: size.touchMin.android - 8,
              height: size.touchMin.android - 8,
              borderRadius: theme.radius.pill,
              borderWidth: day.today ? 2 : 1,
              borderColor: day.today ? colors.brand.primary : colors.border.subtle,
              backgroundColor: day.done ? colors.brand.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" accessibilityElementsHidden importantForAccessibility="no" style={{ color: day.done ? colors.brand.onPrimary : colors.text.disabled }}>
              {t(day.done ? 'semana.feito' : 'semana.vazio')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Número em destaque com rótulo e unidade sempre visíveis ("12.450 kg", "3 treinos"). */
export function StatTile({ value, label, spoken }: { value: string; label: string; spoken: string }) {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel={spoken} style={{ flex: 1, gap: theme.space[0], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
      <Text variant="numeric" tabular>
        {value}
      </Text>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}
