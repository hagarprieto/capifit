import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { CheckField } from '@/design-system/CheckField';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { formatClock, type RestState } from './restTimer';

type Props = {
  state: RestState;
  remainingMs: number;
  progress: number;
  stepSeconds: number;
  autoStart: boolean;
  onAutoStartChange: (value: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAdjust: (deltaSeconds: number) => void;
};

/** Anel de progresso simplificado: barra fina que enche com o tempo decorrido (não depende de cor para informar). */
function ProgressBar({ value }: { value: number }) {
  const { theme } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border.subtle, overflow: 'hidden' }}
    >
      <View style={{ width: `${Math.round(value * 100)}%`, height: 6, backgroundColor: theme.colors.brand.primary }} />
    </View>
  );
}

/**
 * Descanso do executor (TEL-013): contagem não bloqueante com pausar, pular e ajuste de 15 s. A tela do treino continua
 * editável durante a contagem. Leitor de tela: o relógio pode ser focado para ler o tempo exato; o aviso falado
 * automático (texto de apoio, região viva) só muda a cada 15 s, não a cada segundo.
 */
export function RestTimerCard({ state, remainingMs, progress, stepSeconds, autoStart, onAutoStartChange, onStart, onPause, onResume, onSkip, onAdjust }: Props) {
  const { theme } = useTheme();
  const { space, radius, colors } = theme;
  const running = state.status === 'running';
  const paused = state.status === 'paused';
  const roundedForSpeech = formatClock(Math.ceil(remainingMs / 15_000) * 15_000);

  return (
    <View style={{ gap: space[2], padding: space[2], borderRadius: radius.lg, backgroundColor: colors.bg.surface }}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {t('descanso.titulo')}
      </Text>

      {running || paused ? (
        <>
          <Text variant="display" tabular>
            {formatClock(remainingMs)}
          </Text>
          <ProgressBar value={progress} />
          <Text variant="bodySmall" color="secondary" accessibilityLiveRegion="polite">
            {paused ? t('descanso.pausado', { tempo: formatClock(remainingMs) }) : t('descanso.tempoA11y', { tempo: roundedForSpeech })}
          </Text>
          <View style={{ flexDirection: 'row', gap: space[1] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('descanso.menos', { segundos: stepSeconds })} accessibilityLabel={t('descanso.menosA11y', { segundos: stepSeconds })} variant="secondary" onPress={() => onAdjust(-stepSeconds)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('descanso.mais', { segundos: stepSeconds })} accessibilityLabel={t('descanso.maisA11y', { segundos: stepSeconds })} variant="secondary" onPress={() => onAdjust(stepSeconds)} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space[1] }}>
            <View style={{ flex: 1 }}>
              <Button label={paused ? t('descanso.retomar') : t('descanso.pausar')} variant="secondary" onPress={paused ? onResume : onPause} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('descanso.pular')} onPress={onSkip} />
            </View>
          </View>
        </>
      ) : state.status === 'finished' ? (
        <>
          <Text accessibilityLiveRegion="assertive">{t('descanso.terminou')}</Text>
          <Button label={t('descanso.dispensar')} variant="secondary" onPress={onSkip} />
        </>
      ) : (
        <>
          <Text variant="bodySmall" color="secondary">
            {t('descanso.dica')}
          </Text>
          <Button label={t('descanso.iniciar')} variant="secondary" onPress={onStart} />
        </>
      )}

      <CheckField label={t('descanso.automatico')} checked={autoStart} onChange={onAutoStartChange} />
    </View>
  );
}
