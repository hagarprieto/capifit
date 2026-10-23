import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { EmptyState } from '@/design-system/EmptyState';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { StatTile } from '@/design-system/StatusAndStats';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { ErrorState, LoadingState } from '@/design-system/States';
import { formatDuration, formatShortDate } from '@/features/home/home';
import { formatVolume } from '@/features/workout/summary';
import { t } from '@/i18n';

import { barRatio, periodRange, weekLabel, type PeriodWeeks } from './progress';
import { createProgressApi, type HistoryItem, type ProgressApi, type ProgressSummary } from './progressApi';

const PERIODS: PeriodWeeks[] = [4, 12];

/**
 * TEL-030/031: Evolução e histórico. Indicadores do período (treinos, tempo, séries, volume) e frequência por semana,
 * sem metas nem comparações; embaixo, a lista de sessões concluídas, que abre o resumo de cada uma. Resumo e histórico
 * carregam e falham separados.
 */
export function ProgressScreen({ api, now }: { api?: ProgressApi; now?: Date }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const progressApi = useMemo(() => api ?? createProgressApi(auth.api), [api, auth.api]);
  const [weeks, setWeeks] = useState<PeriodWeeks>(4);
  const [summary, setSummary] = useState<ProgressSummary | 'error' | null>(null);
  const [history, setHistory] = useState<{ items: HistoryItem[]; next: string | null } | 'error' | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [clock] = useState(() => now ?? new Date());

  useEffect(() => {
    let cancelled = false;
    const { de, ate } = periodRange(weeks, clock);
    progressApi
      .summary(de, ate)
      .then((result) => !cancelled && setSummary(result))
      .catch(() => !cancelled && setSummary('error'));
    return () => {
      cancelled = true;
    };
  }, [progressApi, weeks, attempt, clock]);

  useEffect(() => {
    let cancelled = false;
    progressApi
      .history()
      .then((page) => !cancelled && setHistory(page))
      .catch(() => !cancelled && setHistory('error'));
    return () => {
      cancelled = true;
    };
  }, [progressApi, attempt]);

  // Ao voltar de outra tela (treino concluído, por exemplo), atualiza sem piscar o carregamento.
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

  const retry = () => {
    setSummary(null);
    setHistory(null);
    setAttempt((n) => n + 1);
  };

  async function loadMore() {
    if (history === null || history === 'error' || !history.next) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await progressApi.history(history.next);
      setHistory({ items: [...history.items, ...page.items], next: page.next });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const card = { gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface } as const;
  const stats = summary !== null && summary !== 'error' ? summary : null;
  const maxWeek = stats ? Math.max(0, ...stats.frequencia_semanal.map((w) => w.sessoes)) : 0;

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('aba.evolucao')}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
        {PERIODS.map((value) => (
          <View key={value} style={{ flex: 1 }}>
            <Button
              label={t('evolucao.periodo', { semanas: value })}
              variant={weeks === value ? 'primary' : 'secondary'}
              accessibilityHint={weeks === value ? t('evolucao.periodoAtual') : undefined}
              onPress={() => {
                if (value !== weeks) {
                  setSummary(null);
                  setWeeks(value);
                }
              }}
            />
          </View>
        ))}
      </View>

      {summary === 'error' || history === 'error' ? (
        <>
          <ErrorState kind="warning" message={t('evolucao.erro')} onRetry={retry} />
        </>
      ) : null}

      {summary === null || history === null ? (
        <LoadingState message={t('evolucao.carregando')} />
      ) : null}

      {stats ? (
        <View style={{ gap: theme.space[2] }}>
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <StatTile value={String(stats.sessoes_concluidas)} label={t('evolucao.treinos')} spoken={t('evolucao.treinosFalado', { quantidade: stats.sessoes_concluidas })} />
            <StatTile value={formatDuration(stats.tempo_ativo_segundos)} label={t('evolucao.tempo')} spoken={t('evolucao.tempoFalado', { tempo: formatDuration(stats.tempo_ativo_segundos) })} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <StatTile value={String(stats.series_realizadas)} label={t('evolucao.series')} spoken={t('evolucao.seriesFalado', { quantidade: stats.series_realizadas })} />
            <StatTile value={`${formatVolume(stats.volume_kg)} kg`} label={t('evolucao.volume')} spoken={t('evolucao.volumeFalado', { volume: formatVolume(stats.volume_kg) })} />
          </View>
          <Text variant="caption" color="secondary">
            {t('resumo.volumeExplicacao')}
          </Text>

          <View style={card}>
            <Text variant="title" accessibilityRole="header">
              {t('evolucao.frequencia')}
            </Text>
            {stats.frequencia_semanal.map((week) => (
              <View
                key={week.semana_inicio}
                accessible
                accessibilityLabel={t('evolucao.semanaFalado', { data: weekLabel(week.semana_inicio), quantidade: week.sessoes })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
              >
                <Text variant="caption" color="secondary" style={{ width: theme.space[5] + theme.space[2] }}>
                  {weekLabel(week.semana_inicio)}
                </Text>
                <View style={{ flex: 1, height: theme.space[2], justifyContent: 'center' }}>
                  <View
                    style={{
                      width: `${Math.round(barRatio(week.sessoes, maxWeek) * 100)}%`,
                      height: theme.space[1],
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.brand.primary,
                    }}
                  />
                </View>
                <Text variant="caption" tabular>
                  {week.sessoes}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {history !== null && history !== 'error' ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="title" accessibilityRole="header">
            {t('evolucao.historico')}
          </Text>
          {history.items.length === 0 ? (
            <EmptyState title={t('evolucao.vazioTitulo')} message={t('evolucao.vazioTexto')} />
          ) : (
            history.items.map((item) => {
              const when = formatShortDate(item.encerrada_em ?? item.iniciada_em);
              const name = item.titulo ?? t('treino.avulso');
              const duration = formatDuration(item.duracao_ativa_segundos ?? 0);
              const sets = item.series_realizadas ?? 0;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('evolucao.sessaoFalado', { data: when, nome: name, duracao: duration, series: sets })}
                  onPress={() => router.push({ pathname: '/treino/[uuid]/resumo', params: { uuid: item.id } })}
                  style={{ ...card, minHeight: theme.size.touchMin.android }}
                >
                  <Text variant="title">{name}</Text>
                  <Text variant="bodySmall" color="secondary">
                    {t('evolucao.sessaoLinha', { data: when, duracao: duration, series: sets })}
                  </Text>
                </Pressable>
              );
            })
          )}
          {moreFailed ? <Notice kind="warning" message={t('evolucao.erroMais')} /> : null}
          {history.next ? <Button label={t('evolucao.carregarMais')} variant="secondary" onPress={() => void loadMore()} loading={loadingMore} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
