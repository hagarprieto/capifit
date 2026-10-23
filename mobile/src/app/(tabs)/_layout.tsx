import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/features/shell/AppTabBar';
import { t } from '@/i18n';

/** AppShell (E04-03): quatro abas fixas (Doc 03 §3.1). A barra mostra "Voltar ao treino" enquanto houver sessão aberta. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('aba.inicio') }} />
      <Tabs.Screen name="programas" options={{ title: t('aba.treinos') }} />
      <Tabs.Screen name="evolucao" options={{ title: t('aba.evolucao') }} />
      <Tabs.Screen name="perfil" options={{ title: t('aba.perfil') }} />
    </Tabs>
  );
}
