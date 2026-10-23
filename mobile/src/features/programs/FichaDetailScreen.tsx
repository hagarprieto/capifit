import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { isApiError } from '@/api/errors';
import type { Schemas } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { OriginBadge } from '@/design-system/OriginBadge';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { createWorkoutApi, type WorkoutApi } from '@/features/workout/workoutApi';
import { t } from '@/i18n';

import { itemSummary } from './editor/FichaEditorScreen';
import { fromVersion, type EditorFicha } from './editor/model';
import { createProgramsApi, type Program, type ProgramsApi } from './programsApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; program: Program; ficha: EditorFicha; open: Schemas['SessaoResumo'] | null };

/**
 * TEL-011: detalhe de UMA ficha da versão publicada, com os exercícios e a prescrição, e o botão de iniciar ou continuar.
 * O servidor aceita um treino aberto por vez: se já há um da própria ficha, o botão é "Continuar"; se é de outra
 * origem (avulso ou outra ficha), a tela avisa e só oferece continuar o que está aberto.
 */
export function FichaDetailScreen({ api, workoutApi: workoutOverride }: { api?: ProgramsApi; workoutApi?: WorkoutApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);
  const workoutApi = useMemo(() => workoutOverride ?? createWorkoutApi(auth.api), [workoutOverride, auth.api]);
  const { uuid, fichaId } = useLocalSearchParams<{ uuid: string; fichaId: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState<'rede' | 'generico' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const program = await programsApi.get(String(uuid));
        const number = program.versao_atual;
        if (number == null) {
          throw new Error('sem versão publicada');
        }
        const [version, open] = await Promise.all([programsApi.version(program.id, number), workoutApi.openSessionSummary().catch(() => null)]);
        const ficha = fromVersion(version).fichas.find((f) => f.key === String(fichaId));
        if (!ficha) {
          throw new Error('ficha não encontrada');
        }
        if (!cancelled) {
          setLoad({ kind: 'ready', program, ficha, open });
        }
      } catch {
        if (!cancelled) {
          setLoad({ kind: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programsApi, workoutApi, uuid, fichaId, attempt]);

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('ficha.carregando')}
        </Text>
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Notice kind="error" message={t('ficha.erroCarregar')} />
        <Button label={t('treino.tentarDeNovo')} onPress={() => { setLoad({ kind: 'loading' }); setAttempt((n) => n + 1); }} />
        <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { program, ficha, open } = load;
  const openIsThisFicha = open?.ficha_id === ficha.key;
  const openWorkout = (sessionUuid: string) => router.push({ pathname: '/treino/[uuid]', params: { uuid: sessionUuid } });

  async function start() {
    setStarting(true);
    setFailed(null);
    try {
      openWorkout(await workoutApi.startProgrammedWorkout(ficha.key));
    } catch (error) {
      setFailed(isApiError(error) && error.isNetwork ? 'rede' : 'generico');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen>
      <OriginBadge origin={program.origem} authorName={program.autor.nome} />
      <Text variant="caption" color="secondary">
        {program.titulo}
      </Text>
      <Text variant="headline" accessibilityRole="header">
        {ficha.titulo}
      </Text>
      <Text variant="bodySmall" color="secondary">
        {ficha.items.length === 1 ? t('editor.exercicioUm') : t('editor.exerciciosVarios', { quantidade: ficha.items.length })}
      </Text>

      {open && !openIsThisFicha ? <Notice kind="warning" message={t('ficha.outroTreinoAberto', { titulo: open.titulo ?? t('treino.avulso') })} /> : null}
      {failed ? <Notice kind="error" message={t(failed === 'rede' ? 'auth.erro.rede' : 'ficha.erroIniciar')} /> : null}

      <View style={{ gap: theme.space[2] }}>
        {ficha.items.map((item, index) => (
          <View key={item.key} style={{ gap: theme.space[0], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
            <Text variant="caption" color="secondary">
              {String(index + 1)}
            </Text>
            <Text variant="title">{item.exercise.nome}</Text>
            <Text variant="bodySmall" color="secondary">
              {itemSummary(item)}
            </Text>
            {item.notes ? <Text variant="bodySmall">{item.notes}</Text> : null}
          </View>
        ))}
      </View>

      {open && openIsThisFicha ? (
        <Button label={t('ficha.continuar')} onPress={() => openWorkout(open.id)} />
      ) : open ? (
        <Button label={t('home.continuar')} onPress={() => openWorkout(open.id)} />
      ) : (
        <Button label={t('ficha.iniciar', { nome: ficha.titulo })} onPress={() => void start()} loading={starting} />
      )}
      <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />
    </Screen>
  );
}
