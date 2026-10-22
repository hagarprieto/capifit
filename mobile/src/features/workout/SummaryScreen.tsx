import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { formatVolume, summarize, type SummarySet } from './summary';
import { createWorkoutApi, type Session, type WorkoutApi } from './workoutApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'open' } | { kind: 'ready'; session: Session };

function setText(set: SummarySet): string {
  if (set.kind === 'time') {
    return t('resumo.serieTempo', { numero: set.ordem, segundos: set.segundos });
  }
  return set.kind === 'loadReps'
    ? t('resumo.serieCargaReps', { numero: set.ordem, carga: set.carga, reps: set.reps })
    : t('resumo.serieReps', { numero: set.ordem, reps: set.reps });
}

/**
 * TEL-014: resumo do treino concluído. Só mostra "concluído" depois de reler a sessão no servidor (confirma que foi
 * gravada); se ainda estiver aberta, avisa em vez de comemorar. O volume vem com a regra de cálculo explícita.
 */
export function SummaryScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const workoutApi = useMemo(() => api ?? createWorkoutApi(auth.api), [api, auth.api]);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workoutApi
      .getSession(String(uuid))
      .then((session) => {
        if (!cancelled) {
          setLoad(session.status === 'concluida' ? { kind: 'ready', session } : { kind: 'open' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoad({ kind: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workoutApi, uuid, attempt]);

  const retry = () => {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };
  const home = () => router.replace('/');

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('resumo.carregando')}
        </Text>
      </Screen>
    );
  }
  if (load.kind === 'error' || load.kind === 'open') {
    return (
      <Screen>
        <Notice kind={load.kind === 'open' ? 'warning' : 'error'} message={t(load.kind === 'open' ? 'resumo.naoConcluido' : 'resumo.erro')} />
        <Button label={t('treino.tentarDeNovo')} onPress={retry} />
        <Button label={t('resumo.voltar')} variant="text" onPress={home} />
      </Screen>
    );
  }

  const summary = summarize(load.session);

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('resumo.titulo')}
      </Text>

      <View style={{ gap: theme.space[1], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
        {summary.minutes !== null ? <Text>{t('resumo.duracao', { minutos: summary.minutes })}</Text> : null}
        <Text>{t('resumo.series', { feitas: summary.seriesDone, total: summary.seriesTotal })}</Text>
        <Text>{t('resumo.exercicios', { quantidade: summary.exercisesDone })}</Text>
        {summary.volumeKg > 0 ? (
          <>
            <Text>{t('resumo.volume', { volume: formatVolume(summary.volumeKg) })}</Text>
            <Text variant="caption" color="secondary">
              {t('resumo.volumeExplicacao')}
            </Text>
          </>
        ) : null}
      </View>

      <Button label={details ? t('resumo.ocultarRegistros') : t('resumo.verRegistros')} variant="secondary" onPress={() => setDetails((v) => !v)} />
      {details ? (
        <View style={{ gap: theme.space[3] }}>
          {summary.exercises.map((exercise) => (
            <View key={exercise.id} style={{ gap: theme.space[0] }}>
              <Text variant="bodyStrong">{exercise.nome}</Text>
              {exercise.sets.map((set) => (
                <Text key={set.ordem} variant="bodySmall" color="secondary">
                  {setText(set)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <Button label={t('resumo.voltar')} onPress={home} />
    </Screen>
  );
}
