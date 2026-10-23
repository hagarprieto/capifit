import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { ExerciseSearch } from '@/features/exercises/ExerciseSearch';
import { t } from '@/i18n';

import { useWorkoutApi } from './useWorkoutApi';
import type { ExerciseSummary, WorkoutApi } from './workoutApi';

const DEFAULT_SERIES = 3;

/** Escolha de exercício do catálogo para o treino em andamento: já cria 3 séries para preencher. */
export function ExercisePickerScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const workoutApi = useWorkoutApi(api);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [adding, setAdding] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function add(exercise: ExerciseSummary) {
    if (adding !== null) {
      return;
    }
    setAdding(exercise.id);
    setFailed(false);
    try {
      const item = await workoutApi.addExercise(String(uuid), exercise.id);
      for (let n = 0; n < DEFAULT_SERIES; n += 1) {
        await workoutApi.addSeries(String(uuid), item.id);
      }
      router.back();
    } catch {
      setFailed(true);
      setAdding(null);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('picker.titulo')}
      </Text>
      <ExerciseSearch search={workoutApi.searchExercises} onSelect={(exercise) => void add(exercise)} busyId={adding} failed={failed} />
    </Screen>
  );
}
