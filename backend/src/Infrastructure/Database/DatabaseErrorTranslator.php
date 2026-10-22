<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Database;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;

/**
 * Traduz erros conhecidos do banco (triggers e índices únicos da Migration 001/002)
 * em erros do contrato. Erros desconhecidos retornam null (viram 500 sem detalhes).
 * Serviços devem tratar violações de unicidade esperadas com contexto próprio.
 */
final class DatabaseErrorTranslator
{
    /** Prefixos de MESSAGE_TEXT dos triggers (SQLSTATE 45000). */
    private const TRIGGERS = [
        'VERSION_IMMUTABLE' => [ErrorCode::VersionImmutable, []],
        'MODEL_IMMUTABLE' => [ErrorCode::VersionImmutable, ['resource' => 'modelo_sugestao']],
        'SESSION_CLOSED' => [ErrorCode::SessionClosed, []],
    ];

    public function translate(\mysqli_sql_exception $e): ?ApiException
    {
        if ($e->getSqlState() === '45000') {
            $prefix = trim(explode(':', $e->getMessage(), 2)[0]);
            if (isset(self::TRIGGERS[$prefix])) {
                [$code, $details] = self::TRIGGERS[$prefix];

                return new ApiException($code, null, $details, [], $e);
            }
        }

        if ($e->getCode() === 1062 && str_contains($e->getMessage(), 'uq_sessao_em_andamento')) {
            return new ApiException(ErrorCode::SessionAlreadyOpen, null, [], [], $e);
        }

        return null;
    }
}
