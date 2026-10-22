import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { CheckField } from '@/design-system/CheckField';
import { Notice } from '@/design-system/Notice';
import { NumberField } from '@/design-system/NumberField';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { formatDecimal, formatWhole, parseDecimal, parseWhole } from '@/features/workout/input';
import { t } from '@/i18n';

import { itemSummary } from './FichaEditorScreen';
import { LIMITS, applyConfig, configOf, validateConfig, type ConfigErrors, type EditorItem, type ItemConfig } from './model';
import { useProgramEditor } from './ProgramEditorProvider';

type Form = { workSets: number; warmup: boolean; repsMin: string; repsMax: string; load: string; rir: string; seconds: string; rest: string; notes: string };

const toForm = (config: ItemConfig): Form => ({
  workSets: config.workSets,
  warmup: config.warmup,
  repsMin: formatWhole(config.repsMin),
  repsMax: formatWhole(config.repsMax),
  load: formatDecimal(config.loadKg),
  rir: formatWhole(config.rir),
  seconds: formatWhole(config.durationSeconds),
  rest: formatWhole(config.restSeconds),
  notes: config.notes,
});

/** Texto vazio é "não informado" (null); texto que não é número vira NaN para a validação recusar. */
const whole = (text: string, max: number): number | null => (text.trim() === '' ? null : (parseWhole(text, max) ?? Number.NaN));
const decimal = (text: string): number | null => (text.trim() === '' ? null : (parseDecimal(text) ?? Number.NaN));

function toConfig(form: Form): ItemConfig {
  return {
    workSets: form.workSets,
    warmup: form.warmup,
    repsMin: whole(form.repsMin, LIMITS.reps + 1),
    repsMax: whole(form.repsMax, LIMITS.reps + 1),
    loadKg: decimal(form.load),
    rir: whole(form.rir, LIMITS.rir + 1),
    durationSeconds: whole(form.seconds, LIMITS.seconds + 1),
    restSeconds: whole(form.rest, LIMITS.rest + 1),
    notes: form.notes,
  };
}

