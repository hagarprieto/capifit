import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { ExerciseSearch } from '@/features/exercises/ExerciseSearch';
import { t } from '@/i18n';

import { useWorkoutApi } from './useWorkoutApi';
import type { ExerciseSummary, WorkoutApi } from './workoutApi';

/**
 * Trocar o exercício no meio do treino (ex.: aparelho ocupado). O que já foi registrado fica no exercício original; as
 * séries que faltam passam para o novo, que entra logo depois. Funciona também sem rede quando o treino já está no
 * aparelho (a escolha do exercício, porém, usa a busca do catálogo, que precisa de conexão).
 */
export function SubstituteExerciseScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const workoutApi = useWorkoutApi(api);
  const { uuid, itemId } = useLocalSearchParams<{ uuid: string; itemId: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function replace(exercise: ExerciseSummary) {
    if (busy !== null) {
      return;
    }
    setBusy(exercise.id);
    setFailed(false);
    try {
      await workoutApi.replaceExercise(String(uuid), String(itemId), exercise);
      router.back();
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('substituir.titulo')}
      </Text>
      <Text color="secondary">{t('substituir.explicacao')}</Text>
      <ExerciseSearch
        search={workoutApi.searchExercises}
        onSelect={(exercise) => void replace(exercise)}
        busyId={busy}
        failed={failed}
        onDetails={(exercise) => router.push({ pathname: '/exercicios/[uuid]', params: { uuid: exercise.id } })}
      />
    </Screen>
  );
}
