import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getTheme, resolveScheme, type Preference, type Theme } from './theme';

type ThemeContextValue = {
  theme: Theme;
  preference: Preference;
  setPreference: (preference: Preference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Fornece o tema (cores, tipografia, espaçamentos) a partir dos tokens do Documento 08.
 * Segue o sistema por padrão; a escolha manual vale na sessão (persistência: história E04-05).
 */
export function ThemeProvider({ children, initialPreference = 'system' }: { children: ReactNode; initialPreference?: Preference }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Preference>(initialPreference);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: getTheme(resolveScheme(preference, system)), preference, setPreference }),
    [preference, system],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme precisa estar dentro de <ThemeProvider>.');
  }
  return context;
}
