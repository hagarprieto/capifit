import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { loadActiveWithCache } from '@/data/cache/todayWorkout';
import { useLocalData } from '@/data/LocalDataProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { OriginBadge } from '@/design-system/OriginBadge';
import { Screen } from '@/design-system/Screen';
import { StatTile, WeekStrip } from '@/design-system/StatusAndStats';
import { SyncBanner } from '@/features/shell/SyncBanner';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { ErrorState, LoadingState, OfflineState } from '@/design-system/States';
import { createProgramsApi, type ActiveProgram, type ProgramsApi } from '@/features/programs/programsApi';
import { useWorkoutApi } from '@/features/workout/useWorkoutApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';
import { t } from '@/i18n';

import { formatDuration, formatShortDate, nextFicha, weekDays, weekStats, type SessionSummary } from './home';

type Data = { open: SessionSummary | null; active: ActiveProgram | null; completed: SessionSummary[]; failed: boolean; savedAt: string | null };

/**
 * TEL-010: Início. Mostra, por prioridade, o treino em andamento, a próxima ficha do programa ativo ou o convite para
 * criar um programa; embaixo, a semana (segunda a domingo) e a última sessão. Cada bloco carrega por conta própria: se
 * um deles falhar, os outros aparecem e o aviso oferece tentar de novo; o treino avulso continua à mão.
 */
export function HomeScreen({ api, programsApi: programsOverride, now }: { api?: WorkoutApi; programsApi?: ProgramsApi; now?: Date }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const { user } = auth;
  const workoutApi = useWorkoutApi(api);
  const programsApi = useMemo(() => programsOverride ?? createProgramsApi(auth.api), [programsOverride, auth.api]);
  const { ready, today } = useLocalData();
  const [data, setData] = useState<Data | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState<'ficha' | 'avulso' | null>(null);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(() => {
    if (!ready) {
      return; // espera o banco local abrir (rápido) para já ler o programa salvo se estiver sem rede
    }
    let cancelled = false;
    Promise.allSettled([workoutApi.openSessionSummary(), loadActiveWithCache({ programsApi, workoutApi, today }), workoutApi.recentCompleted()]).then(([open, active, completed]) => {
      if (!cancelled) {
        setData({
          open: open.status === 'fulfilled' ? open.value : null,
          active: active.status === 'fulfilled' ? active.value.active : null,
          completed: completed.status === 'fulfilled' ? completed.value : [],
          failed: [open, active, completed].some((r) => r.status === 'rejected'),
          savedAt: active.status === 'fulfilled' && active.value.fromCache ? active.value.savedAt : null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workoutApi, programsApi, today, ready, attempt]);

  // Ao voltar de outra tela (treino concluído, programa ativado…), atualiza sem piscar o carregamento.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setAttempt((n) => n + 1);
    }, []),
  );

  const clock = now ?? new Date();
  const open = data?.open ?? null;
  const active = data?.active ?? null;
  const completed = data?.completed ?? [];
  const next = active ? nextFicha(active.versao.fichas, active.programa.id, completed) : null;
  const stats = weekStats(completed, clock);
  const last = completed[0];
  const openWorkout = (sessionUuid: string) => router.push({ pathname: '/treino/[uuid]', params: { uuid: sessionUuid } });

  async function start(kind: 'ficha' | 'avulso') {
    setStarting(kind);
    setStartFailed(false);
    try {
      openWorkout(kind === 'ficha' && next ? await workoutApi.startProgrammedWorkout(next.id) : await workoutApi.startFreeWorkout());
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(null);
    }
  }

  const card = { gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface } as const;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">{t('app.nome')}</Text>
      </View>
      <Text variant="headline" accessibilityRole="header">
        {t('inicio.saudacao', { nome: user?.nome ?? '' })}
      </Text>

      <SyncBanner />
      {data?.failed ? (
        <>
          <ErrorState kind="warning" message={t('inicio.erroResumo')} onRetry={() => { setData(null); setAttempt((n) => n + 1); }} />
        </>
      ) : null}
      {data?.savedAt ? <OfflineState message={t('inicio.dadosSalvos', { data: formatShortDate(data.savedAt) })} /> : null}
      {startFailed ? <Notice kind="error" message={t('home.erroIniciar')} /> : null}

      {data === null ? (
        <LoadingState message={t('inicio.carregando')} />
      ) : open ? (
        <View style={card}>
          <Text variant="caption" color="secondary">
            {t('inicio.emAndamento')}
          </Text>
          <Text variant="title">{open.titulo ?? t('treino.avulso')}</Text>
          {open.series_total ? (
            <Text variant="bodySmall" color="secondary">
              {t('inicio.progressoSeries', { feitas: open.series_realizadas ?? 0, total: open.series_total })}
            </Text>
          ) : null}
          <Button label={t('inicio.continuar')} onPress={() => openWorkout(open.id)} />
        </View>
      ) : active ? (
        <View style={card}>
          <Text variant="caption" color="secondary">
            {t('inicio.programaAtivo')}
          </Text>
          <OriginBadge origin={active.programa.origem} authorName={active.programa.autor.nome} />
          <Text variant="title">{active.programa.titulo}</Text>
          {next ? (
            <>
              <Text>{t('inicio.proximaFicha', { ficha: next.titulo })}</Text>
              <Text variant="bodySmall" color="secondary">
                {next.exercicios.length === 1 ? t('editor.exercicioUm') : t('editor.exerciciosVarios', { quantidade: next.exercicios.length })}
              </Text>
              <Button label={t('inicio.iniciarFicha', { ficha: next.titulo })} onPress={() => void start('ficha')} loading={starting === 'ficha'} />
              <Button
                label={t('inicio.verFicha')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/programas/[uuid]/ficha/[fichaId]', params: { uuid: active.programa.id, fichaId: next.id } })}
              />
            </>
          ) : (
            <>
              <Text color="secondary">{t('inicio.programaSemFicha')}</Text>
              <Button label={t('inicio.verPrograma')} onPress={() => router.push({ pathname: '/programas/[uuid]', params: { uuid: active.programa.id } })} />
            </>
          )}
        </View>
      ) : (
        <View style={card}>
          <Text variant="title">{t('inicio.semProgramaTitulo')}</Text>
          <Text color="secondary">{t('inicio.semProgramaTexto')}</Text>
          <Button label={t('inicio.criarPrograma')} onPress={() => router.push('/programas/novo')} />
        </View>
      )}

      {data !== null && !open ? <Button label={t('home.iniciarAvulso')} variant="secondary" onPress={() => void start('avulso')} loading={starting === 'avulso'} /> : null}

      <View style={{ gap: theme.space[2] }}>
        <Text variant="title" accessibilityRole="header">
          {t('inicio.semana')}
        </Text>
        <WeekStrip days={weekDays(clock, completed)} />
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <StatTile value={String(stats.count)} label={t('inicio.treinosSemana')} spoken={t('inicio.treinosSemanaFalado', { quantidade: stats.count })} />
          <StatTile value={formatDuration(stats.activeSeconds)} label={t('inicio.tempoSemana')} spoken={t('inicio.tempoSemanaFalado', { tempo: formatDuration(stats.activeSeconds) })} />
        </View>
        {data !== null ? (
          <Text variant="bodySmall" color="secondary">
            {last ? t('inicio.ultima', { data: formatShortDate(last.encerrada_em ?? last.iniciada_em), duracao: formatDuration(last.duracao_ativa_segundos ?? 0) }) : t('inicio.nenhumaSessao')}
          </Text>
        ) : null}
      </View>

    </Screen>
  );
}
