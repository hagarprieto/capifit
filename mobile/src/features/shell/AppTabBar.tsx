import { usePathname, useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/design-system/Button';
import { Text } from '@/design-system/Text';
import { useTheme } from '@/design-system/ThemeProvider';
import { useWorkoutApi } from '@/features/workout/useWorkoutApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';
import { t } from '@/i18n';

/**
 * Barra de abas com o atalho "Voltar ao treino" (UX-01, UX-02). A sessão aberta é consultada ao montar e a cada
 * mudança de aba ou de tela (ao voltar do treino a rota muda, então o atalho aparece ou some sem ação do usuário).
 * Se a consulta falhar, o atalho simplesmente não aparece: o treino nunca depende da barra.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets, api }: BottomTabBarProps & { api?: WorkoutApi }) {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const workoutApi = useWorkoutApi(api);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workoutApi
      .openSessionSummary()
      .then((open) => !cancelled && setOpenId(open?.id ?? null))
      .catch(() => !cancelled && setOpenId(null));
    return () => {
      cancelled = true;
    };
  }, [workoutApi, pathname, state.index]);

  return (
    <View style={{ backgroundColor: theme.colors.bg.surface, paddingBottom: insets.bottom, borderTopWidth: 1, borderTopColor: theme.colors.border.subtle }}>
      {openId ? (
        <View style={{ paddingHorizontal: theme.space[3], paddingTop: theme.space[2] }}>
          <Button label={t('aba.voltarTreino')} onPress={() => router.push({ pathname: '/treino/[uuid]', params: { uuid: openId } })} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', minHeight: theme.size.tabBar.height }}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const label = descriptors[route.key]?.options.title ?? route.name;
          const press = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={press}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: theme.size.touchMin.android }}
            >
              <Text variant="caption" style={{ color: selected ? theme.colors.brand.primary : theme.colors.text.secondary, fontWeight: selected ? '700' : '400' }}>
                {label}
              </Text>
              <View style={{ height: 3, width: 24, borderRadius: theme.radius.pill, backgroundColor: selected ? theme.colors.brand.primary : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
