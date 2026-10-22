import { Stack, useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/design-system/ThemeProvider';
import { ProgramEditorProvider } from '@/features/programs/editor/ProgramEditorProvider';

// O estado do editor vive aqui: as telas de programa, ficha e exercício compartilham o mesmo rascunho em memória.
export default function EditorLayout() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { theme } = useTheme();

  return (
    <ProgramEditorProvider programId={String(uuid)}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg.primary } }} />
    </ProgramEditorProvider>
  );
}
