import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/design-system/Button';
import { ConfirmDialog } from '@/design-system/ConfirmDialog';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { prescriptionSummary, type EditorItem } from './model';
import { useProgramEditor } from './ProgramEditorProvider';

/** Resumo legível da prescrição: "3 × 8–12 + aquecimento · descanso 1:30". */
export function itemSummary(item: EditorItem): string {
  const s = prescriptionSummary(item);
  let text = s.kind === 'none' ? t('editor.resumo.semSeries') : s.kind === 'time' ? t('editor.resumo.tempo', { series: s.sets, segundos: s.range }) : t('editor.resumo.reps', { series: s.sets, faixa: s.range });
  if (s.warmup && s.kind !== 'none') {
    text = t('editor.resumo.aquecimento', { resumo: text });
  }
  if (item.restSeconds !== null) {
    const minutes = Math.floor(item.restSeconds / 60);
    const seconds = String(item.restSeconds % 60).padStart(2, '0');
    text = `${text} · ${t('editor.resumo.descanso', { tempo: `${minutes}:${seconds}` })}`;
  }
  return text;
}

/** TEL-022: sequência de exercícios da ficha (nome, ordem, remover) e acesso à configuração de cada um. */
export function FichaEditorScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const editor = useProgramEditor();
  const { uuid, fichaKey } = useLocalSearchParams<{ uuid: string; fichaKey: string }>();
  const ficha = editor.editor.fichas.find((f) => f.key === fichaKey);
  const [removing, setRemoving] = useState<{ key: string; nome: string } | null>(null);

  if (!ficha) {
    return (
      <Screen>
        <Notice kind="warning" message={t('editor.ficha.naoEncontrada')} />
        <Button label={t('programas.voltar')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('editor.ficha.titulo')}
      </Text>
      {editor.notice ? <Notice kind="error" message={t(editor.notice)} /> : null}
      <TextField label={t('editor.ficha.campoNome')} value={ficha.titulo} onChangeText={(titulo) => editor.dispatch({ type: 'renameFicha', fichaKey: ficha.key, titulo })} maxLength={160} autoCapitalize="sentences" />

      {ficha.items.length === 0 ? <Text color="secondary">{t('editor.ficha.semExercicios')}</Text> : null}
      <View style={{ gap: theme.space[2] }}>
        {ficha.items.map((item, index) => (
          <View key={item.key} style={{ gap: theme.space[1], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
            <Text variant="title">{item.exercise.nome}</Text>
            <Text variant="bodySmall" color="secondary">
              {itemSummary(item)}
            </Text>
            <Button
              label={t('editor.ficha.configurar')}
              accessibilityLabel={t('editor.ficha.configurarA11y', { nome: item.exercise.nome })}
              onPress={() => router.push({ pathname: '/programas/[uuid]/editar/ficha/[fichaKey]/exercicio/[itemKey]', params: { uuid: String(uuid), fichaKey: ficha.key, itemKey: item.key } })}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button variant="text" label={t('editor.subir')} accessibilityLabel={t('editor.subirA11y', { nome: item.exercise.nome })} disabled={index === 0} onPress={() => editor.dispatch({ type: 'moveItem', fichaKey: ficha.key, itemKey: item.key, direction: -1 })} />
              <Button variant="text" label={t('editor.descer')} accessibilityLabel={t('editor.descerA11y', { nome: item.exercise.nome })} disabled={index === ficha.items.length - 1} onPress={() => editor.dispatch({ type: 'moveItem', fichaKey: ficha.key, itemKey: item.key, direction: 1 })} />
              <Button variant="text" label={t('editor.remover')} accessibilityLabel={t('editor.removerA11y', { nome: item.exercise.nome })} onPress={() => setRemoving({ key: item.key, nome: item.exercise.nome })} />
            </View>
          </View>
        ))}
      </View>

      <Button label={t('editor.ficha.adicionarExercicio')} variant="secondary" onPress={() => router.push({ pathname: '/programas/[uuid]/editar/ficha/[fichaKey]/adicionar', params: { uuid: String(uuid), fichaKey: ficha.key } })} />
      <Button label={t('programas.voltar')} onPress={() => router.back()} />

      <ConfirmDialog
        visible={removing !== null}
        destructive
        title={t('editor.removerItemTitulo')}
        message={t('editor.removerItemTexto', { nome: removing?.nome ?? '' })}
        confirmLabel={t('editor.removerConfirma')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            editor.dispatch({ type: 'removeItem', fichaKey: ficha.key, itemKey: removing.key });
          }
          setRemoving(null);
        }}
      />
    </Screen>
  );
}
