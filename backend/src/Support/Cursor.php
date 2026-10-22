<?php

declare(strict_types=1);

namespace CapiFit\Support;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;

/**
 * Cursor opaco de paginação por chave (keyset): guarda o último par (texto de ordenação, id).
 * Não é assinado: forjá-lo só muda de onde a página começa, sem expor dados nem ultrapassar permissões.
 */
final class Cursor
{
    private const MAX_LENGTH = 400;

    /** @param array{string, int} $position */
    public static function encode(array $position): string
    {
        return rtrim(strtr(base64_encode(json_encode($position, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)), '+/', '-_'), '=');
    }

    /** @return array{string, int} */
    public static function decode(string $cursor): array
    {
        $invalid = new ApiException(ErrorCode::InvalidJson, 'Cursor inválido.', ['reason' => 'INVALID_CURSOR']);
        if ($cursor === '' || strlen($cursor) > self::MAX_LENGTH || preg_match('/^[A-Za-z0-9_-]+$/', $cursor) !== 1) {
            throw $invalid;
        }
        $json = base64_decode(strtr($cursor, '-_', '+/'), true);
        if ($json === false) {
            throw $invalid;
        }
        try {
            $data = json_decode($json, true, 4, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw $invalid;
        }
        if (!is_array($data) || count($data) !== 2 || !array_is_list($data) || !is_string($data[0]) || !is_int($data[1]) || $data[1] < 0) {
            throw $invalid;
        }

        return [$data[0], $data[1]];
    }
}
