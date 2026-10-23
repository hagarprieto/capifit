import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { EmptyState } from '@/design-system/EmptyState';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { WorkoutCard } from '@/design-system/WorkoutCard';
import { ErrorState, LoadingState } from '@/design-system/States';
import { t, type MessageKey } from '@/i18n';

import { formatDate, groupPrograms, type ProgramTab } from './grouping';
import { createProgramsApi, type ActiveProgram, type Program, type ProgramsApi } from './programsApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; programs: Program[]; active: ActiveProgram | null };

const TABS: { tab: ProgramTab; label: MessageKey }[] = [
  { tab: 'ativo', label: 'programas.abaAtivo' },
  { tab: 'rascunhos', label: 'programas.abaRascunhos' },
  { tab: 'arquivados', label: 'programas.abaArquivados' },
];

const EMPTY: Record<ProgramTab, { title: MessageKey; message: MessageKey }> = {
  ativo: { title: 'programas.vazioAtivoTitulo', message: 'programas.vazioAtivoTexto' },
  rascunhos: { title: 'programas.vazioRascunhosTitulo', message: 'programas.vazioRascunhosTexto' },
  arquivados: { title: 'programas.vazioArquivadosTitulo', message: 'programas.vazioArquivadosTexto' },
};

function detailOf(program: Program): string {
  const date = formatDate(program.atualizado_em ?? program.criado_em);
  if (program.status === 'publicado' && program.versao_atual != null) {
    return t('programas.detalhePublicado', { versao: program.versao_atual, data: date });
  }
  return t(program.status === 'arquivado' ? 'programas.detalheArquivado' : 'programas.detalheRascunho', { data: date });
}

/** TEL-020: lista de programas por estado (Ativo, Rascunhos, Arquivados), com a origem de cada um sempre visível. */
export function ProgramsScreen({ api }: { api?: ProgramsApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [tab, setTab] = useState<ProgramTab>('ativo');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([programsApi.list(), programsApi.active()])
      .then(([programs, active]) => {
        if (!cancelled) {
          setLoad({ kind: 'ready', programs, active });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoad((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [programsApi, attempt]);

  // Ao voltar de outra tela (ex.: depois de criar um programa), recarrega a lista sem piscar o carregamento.
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

  const create = () => router.push('/programas/novo');
  const open = (id: string) => router.push({ pathname: '/programas/[uuid]', params: { uuid: id } });

  const groups = useMemo(() => (load.kind === 'ready' ? groupPrograms(load.programs, load.active?.programa.id ?? null) : null), [load]);
  const activeTags = load.kind === 'ready' && load.active ? load.active.versao.fichas.map((f) => f.titulo) : [];

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('programas.titulo')}
      </Text>

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: theme.space[1] }}>
        {TABS.map(({ tab: value, label }) => {
          const selected = tab === value;
          const count = groups ? groups[value].length : 0;
          const text = groups ? t('programas.abaComContagem', { nome: t(label), quantidade: count }) : t(label);
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={text}
              accessibilityState={{ selected }}
              onPress={() => setTab(value)}
              style={{
                flex: 1,
                minHeight: theme.size.touchMin.android,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: theme.space[1],
                borderRadius: theme.radius.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? theme.colors.brand.primary : theme.colors.border.strong,
                backgroundColor: selected ? theme.colors.bg.elevated : 'transparent',
              }}
            >
              <Text variant="bodySmall" style={{ fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular', textAlign: 'center' }}>
                {text}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {load.kind === 'loading' ? (
        <LoadingState message={t('programas.carregando')} />
      ) : load.kind === 'error' ? (
        <>
          <ErrorState kind="error" message={t('programas.erro')} onRetry={() => { setLoad({ kind: 'loading' }); setAttempt((n) => n + 1); }} primary />
        </>
      ) : groups && groups[tab].length === 0 ? (
        <EmptyState title={t(EMPTY[tab].title)} message={t(EMPTY[tab].message)} actionLabel={tab === 'arquivados' ? undefined : t('programas.criar')} onAction={create} />
      ) : groups ? (
        <View style={{ gap: theme.space[2] }}>
          {groups[tab].map((program) => {
            const isActive = load.kind === 'ready' && load.active?.programa.id === program.id;
            return (
              <WorkoutCard
                key={program.id}
                title={program.titulo}
                origin={program.origem}
                authorName={program.autor.nome}
                detail={detailOf(program)}
                tags={isActive ? [t('programas.emUso'), ...activeTags] : []}
                onPress={() => open(program.id)}
              />
            );
          })}
        </View>
      ) : null}

      {load.kind === 'ready' && groups && groups[tab].length > 0 ? <Button label={t('programas.criar')} onPress={create} /> : null}
      <Button label={t('biblioteca.abrir')} variant="secondary" onPress={() => router.push('/exercicios')} />
    </Screen>
  );
}
