import { ActivityIndicator, View } from 'react-native';

import { t } from '@/i18n';

import { Button } from './Button';
import { Notice } from './Notice';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * Estados padrão das telas de dados (Doc 03 §9.1). Cada tela usa estes componentes em vez de montar o seu texto de
 * "carregando" ou o seu aviso de erro, para o app inteiro falar do mesmo jeito (e ser lido do mesmo jeito):
 * - `loading` → LoadingState (não bloqueia a navegação);
 * - `empty` → EmptyState;
 * - `error` → ErrorState (mensagem clara + tentar de novo; o que a pessoa digitou fica na tela);
 * - `offline` → OfflineState (últimos dados e pendências locais);
 * - `permission_denied` → PermissionState (explicação + o que ela pode fazer).
 */

/** Indicador de carregamento com texto. O texto é anunciado pelo leitor de tela; o indicador é só visual. */
export function LoadingState({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
      <ActivityIndicator color={theme.colors.brand.primary} importantForAccessibility="no" accessibilityElementsHidden />
      <Text color="secondary" accessibilityLiveRegion="polite">
        {message}
      </Text>
    </View>
  );
}

type ErrorProps = {
  message: string;
  onRetry: () => void;
  /** `warning` para falha que não impede o resto da tela (ex.: um bloco que não carregou). */
  kind?: 'error' | 'warning';
  /** Erro ocupando a tela inteira: o botão de tentar de novo é o principal. */
  primary?: boolean;
  retryLabel?: string;
};

/** Mensagem clara e uma forma de tentar de novo. */
export function ErrorState({ message, onRetry, kind = 'error', primary = false, retryLabel }: ErrorProps) {
  return (
    <>
      <Notice kind={kind} message={message} />
      <Button label={retryLabel ?? t('estado.tentar')} variant={primary ? 'primary' : 'secondary'} onPress={onRetry} />
    </>
  );
}

type OfflineProps = {
  message: string;
  /** Quando os dados mostrados foram salvos (texto já formatado, ex.: "22/10 14:05"). */
  savedAt?: string;
  /** Registros guardados no aparelho esperando envio. */
  waiting?: number;
};

/** Sem conexão: o que está na tela é a última cópia salva, e o que ainda não foi enviado continua visível. */
export function OfflineState({ message, savedAt, waiting = 0 }: OfflineProps) {
  const extra = [savedAt ? t('estado.dadosDe', { data: savedAt }) : null, waiting > 0 ? t('estado.pendentes', { quantidade: waiting }) : null].filter(Boolean);
  return <Notice kind="info" message={extra.length > 0 ? `${message} ${extra.join(' ')}` : message} />;
}

type PermissionProps = { message: string; actionLabel?: string; onAction?: () => void };

/** Sem permissão para isto: diz por quê e oferece o que é permitido. */
export function PermissionState({ message, actionLabel, onAction }: PermissionProps) {
  return (
    <>
      <Notice kind="warning" message={message} />
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </>
  );
}
