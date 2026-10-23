import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Notice } from '@/design-system/Notice';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

export type ExerciseOption = {
  id: string;
  nome: string;
  modalidade?: string;
  equipamento?: { nome: string } | null;
};

type Props<T extends ExerciseOption> = {
  search: (query: string) => Promise<T[]>;
  onSelect: (exercise: T) => void;
  /** Exercício que está sendo adicionado agora (bloqueia novos toques até terminar). */
  busyId?: string | null;
  /** Falha vinda de quem usa (ex.: não conseguiu adicionar). */
  failed?: boolean;
  /** Se informado, cada item ganha um botão para ver a explicação do exercício antes de escolher. */
  onDetails?: (exercise: T) => void;
};

/** Busca no catálogo por nome (com pequena espera após digitar) e lista tocável. Compartilhada pelo treino e pelo editor. */
export function ExerciseSearch<T extends ExerciseOption>({ search, onSelect, busyId = null, failed = false, onDetails }: Props<T>) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await search(query);
        if (!cancelled) {
          setResults(found);
          setSearchFailed(false);
        }
      } catch {
        if (!cancelled) {
          setSearchFailed(true);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const hasError = failed || searchFailed;

  return (
    <View style={{ gap: theme.space[2] }}>
      <TextField label={t('picker.busca')} hint={t('picker.buscaDica')} value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
      {hasError ? <Notice kind="error" message={t('picker.erro')} /> : null}
      {!hasError && results.length === 0 ? (
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('picker.vazio')}
        </Text>
      ) : null}
      <View style={{ gap: theme.space[1] }}>
        {results.map((exercise) => (
          <View key={exercise.id} style={{ flexDirection: 'row', alignItems: 'stretch', gap: theme.space[1] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={exercise.nome}
              accessibilityState={{ busy: busyId === exercise.id, disabled: busyId !== null }}
              disabled={busyId !== null}
              onPress={() => onSelect(exercise)}
              style={{ flex: 1, minHeight: theme.size.touchPreferred, justifyContent: 'center', padding: theme.space[2], borderRadius: theme.radius.md, backgroundColor: theme.colors.bg.surface }}
            >
              <Text variant="bodyStrong">{exercise.nome}</Text>
              <Text variant="caption" color="secondary">
                {busyId === exercise.id ? t('picker.adicionando') : (exercise.equipamento?.nome ?? '')}
              </Text>
            </Pressable>
            {onDetails ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('picker.detalhesDe', { nome: exercise.nome })}
                onPress={() => onDetails(exercise)}
                style={{ minWidth: theme.size.touchPreferred, minHeight: theme.size.touchPreferred, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.space[2], borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border.subtle }}
              >
                <Text variant="bodySmall">{t('picker.detalhes')}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
