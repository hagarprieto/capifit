import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { ConfirmDialog } from '@/design-system/ConfirmDialog';
import { Notice } from '@/design-system/Notice';
import { OriginBadge } from '@/design-system/OriginBadge';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t, type MessageKey } from '@/i18n';

import { createProgramsApi, type ActiveProgram, type Program, type ProgramVersion, type ProgramsApi } from './programsApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; program: Program; version: ProgramVersion | null; active: ActiveProgram | null };
type Dialog = 'activate' | 'archive' | null;

/**
 * Detalhe do programa (versão vigente ou, se ainda não publicado, o rascunho) com as ações do ciclo de vida:
 * editar, ativar (ou trocar o programa em uso) e arquivar (FL-07). Ativar e arquivar nunca mexem em treinos já feitos
 * (AC-07). Programa do coach não se edita; arquivado não tem ações.
 */
export function ProgramDetailScreen({ api }: { api?: ProgramsApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: MessageKey } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [program, active] = await Promise.all([programsApi.get(String(uuid)), programsApi.active()]);
        const number = program.versao_atual ?? program.versao_rascunho ?? null;
        const version = number === null ? null : await programsApi.version(program.id, number);
        if (!cancelled) {
          setLoad({ kind: 'ready', program, version, active });
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
  }, [programsApi, uuid, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('programas.carregando')}
        </Text>
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Notice kind="error" message={t('programas.erroDetalhe')} />
        <Button label={t('treino.tentarDeNovo')} onPress={() => { setLoad({ kind: 'loading' }); refresh(); }} />
        <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { program, version, active } = load;
  const fichas = version?.fichas ?? [];
  const isActive = active?.programa.id === program.id;
  const otherActive = active && !isActive ? active.programa : null;
  const canEdit = program.origem !== 'coach' && program.status !== 'arquivado';
  const canActivate = program.status === 'publicado' && program.versao_atual != null && !isActive;
  const canArchive = program.status !== 'arquivado';

  async function run(action: () => Promise<void>, success: MessageKey | null, after?: () => void) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setDialog(null);
      if (success) {
        setFeedback({ kind: 'success', message: success });
      }
      after?.();
    } catch (error) {
      setDialog(null);
      setFeedback({ kind: 'error', message: isApiError(error) && error.isNetwork ? 'auth.erro.rede' : 'programas.erroAcao' });
    } finally {
      setBusy(false);
    }
  }

  const activate = () =>
    run(
      async () => {
        await programsApi.activate(program.id, program.versao_atual as number);
      },
      'programas.ativadoOk',
      refresh,
    );
  const archive = () =>
    run(
      async () => {
        await programsApi.archive(program.id);
      },
      null,
      () => router.replace('/programas'),
    );

  return (
    <Screen>
      <OriginBadge origin={program.origem} authorName={program.autor.nome} />
      <Text variant="headline" accessibilityRole="header">
        {program.titulo}
      </Text>
      {program.objetivo ? <Text color="secondary">{program.objetivo}</Text> : null}
      <Text variant="bodySmall" color="secondary">
        {version ? t('programas.versaoEstado', { numero: version.numero, estado: t(version.estado === 'rascunho' ? 'programas.estadoRascunho' : 'programas.estadoPublicada') }) : ''}
      </Text>

      {isActive ? <Notice kind="success" message={t('programas.emUsoAviso')} /> : null}
      {program.status === 'arquivado' ? <Notice kind="info" message={t('programas.arquivadoAviso')} /> : null}
      {feedback ? <Notice kind={feedback.kind === 'success' ? 'success' : 'error'} message={t(feedback.message)} /> : null}

      {fichas.length === 0 ? (
        <Text color="secondary">{t('programas.semFichas')}</Text>
      ) : (
        <View style={{ gap: theme.space[2] }}>
          {fichas.map((ficha) => (
            <View key={ficha.id} style={{ gap: theme.space[0], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
              <Text variant="title">{ficha.titulo}</Text>
              {ficha.exercicios.map((item) => (
                <Text key={item.id} variant="bodySmall" color="secondary">
                  {t('programas.exercicioSeries', { nome: item.exercicio.nome, series: item.series.length })}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {canActivate ? <Button label={otherActive ? t('programas.trocarPara') : t('programas.ativar')} onPress={() => (otherActive ? setDialog('activate') : void activate())} loading={busy && dialog === null} /> : null}
      {program.status === 'rascunho' ? (
        <Text variant="bodySmall" color="secondary">
          {t('programas.publiqueParaAtivar')}
        </Text>
      ) : null}
      {canEdit ? <Button label={t('programas.editar')} variant={canActivate ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/programas/[uuid]/editar', params: { uuid: program.id } })} /> : null}
      {canArchive ? <Button label={t('programas.arquivar')} variant="secondary" onPress={() => setDialog('archive')} /> : null}
      <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />

      <ConfirmDialog
        visible={dialog === 'activate'}
        title={t('programas.trocarTitulo')}
        message={t('programas.trocarTexto', { atual: otherActive?.titulo ?? '' })}
        confirmLabel={t('programas.trocarConfirma')}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => void activate()}
      />
      <ConfirmDialog
        visible={dialog === 'archive'}
        destructive
        title={t('programas.arquivarTitulo')}
        message={t(isActive ? 'programas.arquivarTextoAtivo' : 'programas.arquivarTexto')}
        confirmLabel={t('programas.arquivarConfirma')}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => void archive()}
      />
    </Screen>
  );
}
