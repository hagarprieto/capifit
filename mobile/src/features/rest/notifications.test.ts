import type { RestNotifier } from './notifications';

/**
 * Achado na validação em aparelho: no Expo Go (SDK 58) a parte nativa `ExpoTopicSubscriptionModule` não existe, e o app
 * inteiro caía ao abrir porque `expo-notifications` era importado no topo. Agora o módulo é carregado só quando preciso.
 */
function loadWith(factory: () => unknown): RestNotifier {
  let notifier: RestNotifier | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-notifications', factory);
    notifier = (jest.requireActual('./notifications') as { restNotifier: RestNotifier }).restNotifier;
  });
  return notifier as RestNotifier;
}

describe('aviso de fim de descanso quando o módulo nativo de notificações não existe', () => {
  it('importar o arquivo não derruba o app, agendar devolve null e cancelar não lança', async () => {
    const notifier = loadWith(() => {
      throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
    });

    await expect(notifier.schedule(90)).resolves.toBeNull();
    await expect(notifier.cancel('qualquer-id')).resolves.toBeUndefined();
    await expect(notifier.cancel(null)).resolves.toBeUndefined();
  });

  it('com o módulo disponível agenda de verdade e devolve o id', async () => {
    const scheduleNotificationAsync = jest.fn().mockResolvedValue('notif-1');
    const notifier = loadWith(() => ({
      AndroidImportance: { HIGH: 4 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
      requestPermissionsAsync: jest.fn(),
      scheduleNotificationAsync,
      cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    }));

    await expect(notifier.schedule(90)).resolves.toBe('notif-1');
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ trigger: expect.objectContaining({ seconds: 90, type: 'timeInterval' }) }));
  });
});
