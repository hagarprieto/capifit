import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';

/** Tela rolável com fundo do tema, área segura e margem lateral de 16 dp. */
export function Screen({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg.primary }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: theme.space[3], paddingVertical: theme.space[3], gap: theme.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
