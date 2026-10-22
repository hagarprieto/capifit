import { tokens } from './tokens.generated';

export type Scheme = 'light' | 'dark';
export type Preference = 'system' | Scheme;

export type Theme = {
  scheme: Scheme;
  colors: typeof tokens.color.dark | typeof tokens.color.light;
  typography: typeof tokens.typography;
  space: typeof tokens.space;
  radius: typeof tokens.radius;
  size: typeof tokens.size;
  motion: typeof tokens.motion;
  version: string;
};

/** Resolve a preferência do usuário ("sistema", claro ou escuro) para um esquema concreto. */
export function resolveScheme(preference: Preference, system: Scheme | null | undefined): Scheme {
  if (preference !== 'system') {
    return preference;
  }
  return system === 'dark' ? 'dark' : 'light';
}

export function getTheme(scheme: Scheme): Theme {
  return {
    scheme,
    colors: tokens.color[scheme],
    typography: tokens.typography,
    space: tokens.space,
    radius: tokens.radius,
    size: tokens.size,
    motion: tokens.motion,
    version: tokens.version,
  };
}

/** Achata um objeto de tokens aninhado em pares "grupo.nome" -> valor (usado na tela de verificação). */
export function flattenTokens(node: object, prefix = ''): [string, string][] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flattenTokens(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(value)] as [string, string]],
  );
}

/** Família de fonte (Inter, carregada em app/_layout) para cada peso da escala tipográfica. */
export function fontFamilyFor(weight: number): string {
  switch (weight) {
    case 700:
      return 'Inter_700Bold';
    case 600:
      return 'Inter_600SemiBold';
    case 500:
      return 'Inter_500Medium';
    default:
      return 'Inter_400Regular';
  }
}
