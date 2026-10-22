import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { createWorkoutApi, type ExerciseSummary, type WorkoutApi } from './workoutApi';

const DEFAULT_SERIES = 3;

/** Escolha de exercício do catálogo para o treino em andamento: busca por nome e já cria 3 séries para preencher. */
export function ExercisePickerScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const workoutApi = useMemo(() => api ?? createWorkoutApi(auth.api), [api, auth.api]);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExerciseSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Busca com pequena espera depois da digitação, para não chamar a API a cada tecla.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await workoutApi.searchExercises(query);
        if (!cancelled) {
          setResults(found);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, workoutApi]);

  async function add(exercise: ExerciseSummary) {
    if (adding !== null) {
      return;
    }
    setAdding(exercise.id);
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
      <TextField label={t('picker.busca')} hint={t('picker.buscaDica')} value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
      {failed ? <Notice kind="error" message={t('picker.erro')} /> : null}
      {!failed && results.length === 0 ? (
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('picker.vazio')}
        </Text>
      ) : null}
      <View style={{ gap: theme.space[1] }}>
        {results.map((exercise) => (
          <Pressable
            key={exercise.id}
            accessibilityRole="button"
            accessibilityLabel={exercise.nome}
            accessibilityState={{ busy: adding === exercise.id, disabled: adding !== null }}
            disabled={adding !== null}
            onPress={() => void add(exercise)}
            style={{ minHeight: theme.size.touchPreferred, justifyContent: 'center', padding: theme.space[2], borderRadius: theme.radius.md, backgroundColor: theme.colors.bg.surface }}
          >
            <Text variant="bodyStrong">{exercise.nome}</Text>
            <Text variant="caption" color="secondary">
              {adding === exercise.id ? t('picker.adicionando') : (exercise.equipamento?.nome ?? '')}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
