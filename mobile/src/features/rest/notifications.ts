import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/i18n';

/** Aviso local de fim de descanso (funciona com o app em segundo plano ou a tela bloqueada). */
export type RestNotifier = {
  /** Agenda o aviso para daqui a `seconds`; devolve o id, ou `null` se não há permissão ou o agendamento falhou. */
  schedule(seconds: number): Promise<string | null>;
  cancel(id: string | null): Promise<void>;
};

const CHANNEL_ID = 'descanso';
let handlerReady = false;
let asked = false;

function prepare(): void {
  if (handlerReady) {
    return;
  }
  handlerReady = true;
  // Com o app aberto, o próprio timer (e o háptico) já avisam: não duplica com banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function permitted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  // Pede no máximo uma vez por execução, e só quando o usuário inicia um descanso (momento em que o motivo é claro).
  if (asked || !current.canAskAgain) {
    return false;
  }
  asked = true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Implementação real. Nunca lança: sem permissão ou com falha da plataforma o descanso segue funcionando só dentro do
 * app (o aviso é um reforço, não requisito).
 */
export const restNotifier: RestNotifier = {
  async schedule(seconds) {
    try {
      prepare();
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: t('descanso.canal'), importance: AndroidImportance.HIGH });
      }
      if (!(await permitted())) {
        return null;
      }
      return await Notifications.scheduleNotificationAsync({
        content: { title: t('descanso.notificacaoTitulo'), body: t('descanso.notificacaoTexto') },
        trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: CHANNEL_ID },
      });
    } catch {
      return null;
    }
  },

  async cancel(id) {
    if (id === null) {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // já disparada ou inexistente: nada a desfazer
    }
  },
};
