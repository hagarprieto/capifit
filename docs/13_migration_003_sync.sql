-- ============================================================
-- Migration 003 (E08-04): o lote de sincronização também cancela sessões.
-- Aplicar depois da Migration 002. O contrato (SyncOperacao.tipo) aceita `cancelar`,
-- que o DDL original de operacoes_sync não previa.
-- ============================================================
USE capifit;

ALTER TABLE operacoes_sync
 MODIFY tipo ENUM('criar','atualizar','concluir','cancelar') NOT NULL;
