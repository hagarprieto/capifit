import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { createExercisesApi } from '@/features/exercises/exercisesApi';
import { ExerciseSearch } from '@/features/exercises/ExerciseSearch';
import { t } from '@/i18n';

import type { Modality } from './model';
import { useProgramEditor } from './ProgramEditorProvider';

/** Escolhe um exercício do catálogo e o põe no fim da ficha (3 séries de 8–12, que se ajustam depois em "Configurar"). */
export function AddExerciseToFichaScreen() {
  const router = useRouter();
  const auth = useAuth();
  const editor = useProgramEditor();
  const exercises = useMemo(() => createExercisesApi(auth.api), [auth.api]);
  const { fichaKey } = useLocalSearchParams<{ fichaKey: string }>();

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('editor.ficha.adicionarTitulo')}
      </Text>
      <ExerciseSearch
        search={exercises.search}
        onDetails={(exercise) => router.push({ pathname: '/exercicios/[uuid]', params: { uuid: exercise.id } })}
        onSelect={(exercise) => {
          editor.dispatch({ type: 'addItem', fichaKey: String(fichaKey), exercise: { id: exercise.id, nome: exercise.nome, modalidade: (exercise.modalidade ?? 'reps_carga') as Modality } });
          router.back();
        }}
      />
    </Screen>
  );
}
