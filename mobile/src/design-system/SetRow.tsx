import { View } from 'react-native';

import { t } from '@/i18n';

import { Button } from './Button';
import { NumberField } from './NumberField';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type SetRowFieldErrors = { carga?: string; reps?: string; duracao?: string };

type Props = {
  numero: number;
  exercicio: string;
  modality: 'reps_carga' | 'reps_peso_corporal' | 'reps_assistido' | 'tempo';
  /** Unidade da carga para o leitor de tela ("kg por halter"); padrão "kg". */
  loadUnit?: string;
  /** Exercício unilateral: as repetições são de cada lado. */
  perSide?: boolean;
  extra?: boolean;
  carga: string;
  reps: string;
  duracao: string;
  /** Valores ainda são sugestão (cor secundária) até o usuário editar ou concluir. */
  prefilled: boolean;
  done: boolean;
  saving: boolean;
  errors: SetRowFieldErrors;
  /** Texto do que será/foi registrado, para leitor de tela ("40 kg, 10 repetições"). */
  summary: string;
  onChange: (field: 'carga' | 'reps' | 'duracao', value: string) => void;
  onComplete: () => void;
  onCorrect: () => void;
};

/** Linha de série do executor (Doc 08 §8): Série · Carga · Reps · Concluir. Concluída: valores fixos e opção de corrigir. */
export function SetRow({ numero, exercicio, modality, loadUnit = 'kg', perSide = false, extra = false, carga, reps, duracao, prefilled, done, saving, errors, summary, onChange, onComplete, onCorrect }: Props) {
  const { theme } = useTheme();
  const { colors, space, radius, size } = theme;
  const params = { numero, exercicio };

  return (
    <View style={{ gap: space[0] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: size.setRow.height }}>
        <View style={{ width: 56 }}>
          <Text variant="bodyStrong">{t('treino.serie', { numero })}</Text>
          {extra ? (
            <Text variant="caption" color="secondary">
              {t('treino.extra')}
            </Text>
          ) : null}
        </View>

        {modality === 'tempo' ? (
          <NumberField label={t('treino.campoTempo', params)} value={duracao} onChangeText={(v) => onChange('duracao', v)} prefilled={prefilled} invalid={Boolean(errors.duracao)} editable={!done} />
        ) : (
          <>
            <NumberField label={t('treino.campoCarga', { ...params, unidade: loadUnit })} value={carga} onChangeText={(v) => onChange('carga', v)} kind="decimal" prefilled={prefilled} invalid={Boolean(errors.carga)} editable={!done} />
            <NumberField label={t(perSide ? 'treino.campoRepsLado' : 'treino.campoReps', params)} value={reps} onChangeText={(v) => onChange('reps', v)} prefilled={prefilled} invalid={Boolean(errors.reps)} editable={!done} />
          </>
        )}

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {done ? (
            <View
              accessible
              accessibilityLabel={t('treino.serieConcluida', { ...params, resumo: summary })}
              style={{ minWidth: size.touchMin.android, minHeight: size.touchMin.android, borderRadius: radius.pill, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="bodyStrong" style={{ color: colors.brand.onPrimary }}>
                {t('campo.marcado')}
              </Text>
            </View>
          ) : (
            <Button
              label={t('treino.concluirSerie')}
              accessibilityLabel={t('treino.concluirSerieA11y', { ...params, resumo: summary })}
              onPress={onComplete}
              loading={saving}
            />
          )}
        </View>
      </View>

      {done ? <Button variant="text" label={t('treino.corrigir')} accessibilityLabel={t('treino.corrigirA11y', params)} onPress={onCorrect} /> : null}
      {[errors.carga, errors.reps, errors.duracao].filter(Boolean).map((message) => (
        <Text key={message} variant="bodySmall" accessibilityLiveRegion="polite" style={{ color: colors.feedback.error }}>
          {t('campo.erro', { mensagem: message as string })}
        </Text>
      ))}
    </View>
  );
}
