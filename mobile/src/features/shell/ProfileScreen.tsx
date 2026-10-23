import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/design-system/Button';
import { ConfirmDialog } from '@/design-system/ConfirmDialog';
import { Notice } from '@/design-system/Notice';
import { Screen } from '@/design-system/Screen';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

import { useLeave } from './useLeave';

/** Aba Perfil: conta e saída. Preferências, privacidade e vínculos entram com as histórias de perfil. */
export function ProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const leave = useLeave();
  const [erasing, setErasing] = useState(false);
  const busy = leave.state.kind === 'sending' || leave.state.kind === 'leaving';

  return (
    <Screen>
      <Text variant="headline" accessibilityRole="header">
        {t('aba.perfil')}
      </Text>
      <Text variant="title">{user?.nome ?? ''}</Text>
      <Button label={t('home.verTema')} variant="secondary" onPress={() => router.push('/tema')} />

      {leave.state.kind === 'blocked' ? (
        <View style={{ gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.colors.bg.surface }}>
          <Text variant="title" accessibilityRole="header">
            {t('sair.titulo')}
          </Text>
          {leave.state.waiting > 0 ? <Notice kind="warning" message={t('sair.pendentes', { quantidade: leave.state.waiting })} /> : null}
          {leave.state.review > 0 ? <Notice kind="warning" message={t('sair.revisao', { quantidade: leave.state.review })} /> : null}
          <Text color="secondary">{t('sair.explicacao')}</Text>
          <Button label={t('sair.tentar')} onPress={() => void leave.attempt()} />
          {leave.state.review > 0 ? <Button label={t('sync.revisar')} variant="secondary" onPress={() => router.push('/sincronizacao')} /> : null}
          <Button label={t('sair.manter')} variant="secondary" onPress={() => void leave.leaveKeeping()} />
          <Button label={t('sair.apagar')} variant="text" onPress={() => setErasing(true)} />
          <Button label={t('sair.cancelar')} variant="text" onPress={leave.cancel} />
        </View>
      ) : (
        <>
          {leave.state.kind === 'sending' ? (
            <Text color="secondary" accessibilityLiveRegion="polite">
              {t('sair.enviando')}
            </Text>
          ) : null}
          <Button label={t('home.sair')} variant="text" disabled={busy} onPress={() => void leave.attempt()} />
        </>
      )}

      <ConfirmDialog
        visible={erasing}
        title={t('sair.apagarTitulo')}
        message={t('sair.apagarTexto')}
        confirmLabel={t('sair.apagarConfirma')}
        destructive
        onConfirm={() => {
          setErasing(false);
          void leave.leaveErasing();
        }}
        onCancel={() => setErasing(false)}
      />
    </Screen>
  );
}