function ConfigForm({ item, onApply, onCancel }: { item: EditorItem; onApply: (config: ItemConfig) => void; onCancel: () => void }) {
  const { theme } = useTheme();
  const [form, setForm] = useState<Form>(() => toForm(configOf(item)));
  const [errors, setErrors] = useState<ConfigErrors>({});
  const timed = item.exercise.modalidade === 'tempo';
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  function apply() {
    const config = toConfig(form);
    const found = validateConfig(item.exercise, config);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onApply(config);
    }
  }

  const total = form.workSets + (form.warmup ? 1 : 0);
  const preview = itemSummary(applyConfig(item, toConfig(form)));
  const row = { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] } as const;
  const error = (key: keyof ConfigErrors) => (errors[key] ? <Text variant="bodySmall" style={{ color: theme.colors.feedback.error }}>{t('campo.erro', { mensagem: t(errors[key]) })}</Text> : null);

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('editor.config.titulo')}
      </Text>
      <Text variant="title">{item.exercise.nome}</Text>
      <Text variant="bodySmall" color="secondary">
        {t('editor.config.dica')}
      </Text>

      <View style={{ gap: theme.space[1] }}>
        <Text variant="bodyStrong">{t('editor.config.series')}</Text>
        <View style={row}>
          <View style={{ flex: 1 }}>
            <Button label={t('editor.config.menos')} variant="secondary" disabled={form.workSets <= 1} onPress={() => set('workSets', form.workSets - 1)} />
          </View>
          <Text variant="numeric" accessibilityLiveRegion="polite" accessibilityLabel={`${t('editor.config.series')}: ${form.workSets}`}>
            {String(form.workSets)}
          </Text>
          <View style={{ flex: 1 }}>
            <Button label={t('editor.config.mais')} variant="secondary" disabled={total >= LIMITS.seriesPerItem} onPress={() => set('workSets', form.workSets + 1)} />
          </View>
        </View>
        {error('workSets')}
      </View>
      <CheckField label={t('editor.config.aquecimento')} checked={form.warmup} onChange={(value) => set('warmup', value)} />

      {timed ? (
        <View style={{ gap: theme.space[1] }}>
          <Text variant="bodySmall" color="secondary">
            {t('editor.config.tempo')}
          </Text>
          <NumberField label={t('editor.config.tempo')} value={form.seconds} onChangeText={(v) => set('seconds', v)} invalid={Boolean(errors.duration)} />
          {error('duration')}
        </View>
      ) : (
        <>
          <View style={{ gap: theme.space[1] }}>
            <View style={row}>
              <View style={{ gap: theme.space[0] }}>
                <Text variant="bodySmall" color="secondary">
                  {t('editor.config.repsMin')}
                </Text>
                <NumberField label={t('editor.config.repsMin')} value={form.repsMin} onChangeText={(v) => set('repsMin', v)} invalid={Boolean(errors.reps)} />
              </View>
              <View style={{ gap: theme.space[0] }}>
                <Text variant="bodySmall" color="secondary">
                  {t('editor.config.repsMax')}
                </Text>
                <NumberField label={t('editor.config.repsMax')} value={form.repsMax} onChangeText={(v) => set('repsMax', v)} invalid={Boolean(errors.reps)} />
              </View>
            </View>
            {error('reps')}
          </View>
          <View style={{ gap: theme.space[1] }}>
            <Text variant="bodySmall" color="secondary">
              {t('editor.config.carga')}
            </Text>
            <NumberField label={t('editor.config.carga')} value={form.load} onChangeText={(v) => set('load', v)} kind="decimal" invalid={Boolean(errors.load)} />
            {error('load')}
          </View>
          <View style={{ gap: theme.space[1] }}>
            <Text variant="bodySmall" color="secondary">
              {t('editor.config.rir')}
            </Text>
            <NumberField label={t('editor.config.rir')} value={form.rir} onChangeText={(v) => set('rir', v)} invalid={Boolean(errors.rir)} />
            {error('rir')}
          </View>
        </>
      )}

      <View style={{ gap: theme.space[1] }}>
        <Text variant="bodySmall" color="secondary">
          {t('editor.config.descanso')}
        </Text>
        <NumberField label={t('editor.config.descanso')} value={form.rest} onChangeText={(v) => set('rest', v)} invalid={Boolean(errors.rest)} />
        {error('rest')}
      </View>

      <TextField label={t('editor.config.notas')} value={form.notes} onChangeText={(v) => set('notes', v)} error={errors.notes ? t(errors.notes) : null} multiline maxLength={LIMITS.notes + 1} autoCapitalize="sentences" />

      <Notice kind="info" message={t('editor.config.previa', { resumo: preview })} />
      <Button label={t('editor.config.aplicar')} onPress={apply} />
      <Button label={t('dialogo.cancelar')} variant="text" onPress={onCancel} />
    </Screen>
  );
}

/** TEL-023: séries, repetições, carga-alvo, RIR, descanso e observações de UM exercício da ficha. Aplica ao rascunho em memória. */
export function ItemConfigScreen() {
  const router = useRouter();
  const editor = useProgramEditor();
  const { fichaKey, itemKey } = useLocalSearchParams<{ fichaKey: string; itemKey: string }>();
  const item = editor.editor.fichas.find((f) => f.key === fichaKey)?.items.find((i) => i.key === itemKey);

  if (!item) {
    return (
      <Screen>
        <Notice kind="warning" message={t('editor.ficha.naoEncontrada')} />
        <Button label={t('programas.voltar')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <ConfigForm
      item={item}
      onCancel={() => router.back()}
      onApply={(config) => {
        editor.dispatch({ type: 'configureItem', fichaKey: String(fichaKey), itemKey: String(itemKey), config });
        router.back();
      }}
    />
  );
}
