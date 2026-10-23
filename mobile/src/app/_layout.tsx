import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LocalDataProvider } from '@/data/LocalDataProvider';
import { ThemeProvider, useTheme } from '@/design-system/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // já oculta (recarga em desenvolvimento): sem efeito
});

/**
 * Rotas por estado de sessão (TEL-001): sem sessão, só as telas de entrada; com sessão, a área logada.
 * A tela de redefinição de senha abre pelo link do e-mail nos dois casos. O guard só esconde telas:
 * a autorização de verdade é sempre do servidor.
 */
function ThemedStack({ fontsReady }: { fontsReady: boolean }) {
  const { theme } = useTheme();
  const { status } = useAuth();
  const ready = fontsReady && status !== 'loading';

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        // sem efeito se já estiver oculta
      });
    }
  }, [ready]);

  // O splash continua visível até a sessão ser restaurada (ou descartada).
  if (!ready) {
    return null;
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg.primary } }}>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="boas-vindas" />
          <Stack.Screen name="entrar" />
          <Stack.Screen name="cadastrar" />
          <Stack.Screen name="recuperar" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tema" />
          <Stack.Screen name="sincronizacao" />
          <Stack.Screen name="exercicios/index" />
          <Stack.Screen name="exercicios/[uuid]" />
          <Stack.Screen name="treino/[uuid]/index" />
          <Stack.Screen name="treino/[uuid]/exercicios" />
          <Stack.Screen name="treino/[uuid]/substituir" />
          <Stack.Screen name="treino/[uuid]/resumo" />
          <Stack.Screen name="programas/novo" />
          <Stack.Screen name="programas/[uuid]/index" />
          <Stack.Screen name="programas/[uuid]/editar" />
          <Stack.Screen name="programas/[uuid]/ficha/[fichaId]" />
        </Stack.Protected>
        <Stack.Screen name="redefinir-senha" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  // Em caso de erro ao carregar a fonte, segue com a fonte do sistema: o treino nunca depende dela.
  return (
    <ThemeProvider>
      <AuthProvider>
        <LocalDataProvider>
          <ThemedStack fontsReady={fontsLoaded || fontError !== null} />
        </LocalDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
