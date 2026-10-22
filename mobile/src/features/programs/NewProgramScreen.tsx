import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { TextField } from '@/design-system/TextField';
import { t } from '@/i18n';
import { newUuid } from '@/lib/uuid';

import { createProgramsApi, type ProgramsApi } from './programsApi';

/** Cria um programa vazio (rascunho) e abre o detalhe. A mesma chave de idempotência vale nas tentativas desta tela. */
export function NewProgramScreen({ api }: { api?: ProgramsApi }) {
  const router = useRouter();
  const auth = useAuth();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);
  const [key] = useState(() => newUuid());
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [errors, setErrors] = useState<{ titulo?: string; objetivo?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found: { titulo?: string; objetivo?: string } = {};
    if (title.trim().length < 1 || title.trim().length > 180) {
      found.titulo = t('programas.erroTitulo');
    }
    if (objective.trim().length > 100) {
      found.objetivo = t('programas.erroObjetivo');
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      const program = await programsApi.create(title, objective, key);
      router.replace({ pathname: '/programas/[uuid]', params: { uuid: program.id } });
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR' && (error.fields.titulo || error.fields.objetivo)) {
        setErrors({ titulo: error.fields.titulo?.[0], objetivo: error.fields.objetivo?.[0] });
      } else {
        setFormError(t(isApiError(error) && error.isNetwork ? 'auth.erro.rede' : 'programas.erroCriar'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('programas.novoTitulo')}
      </Text>
      {formError ? <Notice kind="error" message={formError} /> : null}
      <TextField label={t('programas.campoTitulo')} value={title} onChangeText={setTitle} error={errors.titulo} maxLength={180} autoCapitalize="sentences" returnKeyType="next" />
      <TextField label={t('programas.campoObjetivo')} hint={t('programas.dicaObjetivo')} value={objective} onChangeText={setObjective} error={errors.objetivo} maxLength={100} autoCapitalize="sentences" returnKeyType="done" onSubmitEditing={submit} />
      <Button label={t('programas.criarBotao')} onPress={submit} loading={busy} />
      <Button label={t('dialogo.cancelar')} variant="text" onPress={() => router.back()} />
    </Screen>
  );
}
