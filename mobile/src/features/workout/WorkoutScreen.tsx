import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { ConfirmDialog } from '@/design-system/ConfirmDialog';
import { EmptyState } from '@/design-system/EmptyState';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { SetColumnsHeader, SetRow } from '@/design-system/SetRow';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { ErrorState, LoadingState } from '@/design-system/States';
import { SyncBanner } from '@/features/shell/SyncBanner';
import { t } from '@/i18n';

import { RestTimerCard } from '../rest/RestTimerCard';
import { useRestTimer } from '../rest/useRestTimer';

import { formatDecimal } from './input';
import { lastTimeSummary, targetSummary } from './prefill';
import { useWorkout, type ItemView, type RowView } from './useWorkout';
import type { WorkoutApi } from './workoutApi';

function summaryOf(item: ItemView, row: RowView): string {
  if (item.modality === 'tempo') {
    return t('treino.resumoTempo', { segundos: row.draft.duracao || '0' });
  }
  const reps = row.draft.reps || '0';
  if (row.draft.carga === '') {
    return t(item.unilateral ? 'treino.resumoRepsLado' : 'treino.resumoReps', { reps });
  }
  return t(item.unilateral ? 'treino.resumoCargaRepsLado' : 'treino.resumoCargaReps', { carga: row.draft.carga, unidade: item.loadUnit, reps });
}

