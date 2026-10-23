import { useRouter } from 'expo-router';
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

import { useProgramEditor } from './ProgramEditorProvider';

/** "22/10 14:05" no horário do aparelho. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** TEL-021: nome, objetivo e a lista de fichas (ordem, duplicar, remover). Salvar rascunho e publicar a versão. */
export function ProgramEditorScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const editor = useProgramEditor();
  const [leaving, setLeaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState<{ key: string; nome: string } | null>(null);

  const programId = editor.program?.id;
  const back = () => router.replace(programId ? { pathname: '/programas/[uuid]', params: { uuid: programId } } : '/programas');
  const leave = () => (editor.dirty ? setLeaving(true) : back());

  if (editor.status === 'loading') {
    return (
      <Screen>
        <Text color="secondary" accessibilityLiveRegion="polite">
          {t('editor.carregando')}
        </Text>
      </Screen>
    );
  }
  if (editor.status === 'error') {
    return (
      <Screen>
        <Notice kind="error" message={t('editor.erroCarregar')} />
        <Button label={t('treino.tentarDeNovo')} onPress={editor.reload} />
        <Button label={t('programas.voltar')} variant="text" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (editor.status === 'blocked') {
    return (
      <Screen>
        <Notice kind="warning" message={t(editor.program?.status === 'arquivado' ? 'editor.bloqueadoArquivado' : 'editor.bloqueadoCoach')} />
        <Button label={t('programas.voltar')} onPress={() => router.back()} />
      </Screen>
    );
  }

  async function publish() {
    setPublishing(false);
    if (await editor.publish()) {
      back();
    }
  }

  const { fichas } = editor.editor;

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('editor.titulo')}
      </Text>
      <Text variant="bodySmall" color="secondary" accessibilityLiveRegion="polite">
        {t(editor.dirty ? (editor.canKeepDraft ? 'editor.naoSalvoGuardado' : 'editor.naoSalvo') : 'editor.salvo')}
      </Text>

      {editor.restore?.kind === 'restored' ? (
        <>
          <Notice kind="info" message={t('editor.rascunhoRestaurado', { data: stamp(editor.restore.savedAt) })} />
          <Button label={t('editor.rascunhoDescartar')} variant="text" onPress={() => setDiscarding(true)} />
        </>
      ) : null}
      {editor.restore?.kind === 'stale' ? (
        <View style={{ gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
          <Text variant="title" accessibilityRole="header">
            {t('editor.rascunhoAntigoTitulo')}
          </Text>
          <Notice kind="warning" message={t('editor.rascunhoAntigoTexto', { data: stamp(editor.restore.draft.savedAt) })} />
          <Button label={t('editor.rascunhoUsar')} variant="secondary" onPress={editor.applyStaleDraft} />
          <Button label={t('editor.rascunhoIgnorar')} variant="text" onPress={() => void editor.dropStaleDraft()} />
        </View>
      ) : null}

      {editor.notice ? (
        <>
          <Notice kind="error" message={t(editor.notice)} />
          {editor.notice === 'editor.erro.conflito' ? <Button label={t('editor.recarregar')} variant="secondary" onPress={editor.reload} /> : null}
        </>
      ) : null}

      <TextField label={t('programas.campoTitulo')} value={editor.meta.titulo} onChangeText={(titulo) => editor.setMeta({ ...editor.meta, titulo })} maxLength={180} autoCapitalize="sentences" />
      <TextField label={t('programas.campoObjetivo')} value={editor.meta.objetivo} onChangeText={(objetivo) => editor.setMeta({ ...editor.meta, objetivo })} maxLength={100} autoCapitalize="sentences" />

      <Text variant="title" accessibilityRole="header">
        {t('editor.fichas')}
      </Text>
      {fichas.length === 0 ? <Text color="secondary">{t('editor.semFichas')}</Text> : null}
      <View style={{ gap: theme.space[2] }}>
        {fichas.map((ficha, index) => (
          <View key={ficha.key} style={{ gap: theme.space[1], padding: theme.space[2], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
            <Text variant="title">{ficha.titulo}</Text>
            <Text variant="bodySmall" color="secondary">
              {ficha.items.length === 1 ? t('editor.exercicioUm') : t('editor.exerciciosVarios', { quantidade: ficha.items.length })}
            </Text>
            <Button
              label={t('editor.editarFicha')}
              accessibilityLabel={t('editor.editarFichaA11y', { nome: ficha.titulo })}
              onPress={() => router.push({ pathname: '/programas/[uuid]/editar/ficha/[fichaKey]', params: { uuid: programId ?? '', fichaKey: ficha.key } })}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Button variant="text" label={t('editor.subir')} accessibilityLabel={t('editor.subirA11y', { nome: ficha.titulo })} disabled={index === 0} onPress={() => editor.dispatch({ type: 'moveFicha', fichaKey: ficha.key, direction: -1 })} />
              <Button variant="text" label={t('editor.descer')} accessibilityLabel={t('editor.descerA11y', { nome: ficha.titulo })} disabled={index === fichas.length - 1} onPress={() => editor.dispatch({ type: 'moveFicha', fichaKey: ficha.key, direction: 1 })} />
              <Button variant="text" label={t('editor.duplicar')} accessibilityLabel={t('editor.duplicarA11y', { nome: ficha.titulo })} onPress={() => editor.dispatch({ type: 'duplicateFicha', fichaKey: ficha.key })} />
              <Button variant="text" label={t('editor.remover')} accessibilityLabel={t('editor.removerA11y', { nome: ficha.titulo })} onPress={() => setRemoving({ key: ficha.key, nome: ficha.titulo })} />
            </View>
          </View>
        ))}
      </View>

      <Button label={t('editor.adicionarFicha')} variant="secondary" onPress={() => editor.dispatch({ type: 'addFicha' })} />
      <Button label={t('editor.salvar')} onPress={() => void editor.save()} loading={editor.saving} disabled={!editor.dirty} />
      {editor.dirty && editor.canKeepDraft && editor.restore?.kind !== 'restored' ? <Button label={t('editor.rascunhoDescartar')} variant="text" onPress={() => setDiscarding(true)} /> : null}
      <Button label={t('editor.publicar')} variant="secondary" onPress={() => setPublishing(true)} disabled={editor.saving} />
      <Button label={t('programas.voltar')} variant="text" onPress={leave} />

      {editor.canKeepDraft ? (
        <ConfirmDialog visible={leaving} title={t('editor.sairGuardaTitulo')} message={t('editor.sairGuardaTexto')} confirmLabel={t('editor.sairGuardaConfirma')} onCancel={() => setLeaving(false)} onConfirm={() => { setLeaving(false); back(); }} />
      ) : (
        <ConfirmDialog visible={leaving} destructive title={t('editor.sairTitulo')} message={t('editor.sairTexto')} confirmLabel={t('editor.sairConfirma')} onCancel={() => setLeaving(false)} onConfirm={() => { setLeaving(false); back(); }} />
      )}
      <ConfirmDialog
        visible={discarding}
        destructive
        title={t('editor.descartarTitulo')}
        message={t('editor.descartarTexto')}
        confirmLabel={t('editor.descartarConfirma')}
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false);
          void editor.discardChanges();
        }}
      />
      <ConfirmDialog
        visible={removing !== null}
        destructive
        title={t('editor.removerFichaTitulo')}
        message={t('editor.removerFichaTexto', { nome: removing?.nome ?? '' })}
        confirmLabel={t('editor.removerConfirma')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            editor.dispatch({ type: 'removeFicha', fichaKey: removing.key });
          }
          setRemoving(null);
        }}
      />
      <ConfirmDialog visible={publishing} title={t('editor.publicarTitulo')} message={t('editor.publicarTexto')} confirmLabel={t('editor.publicarConfirma')} loading={editor.saving} onCancel={() => setPublishing(false)} onConfirm={() => void publish()} />
    </Screen>
  );
}
