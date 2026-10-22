import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { createWorkoutApi, type WorkoutApi } from '@/features/workout/workoutApi';
import { t } from '@/i18n';

/** Início provisório da área logada; o TEL-010 (Início com estados) o substitui no marco M2. Já leva ao treino. */
export function HomeScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const auth = useAuth();
  const { user, offline, signOut } = auth;
  const workoutApi = useMemo(() => api ?? createWorkoutApi(auth.api), [api, auth.api]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workoutApi
      .openSession()
      .then((found) => {
        if (!cancelled) {
          setOpenSession(found);
        }
      })
      .catch(() => {
        // sem rede ou erro: o início segue sem o atalho de continuar (o botão de iniciar tenta de novo)
      });
    return () => {
      cancelled = true;
    };
  }, [workoutApi]);

  async function start() {
    setStarting(true);
    setFailed(false);
    try {
      const sessionUuid = await workoutApi.startFreeWorkout();
      router.push({ pathname: '/treino/[uuid]', params: { uuid: sessionUuid } });
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('home.ola', { nome: user?.nome ?? '' })}
      </Text>
      <Text color="secondary">{t('home.texto')}</Text>
      {offline ? <Notice kind="info" message={t('home.offline')} /> : null}
      {failed ? <Notice kind="error" message={t('home.erroIniciar')} /> : null}
      {openSession ? (
        <Button label={t('home.continuar')} onPress={() => router.push({ pathname: '/treino/[uuid]', params: { uuid: openSession } })} />
      ) : (
        <Button label={t('home.iniciarAvulso')} onPress={() => void start()} loading={starting} />
      )}
      <Button label={t('home.verTema')} variant="secondary" onPress={() => router.push('/tema')} />
      <Button label={t('home.sair')} variant="text" onPress={() => void signOut()} />
    </Screen>
  );
}
