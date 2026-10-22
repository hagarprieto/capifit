import { Pressable, View } from 'react-native';

import { OriginBadge, originLabel, type Origin } from './OriginBadge';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type Props = {
  title: string;
  origin: Origin;
  authorName?: string;
  /** Linha secundária: versão e data ("versão 2 · atualizado em 22/10/2026"). */
  detail: string;
  /** Rótulos curtos das fichas (Treino A, Treino B…). */
  tags?: string[];
  onPress: () => void;
  testID?: string;
};

/** Cartão de programa (Doc 08 §8): cartão inteiro focável; a origem é lida ANTES do título. */
export function WorkoutCard({ title, origin, authorName, detail, tags = [], onPress, testID }: Props) {
  const { theme } = useTheme();
  const { colors, radius, space } = theme;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${originLabel(origin, authorName)}. ${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({ gap: space[1], padding: space[2], borderRadius: radius.lg, backgroundColor: colors.bg.surface, opacity: pressed ? 0.85 : 1, minHeight: theme.size.touchPreferred })}
    >
      <OriginBadge origin={origin} authorName={authorName} />
      <Text variant="title">{title}</Text>
      <Text variant="bodySmall" color="secondary">
        {detail}
      </Text>
      {tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {tags.map((tag) => (
            <View key={tag} style={{ paddingHorizontal: space[1], paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.bg.elevated }}>
              <Text variant="caption">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
