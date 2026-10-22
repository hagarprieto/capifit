<?php

declare(strict_types=1);

namespace CapiFit\Support;

final class Text
{
    private const ACCENTS = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'ç' => 'c', 'ñ' => 'n',
    ];

    /**
     * Minúsculas, sem acentos e sem espaços nas pontas. Deve ser a MESMA regra usada para gravar
     * `exercicios.nome_normalizado` e os sinônimos (Doc 09 §4.3), senão a busca não encontra.
     */
    public static function normalize(string $value): string
    {
        return strtr(mb_strtolower(trim($value)), self::ACCENTS);
    }

    /** Escapa os curingas do LIKE (% _ \) para que o texto do usuário seja tratado literalmente. */
    public static function escapeLike(string $value): string
    {
        return addcslashes($value, '%_\\');
    }
}
