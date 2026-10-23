import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t, type MessageKey } from '@/i18n';

import { demoOf, instructionSteps, musclesOf } from './demo';
import { createExercisesApi, type ExerciseDetail, type ExercisesApi, type ExerciseSummary } from './exercisesApi';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; detail: ExerciseDetail; alternatives: ExerciseSummary[] };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * TEL-025: detalhe do exercício. A demonstração só aparece se houver mídia APROVADA; sem ela (ou se a imagem não carregar)
 * a tela segue com as instruções em texto, sem erro (UX-10, AC-10). O registro do treino nunca depende da mídia.
 */
export function ExerciseDetailScreen({ api }: { api?: ExercisesApi }) {
  const router = useRouter();
  const { theme } = useTheme();
  const auth = useAuth();
  const exercises = useMemo(() => api ?? createExercisesApi(auth.api), [api, auth.api]);
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = String(uuid);
    Promise.all([exercises.get(id), exercises.alternatives(id).catch(() => [] as ExerciseSummary[])])
      .then(([detail, alternatives]) => !cancelled && setLoad({ kind: 'ready', detail, alternatives }))
      .catch(() => !cancelled && setLoad({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [exercises, uuid, attempt]);

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('exercicio.carregando')}
        </Text>
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Notice kind="error" message={t('exercicio.erro')} />
        <Button
          label={t('treino.tentarDeNovo')}
          onPress={() => {
            setLoad({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
        <Button label={t('revisao.voltar')} variant="text" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { detail, alternatives } = load;
  const demo = demoOf(detail.midias);
  const muscles = musclesOf(detail);
  const steps = instructionSteps(detail.instrucoes);
  const tags = [
    detail.equipamento?.nome,
    t(`modalidade.${detail.modalidade}` as MessageKey),
    detail.dificuldade ? t(`dificuldade.${detail.dificuldade}` as MessageKey) : null,
    detail.unilateral ? t('exercicio.unilateral') : null,
  ].filter(Boolean);

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {detail.nome}
      </Text>
      <Text color="secondary">{tags.join(' · ')}</Text>

      <Section title={t('exercicio.demonstracao')}>
        {demo.kind === 'image' && !imageFailed ? (
          <>
            <Image
              source={{ uri: demo.url }}
              accessibilityLabel={t('exercicio.demoImagem', { nome: detail.nome })}
              onError={() => setImageFailed(true)}
              resizeMode="contain"
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}
            />
            <Text variant="caption" color="secondary">
              {t('exercicio.demoRevisada', { versao: demo.version })}
            </Text>
          </>
        ) : demo.kind === 'video' ? (
          <Notice kind="info" message={t('exercicio.demoVideoBreve')} />
        ) : (
          <Notice kind="info" message={t(demo.kind === 'image' ? 'exercicio.demoFalhou' : 'exercicio.demoIndisponivel')} />
        )}
      </Section>

      <Section title={t('exercicio.comoFazer')}>
        {steps.length > 0 ? (
          steps.map((step, index) => (
            <Text key={index} accessibilityLabel={t('exercicio.passo', { numero: index + 1, texto: step })}>
              {`${index + 1}. ${step}`}
            </Text>
          ))
        ) : (
          <Text color="secondary">{t('exercicio.semInstrucoes')}</Text>
        )}
      </Section>

      {detail.observacoes_seguranca ? (
        <Section title={t('exercicio.cuidados')}>
          <Notice kind="warning" message={detail.observacoes_seguranca} />
        </Section>
      ) : null}

      {muscles.primary.length + muscles.secondary.length > 0 ? (
        <Section title={t('exercicio.musculos')}>
          {muscles.primary.length > 0 ? <Text>{t('exercicio.principais', { lista: muscles.primary.join(', ') })}</Text> : null}
          {muscles.secondary.length > 0 ? <Text color="secondary">{t('exercicio.secundarios', { lista: muscles.secondary.join(', ') })}</Text> : null}
        </Section>
      ) : null}

      <Section title={t('exercicio.alternativas')}>
        {alternatives.length === 0 ? (
          <Text color="secondary">{t('exercicio.semAlternativas')}</Text>
        ) : (
          alternatives.map((alternative) => (
            <Pressable
              key={alternative.id}
              accessibilityRole="button"
              accessibilityLabel={alternative.nome}
              onPress={() => router.push({ pathname: '/exercicios/[uuid]', params: { uuid: alternative.id } })}
              style={{ minHeight: theme.size.touchPreferred, justifyContent: 'center', padding: theme.space[2], borderRadius: theme.radius.md, backgroundColor: theme.colors.bg.surface }}
            >
              <Text variant="bodyStrong">{alternative.nome}</Text>
              <Text variant="caption" color="secondary">
                {alternative.equipamento?.nome ?? ''}
              </Text>
            </Pressable>
          ))
        )}
      </Section>
    </Screen>
  );
}
