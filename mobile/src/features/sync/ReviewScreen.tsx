import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocalData, useSyncStatus } from '@/data/LocalDataProvider';
import type { Review, ReviewGroup, ReviewItem, SeriesView } from '@/data/sync/review';
import { Button } from '@/design-system/Button';
import { ConfirmDialog } from '@/design-system/ConfirmDialog';
import { EmptyState } from '@/design-system/EmptyState';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { LoadingState } from '@/design-system/States';
import { formatShortDate } from '@/features/home/home';
import { t, type MessageKey } from '@/i18n';

type Confirm = { kind: 'item'; operacaoUuid: string } | { kind: 'session'; sessionUuid: string } | null;

function valuesText(view: SeriesView): string {
  if (view.carga_kg !== null && view.repeticoes !== null) {
    return t('revisao.valorCargaReps', { carga: view.carga_kg, reps: view.repeticoes });
  }
  if (view.repeticoes !== null) {
    return t('revisao.valorReps', { reps: view.repeticoes });
  }
  if (view.duracao_segundos !== null) {
    return t('revisao.valorTempo', { segundos: view.duracao_segundos });
  }
  return t('revisao.valorVazio');
}

function itemTitle(item: ReviewItem): string {
  const { entidade, tipo } = item.op;
  if (entidade === 'sessao_serie') {
    return tipo === 'criar' ? t('revisao.opSerieExtra') : (item.exercise ?? t('revisao.opSerie'));
  }
  if (entidade === 'sessao_treino') {
    return t(tipo === 'criar' ? 'revisao.opCriarTreino' : tipo === 'concluir' ? 'revisao.opConcluirTreino' : 'revisao.opOutro');
  }
  return t('revisao.opOutro');
}

/**
 * TEL-050: revisão do que o servidor não aceitou. Mostra cada registro com o motivo e, num conflito de série, os dois
 * lados lado a lado. Nada é descartado sem confirmação, e o texto diz o efeito de cada escolha.
 */
export function ReviewScreen({ review: injected }: { review?: Review }) {
  const router = useRouter();
  const { theme } = useTheme();
  const local = useLocalData();
  const review = injected ?? local.review;
  const { review: waitingReview } = useSyncStatus();
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const [tick, setTick] = useState(0);

  // Relê ao abrir, depois de cada escolha e sempre que a quantidade em revisão muda (um reenvio pode resolver ou
  // trazer outra recusa).
  useEffect(() => {
    if (!review) {
      return;
    }
    let cancelled = false;
    review
      .list()
      .then((next) => {
        if (!cancelled) {
          setGroups(next);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setGroups((current) => current ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [review, waitingReview, tick]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setTick((n) => n + 1);
    }
  }

  async function confirmed() {
    const pending = confirm;
    setConfirm(null);
    if (!review || !pending) {
      return;
    }
    await run(() => (pending.kind === 'item' ? review.discard(pending.operacaoUuid) : review.discardSession(pending.sessionUuid)));
  }

  const shown = review ? groups : [];

  const card = { gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface } as const;

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('revisao.titulo')}
      </Text>
      {failed ? <Notice kind="warning" message={t('revisao.erro')} /> : null}

      {shown === null ? (
        <LoadingState message={t('revisao.carregando')} />
      ) : shown.length === 0 ? (
        <EmptyState title={t('revisao.vazioTitulo')} message={t('revisao.vazioTexto')} actionLabel={t('revisao.voltar')} onAction={() => router.back()} />
      ) : (
        <>
          <Text color="secondary">{t('revisao.intro')}</Text>
          {shown.map((group) => (
            <View key={group.sessionUuid ?? 'sem-treino'} style={{ gap: theme.space[2] }}>
              {group.startedAt ? (
                <Text variant="title" accessibilityRole="header">
                  {t('revisao.grupo', { titulo: group.title ?? t('treino.avulso'), data: formatShortDate(group.startedAt) })}
                </Text>
              ) : null}

              {group.items.map((item) => (
                <View key={item.op.operacao_uuid} style={card}>
                  <Text variant="title">{itemTitle(item)}</Text>
                  <Text color="secondary">{t(`revisao.motivo.${item.reason}` as MessageKey)}</Text>
                  {item.mine ? <Text>{t('revisao.meu', { valores: valuesText(item.mine) })}</Text> : null}
                  {item.server ? <Text>{t('revisao.servidor', { valores: valuesText(item.server) })}</Text> : null}

                  {item.canKeepMine ? <Button label={t('revisao.manter')} disabled={busy} onPress={() => void run(() => review!.keepMine(item.op.operacao_uuid))} /> : null}
                  {item.server ? <Button label={t('revisao.usarServidor')} variant="secondary" disabled={busy} onPress={() => void run(() => review!.useServer(item.op.operacao_uuid))} /> : null}
                  {item.canResend ? <Button label={t('revisao.tentar')} variant="secondary" disabled={busy} onPress={() => void run(() => review!.resend(item.op.operacao_uuid))} /> : null}
                  <Button label={t('revisao.descartar')} variant="text" disabled={busy} onPress={() => setConfirm({ kind: 'item', operacaoUuid: item.op.operacao_uuid })} />
                </View>
              ))}

              {group.sessionUuid ? (
                <Button label={t('revisao.descartarTreino')} variant="text" disabled={busy} onPress={() => setConfirm({ kind: 'session', sessionUuid: group.sessionUuid as string })} />
              ) : null}
            </View>
          ))}
        </>
      )}

      <ConfirmDialog
        visible={confirm !== null}
        title={t(confirm?.kind === 'session' ? 'revisao.confirmaTreinoTitulo' : 'revisao.confirmaTitulo')}
        message={t(confirm?.kind === 'session' ? 'revisao.confirmaTreinoTexto' : 'revisao.confirmaTexto')}
        confirmLabel={t('revisao.descartar')}
        destructive
        onConfirm={() => void confirmed()}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}
