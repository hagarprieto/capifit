import type { RestNotifier } from './notifications';

/**
 * Achados na validação em aparelho: no Expo Go (SDK 58) a parte nativa `ExpoTopicSubscriptionModule` não existe. O app
 * caía ao abrir (import no topo) e, depois, mostrava tela vermelha ao concluir a primeira série, porque o Metro trata
 * erro ao carregar um módulo como fatal mesmo dentro de `try/catch`. Por isso o teste de existência vem antes do `require`.
 */
function loadWith(options: { nativePresent: boolean; module?: () => unknown }): { notifier: RestNotifier; requireCalled: jest.Mock } {
  const requireCalled = jest.fn();
  let notifier: RestNotifier | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => (options.nativePresent ? {} : null) }));
    jest.doMock('expo-notifications', () => {
      requireCalled();
      if (!options.module) {
        throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
      }
      return options.module();
    });
    notifier = (jest.requireActual('./notifications') as { restNotifier: RestNotifier }).restNotifier;
  });
  return { notifier: notifier as RestNotifier, requireCalled };
}

const available = () => ({
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
});

describe('aviso de fim de descanso quando o módulo nativo de notificações não existe', () => {
  it('sem a parte nativa, nem tenta carregar o módulo (o Metro trataria como erro fatal); agendar devolve null e cancelar não lança', async () => {
    const { notifier, requireCalled } = loadWith({ nativePresent: false });

    await expect(notifier.schedule(90)).resolves.toBeNull();
    await expect(notifier.cancel('qualquer-id')).resolves.toBeUndefined();
    await expect(notifier.cancel(null)).resolves.toBeUndefined();
    expect(requireCalled).not.toHaveBeenCalled();
  });

  it('se a parte nativa existe mas o módulo ainda falha ao carregar, segue sem aviso', async () => {
    const { notifier } = loadWith({ nativePresent: true });

    await expect(notifier.schedule(90)).resolves.toBeNull();
  });

  it('com o módulo disponível agenda de verdade e devolve o id', async () => {
    const mod = available();
    const { notifier } = loadWith({ nativePresent: true, module: () => mod });

    await expect(notifier.schedule(90)).resolves.toBe('notif-1');
    expect(mod.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ trigger: expect.objectContaining({ seconds: 90, type: 'timeInterval' }) }));
  });
});
