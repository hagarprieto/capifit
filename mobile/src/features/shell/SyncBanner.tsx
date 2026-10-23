import { View } from 'react-native';

import { useSyncStatus } from '@/data/LocalDataProvider';
import { Button } from '@/design-system/Button';
import { Notice } from '@/design-system/Notice';
import { SyncStatus } from '@/design-system/StatusAndStats';
import { useTheme } from '@/design-system/ThemeProvider';
import { t } from '@/i18n';

/**
 * O estado de sincronização do app (UX-04): sempre o indicador (ícone + texto, nunca só cor) e, fora do normal, o que
 * isso significa para os dados — sem conexão, registros esperando envio ou rejeitados pelo servidor. `compact` mostra só
 * o indicador (cabeçalhos curtos, como o do executor).
 */
export function SyncBanner({ compact = false }: { compact?: boolean }) {
  const { theme } = useTheme();
  const { state, waiting, review, retry } = useSyncStatus();

  return (
    <View style={{ gap: theme.space[2] }}>
      <SyncStatus state={state} />
      {compact ? null : (
        <>
          {state === 'offline' ? <Notice kind="info" message={t(waiting > 0 ? 'sync.avisoOfflinePendente' : 'sync.avisoOffline', { quantidade: waiting })} /> : null}
          {state === 'pending' ? (
            <>
              <Notice kind="warning" message={t('sync.avisoFalha')} />
              {retry ? <Button label={t('sync.tentar')} variant="secondary" onPress={retry} /> : null}
            </>
          ) : null}
          {state === 'conflict' ? <Notice kind="warning" message={t('sync.avisoRevisar', { quantidade: review })} /> : null}
        </>
      )}
    </View>
  );
}
