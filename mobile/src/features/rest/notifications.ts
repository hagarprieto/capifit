import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { t } from '@/i18n';

/** Aviso local de fim de descanso (funciona com o app em segundo plano ou a tela bloqueada). */
export type RestNotifier = {
  /** Agenda o aviso para daqui a `seconds`; devolve o id, ou `null` se não há permissão ou o agendamento falhou. */
  schedule(seconds: number): Promise<string | null>;
  cancel(id: string | null): Promise<void>;
};

type NotificationsModule = typeof import('expo-notifications');

let loaded: NotificationsModule | null | undefined;

/**
 * Carrega o módulo de notificações só quando preciso e só se a parte nativa existir. No Expo Go (SDK 58) a parte nativa
 * `ExpoTopicSubscriptionModule` não existe, e carregar `expo-notifications` assim mesmo derrubava o app. Um `try/catch`
 * em volta do `require` NÃO resolve: o Metro trata erro de carga de módulo como erro fatal (tela vermelha) e ainda engole
 * a exceção, então o teste de existência vem ANTES. Sem o módulo, o descanso segue só dentro do app (o aviso local é um
 * reforço, não requisito).
 */
function notifications(): NotificationsModule | null {
  if (loaded === undefined) {
    if (requireOptionalNativeModule('ExpoTopicSubscriptionModule') === null) {
      loaded = null;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require('expo-notifications') as NotificationsModule;
      } catch {
        loaded = null;
      }
    }
  }
  return loaded ?? null;
}

const CHANNEL_ID = 'descanso';
let handlerReady = false;
let asked = false;

function prepare(Notifications: NotificationsModule): void {
  if (handlerReady) {
    return;
  }
  handlerReady = true;
  // Com o app aberto, o próprio timer (e o háptico) já avisam: não duplica com banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function permitted(Notifications: NotificationsModule): Promise<boolean> {
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
      const Notifications = notifications();
      if (!Notifications) {
        return null;
      }
      prepare(Notifications);
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: t('descanso.canal'), importance: Notifications.AndroidImportance.HIGH });
      }
      if (!(await permitted(Notifications))) {
        return null;
      }
      return await Notifications.scheduleNotificationAsync({
        content: { title: t('descanso.notificacaoTitulo'), body: t('descanso.notificacaoTexto') },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: CHANNEL_ID },
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
      await notifications()?.cancelScheduledNotificationAsync(id);
    } catch {
      // já disparada ou inexistente: nada a desfazer
    }
  },
};
