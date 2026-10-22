<?php

declare(strict_types=1);

namespace CapiFit\Presenters;

/** Formato público do exercício (schemas ExercicioResumo e ItemTaxonomia do OpenAPI). */
final class ExercisePresenter
{
    /**
     * @param array<string, mixed> $row linha com uuid, nome, modalidade, equipamento_id, equipamento_nome
     * @param list<array{id: string, nome: string}> $primaryGroups
     * @return array<string, mixed>
     */
    public static function summary(array $row, array $primaryGroups): array
    {
        return [
            'id' => $row['uuid'],
            'nome' => $row['nome'],
            'equipamento' => self::equipment($row),
            'grupos_primarios' => $primaryGroups,
            'modalidade' => $row['modalidade'],
            'miniatura_url' => null,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array{id: string, nome: string}|null
     */
    public static function equipment(array $row): ?array
    {
        return $row['equipamento_id'] === null ? null : ['id' => (string) $row['equipamento_id'], 'nome' => (string) $row['equipamento_nome']];
    }
}