/** TEL-012: executor. Um exercício por vez, séries com valores sugeridos que só viram registro ao concluir (D-14). */
export function WorkoutScreen({ api }: { api?: WorkoutApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const workout = useWorkout(String(uuid), api);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const rest = useRestTimer();
  const [autoRest, setAutoRest] = useState(true);

  // Ao voltar do seletor de exercícios, recarrega a sessão (o exercício novo aparece).
  const first = useRef(true);
  const { reload } = workout;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );

  const addExercise = () => router.push({ pathname: '/treino/[uuid]/exercicios', params: { uuid: String(uuid) } });

  if (workout.status === 'loading') {
    return (
      <Screen>
        <LoadingState message={t('treino.carregando')} />
      </Screen>
    );
  }
  if (workout.status === 'error') {
    return (
      <Screen>
        <ErrorState kind="error" message={t('treino.erroCarregar')} onRetry={workout.reload} primary />
      </Screen>
    );
  }

  const current = workout.items[workout.index];
  const pending = workout.totals.total - workout.totals.done;
  // A última série que pode sair: pendente, ou extra. Uma série da prescrição já realizada fica (use Corrigir).
  const removablePosition = current ? current.rows.map((row) => !(row.done && row.series.serie_prescrita_id != null)).lastIndexOf(true) : -1;
  const removable = current && removablePosition >= 0 ? current.rows[removablePosition] : undefined;
  const removableNumber = removablePosition + 1;

  /** Concluir uma série nova inicia o descanso (se estiver habilitado); corrigir uma série não reinicia. */
  async function completeAndRest(seriesId: string) {
    const outcome = await workout.complete(seriesId);
    if (outcome === 'new' && autoRest) {
      rest.start();
    }
  }

  async function confirmDiscard() {
    if (await workout.discard()) {
      rest.skip();
      setDiscarding(false);
      router.replace('/');
    } else {
      setDiscarding(false);
    }
  }

  async function confirmFinish() {
    if (await workout.finish()) {
      rest.skip();
      setConfirming(false);
      router.replace({ pathname: '/treino/[uuid]/resumo', params: { uuid: String(uuid) } });
    } else {
      setConfirming(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: theme.space[0] }}>
        <Text variant="caption" color="secondary">
          {workout.session?.titulo ?? t('treino.avulso')}
        </Text>
        <Text variant="bodySmall" color="secondary" accessibilityLiveRegion="polite">
          {t('treino.progresso', { feitas: workout.totals.done, total: workout.totals.total })}
        </Text>
      </View>
      <SyncBanner compact />

      {workout.notice ? <Notice kind="error" message={workout.notice} /> : null}

      {current === undefined ? (
        <EmptyState title={t('vazio.treinoTitulo')} message={t('vazio.treinoTexto')} actionLabel={t('picker.titulo')} onAction={addExercise} />
      ) : (
        <>
          <View style={{ gap: theme.space[0] }}>
            <Text variant="caption" color="secondary">
              {t('treino.posicao', { atual: workout.index + 1, total: workout.items.length })}
            </Text>
            <Text variant="headline" accessibilityRole="header">
              {current.item.exercicio.nome}
            </Text>
            {current.caption ? (
              <Text variant="bodySmall" color="secondary">
                {current.caption}
              </Text>
            ) : null}
            <Goal modality={current.modality} targets={current.workTargets} />
            <Button variant="text" label={t('treino.comoFazer')} onPress={() => router.push({ pathname: '/exercicios/[uuid]', params: { uuid: current.item.exercicio.id } })} />
            <LastTime modality={current.modality} record={current.last} />
          </View>

          <View style={{ gap: theme.space[2] }}>
            <SetColumnsHeader modality={current.modality} loadUnit={current.loadUnit} perSide={current.unilateral} />
            {current.rows.map((row, position) => (
              <SetRow
                key={row.series.id}
                numero={position + 1}
                exercicio={current.item.exercicio.nome}
                modality={current.modality}
                extra={row.series.serie_prescrita_id == null && current.item.tipo_item === 'prescrito'}
                carga={row.draft.carga}
                reps={row.draft.reps}
                duracao={row.draft.duracao}
                prefilled={row.prefilled}
                done={row.done}
                saving={row.saving}
                errors={row.errors}
                summary={summaryOf(current, row)}
                loadUnit={current.loadUnit}
                perSide={current.unilateral}
                onChange={(field, value) => workout.change(row.series.id, field, value)}
                onComplete={() => void completeAndRest(row.series.id)}
                onCorrect={() => workout.correct(row.series.id)}
              />
            ))}
          </View>

          <RestTimerCard
            state={rest.state}
            remainingMs={rest.remainingMs}
            progress={rest.progress}
            stepSeconds={rest.step}
            autoStart={autoRest}
            onAutoStartChange={setAutoRest}
            onStart={() => rest.start()}
            onPause={rest.pause}
            onResume={rest.resume}
            onSkip={rest.skip}
            onAdjust={rest.adjust}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button variant="text" label={t('treino.maisSerie')} onPress={() => void workout.addSeries(current.item.id)} />
            {removable ? <Button variant="text" label={t('treino.removerSerie')} onPress={() => (removable.done ? setRemoving(true) : void workout.removeSeries(current.item.id, removable.series.id))} /> : null}
            <Button variant="text" label={t('treino.adicionarExercicio')} onPress={addExercise} />
          </View>
          <Button
            variant="text"
            label={t('treino.substituir')}
            onPress={() => router.push({ pathname: '/treino/[uuid]/substituir', params: { uuid: String(uuid), itemId: current.item.id } })}
          />

          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('treino.anterior')} variant="secondary" disabled={workout.index === 0} onPress={() => workout.setIndex(workout.index - 1)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('treino.proximo')} variant="secondary" disabled={workout.index >= workout.items.length - 1} onPress={() => workout.setIndex(workout.index + 1)} />
            </View>
          </View>
        </>
      )}

      {workout.paused ? <Notice kind="info" message={t('treino.pausado')} /> : null}
      <Button label={t(workout.paused ? 'treino.retomar' : 'treino.pausar')} variant={workout.paused ? 'primary' : 'secondary'} onPress={() => void workout.togglePause()} />
      <Button label={t('treino.finalizar')} onPress={() => setConfirming(true)} />
      <Button label={t('treino.descartar')} variant="text" onPress={() => setDiscarding(true)} />

      <ConfirmDialog
        visible={discarding}
        title={t('treino.descartarTitulo')}
        message={t('treino.descartarTexto')}
        confirmLabel={t('treino.descartarConfirma')}
        destructive
        loading={workout.finishing}
        onCancel={() => setDiscarding(false)}
        onConfirm={() => void confirmDiscard()}
      />

      <ConfirmDialog
        visible={removing}
        title={t('treino.removerSerieTitulo')}
        message={t('treino.removerSerieTexto', { numero: removableNumber })}
        confirmLabel={t('treino.removerSerieConfirma')}
        destructive
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          setRemoving(false);
          if (current && removable) {
            void workout.removeSeries(current.item.id, removable.series.id);
          }
        }}
      />

      <ConfirmDialog
        visible={confirming}
        title={t('treino.finalizarTitulo')}
        message={pending > 0 ? t('treino.finalizarPendentes', { pendentes: pending }) : t('treino.finalizarSemPendentes')}
        confirmLabel={t('treino.finalizarConfirma')}
        loading={workout.finishing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmFinish()}
      />
    </Screen>
  );
}

/** "Meta: 8–12 repetições · 60 kg" quando o treino veio de uma ficha e as séries de trabalho têm a mesma meta. */
function Goal({ modality, targets }: { modality: Parameters<typeof targetSummary>[0]; targets: Parameters<typeof targetSummary>[1] }) {
  const summary = targetSummary(modality, targets);
  if (!summary) {
    return null;
  }
  const text = summary.kind === 'time' ? t('treino.metaTempo', { segundos: summary.range }) : summary.load === null ? t('treino.meta', { faixa: summary.range }) : t('treino.metaComCarga', { faixa: summary.range, carga: summary.load });
  return (
    <Text variant="bodySmall" color="secondary">
      {text}
    </Text>
  );
}

function LastTime({ modality, record }: { modality: Parameters<typeof lastTimeSummary>[0]; record: Parameters<typeof lastTimeSummary>[1] }) {
  const summary = lastTimeSummary(modality, record);
  if (!summary) {
    return null;
  }
  const text = summary.load === null ? t('treino.ultimaVezSemCarga', { reps: summary.values }) : t('treino.ultimaVez', { carga: formatDecimal(Number(summary.load.replace(',', '.'))), reps: summary.values });
  return (
    <Text variant="bodySmall" color="secondary">
      {text}
    </Text>
  );
}
