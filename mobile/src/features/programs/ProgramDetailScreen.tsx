import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { OriginBadge } from '@/design-system/OriginBadge';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { createProgramsApi, type Program, type ProgramVersion, type ProgramsApi } from './programsApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; program: Program; version: ProgramVersion | null };

/** Detalhe somente leitura do programa (versão vigente ou, se ainda não publicado, o rascunho). A edição é a E06-04. */
export function ProgramDetailScreen({ api }: { api?: ProgramsApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const program = await programsApi.get(String(uuid));
        const number = program.versao_atual ?? program.versao_rascunho ?? null;
        const version = number === null ? null : await programsApi.version(program.id, number);
        if (!cancelled) {
          setLoad({ kind: 'ready', program, version });
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
        <Button label={t('treino.tentarDeNovo')} onPress={() => { setLoad({ kind: 'loading' }); setAttempt((n) => n + 1); }} />
        <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { program, version } = load;
  const fichas = version?.fichas ?? [];

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

      <Button label={t('programas.voltar')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
