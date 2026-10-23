import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { createExercisesApi, type ExercisesApi, type ExerciseSummary, type Taxonomy } from './exercisesApi';

type Result = { key: string; items: ExerciseSummary[]; next: string | null } | { key: string; error: true };

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: theme.size.touchMin.android,
        justifyContent: 'center',
        paddingHorizontal: theme.space[3],
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brand.primary : theme.colors.border.subtle,
        backgroundColor: selected ? theme.colors.bg.elevated : 'transparent',
      }}
    >
      <Text variant="bodySmall" style={{ fontWeight: selected ? '700' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Filter({ title, items, selected, onSelect }: { title: string; items: Taxonomy[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const { theme } = useTheme();
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="caption" color="secondary">
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[1] }}>
        <Chip label={t('biblioteca.todos')} selected={selected === null} onPress={() => onSelect(null)} />
        {items.map((item) => (
          <Chip key={item.id} label={item.nome} selected={selected === item.id} onPress={() => onSelect(selected === item.id ? null : item.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * TEL-024: biblioteca de exercícios. Busca por nome, filtro por grupo muscular e por equipamento, lista paginada e
 * entrada no detalhe. É só leitura: o catálogo vem do servidor (só exercícios publicados).
 */
export function LibraryScreen({ api }: { api?: ExercisesApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const exercises = useMemo(() => api ?? createExercisesApi(auth.api), [api, auth.api]);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Taxonomy[]>([]);
  const [equipment, setEquipment] = useState<Taxonomy[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([query, groupId, equipmentId, attempt]);

  // A busca espera um pouco depois de digitar para não consultar a cada letra.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    let cancelled = false;
    exercises.muscleGroups().then((list) => !cancelled && setGroups(list)).catch(() => undefined);
    exercises.equipment().then((list) => !cancelled && setEquipment(list)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [exercises]);

  useEffect(() => {
    let cancelled = false;
    exercises
      .list({ query, groupId, equipmentId })
      .then((page) => !cancelled && setResult({ key, items: page.items, next: page.next }))
      .catch(() => !cancelled && setResult({ key, error: true }));
    return () => {
      cancelled = true;
    };
  }, [exercises, query, groupId, equipmentId, key]);

  const current = result && result.key === key ? result : null;
  const loading = current === null;
  const filtered = query !== '' || groupId !== null || equipmentId !== null;

  async function loadMore() {
    if (!current || 'error' in current || !current.next) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await exercises.list({ query, groupId, equipmentId, cursor: current.next });
      setResult({ key, items: [...current.items, ...page.items], next: page.next });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function clear() {
    setTyped('');
    setQuery('');
    setGroupId(null);
    setEquipmentId(null);
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('biblioteca.titulo')}
      </Text>
      <TextField label={t('picker.busca')} hint={t('picker.buscaDica')} value={typed} onChangeText={setTyped} autoCapitalize="none" returnKeyType="search" />
      <Filter title={t('biblioteca.grupo')} items={groups} selected={groupId} onSelect={setGroupId} />
      <Filter title={t('biblioteca.equipamento')} items={equipment} selected={equipmentId} onSelect={setEquipmentId} />

      {loading ? (
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('biblioteca.carregando')}
        </Text>
      ) : 'error' in current ? (
        <>
          <Notice kind="error" message={t('biblioteca.erro')} />
          <Button label={t('treino.tentarDeNovo')} variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
        </>
      ) : current.items.length === 0 ? (
        <View style={{ gap: theme.space[2] }} accessibilityLiveRegion="polite">
          <Text variant="title">{t('biblioteca.vazioTitulo')}</Text>
          <Text color="secondary">{t(filtered ? 'biblioteca.vazioFiltrado' : 'biblioteca.vazioTexto')}</Text>
          {filtered ? <Button label={t('biblioteca.limpar')} variant="secondary" onPress={clear} /> : null}
        </View>
      ) : (
        <View style={{ gap: theme.space[1] }}>
          {current.items.map((exercise) => {
            const details = [exercise.equipamento?.nome, ...(exercise.grupos_primarios ?? []).map((g) => g.nome)].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={exercise.id}
                accessibilityRole="button"
                accessibilityLabel={`${exercise.nome}. ${details}`}
                accessibilityHint={t('biblioteca.abrirDica')}
                onPress={() => router.push({ pathname: '/exercicios/[uuid]', params: { uuid: exercise.id } })}
                style={{ minHeight: theme.size.touchPreferred, justifyContent: 'center', padding: theme.space[2], borderRadius: theme.radius.md, backgroundColor: theme.colors.bg.surface }}
              >
                <Text variant="bodyStrong">{exercise.nome}</Text>
                <Text variant="caption" color="secondary">
                  {details}
                </Text>
              </Pressable>
            );
          })}
          {moreFailed ? <Notice kind="warning" message={t('biblioteca.erroMais')} /> : null}
          {current.next ? <Button label={t('evolucao.carregarMais')} variant="secondary" onPress={() => void loadMore()} loading={loadingMore} /> : null}
        </View>
      )}
    </Screen>
  );
}
