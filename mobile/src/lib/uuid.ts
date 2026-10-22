import { randomUUID } from 'expo-crypto';

/** UUID v4 gerado no aparelho: chaves de idempotência e identificadores criados offline (RG-020). */
export function newUuid(): string {
  return randomUUID();
}
