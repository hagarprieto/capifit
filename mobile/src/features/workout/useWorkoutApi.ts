import { useMemo } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useLocalData } from '@/data/LocalDataProvider';

import { createWorkoutApi, type WorkoutApi } from './workoutApi';

/**
 * A API do treino que as telas usam: a injetada (testes), a "local primeiro" quando o banco do aparelho está aberto, ou
 * a online pura. Todas têm a mesma interface, então a tela não sabe qual está usando.
 */
export function useWorkoutApi(injected?: WorkoutApi): WorkoutApi {
  const { api } = useAuth();
  const { workout } = useLocalData();
  return useMemo(() => injected ?? workout ?? createWorkoutApi(api), [injected, workout, api]);
}
