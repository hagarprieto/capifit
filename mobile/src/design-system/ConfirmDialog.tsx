import { Modal, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Ação irreversível: o botão de confirmar usa a cor de erro e o texto explica o efeito. */
  destructive?: boolean;
  loading?: boolean;
};

/** Diálogo de confirmação (Doc 08 §8): "Cancelar" vem primeiro (foco inicial seguro) e o efeito é descrito na mensagem. */
export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel, destructive = false, loading = false }: Props) {
  const { theme } = useTheme();
  const { colors, radius, space } = theme;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={{ flex: 1, justifyContent: 'center', padding: space[3] }}>
        {/* Fundo escurecido com a cor do tema (sem cor literal); o diálogo fica por cima, opaco. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg.primary, opacity: 0.85 }]} />
        <View
          accessibilityRole="alert"
          style={{ gap: space[2], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: destructive ? colors.feedback.error : colors.border.subtle }}
        >
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text color="secondary">{message}</Text>
          <View style={{ gap: space[1] }}>
            <Button label={t('dialogo.cancelar')} variant="secondary" onPress={onCancel} />
            <Button label={confirmLabel} onPress={onConfirm} loading={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
