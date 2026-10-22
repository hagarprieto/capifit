<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Infrastructure\Database\Connection;

/**
 * Importador idempotente do seed do catálogo (E03-02; Doc 09 §5, CAT-09).
 *
 * Lê o mesmo `09_seed_catalogo.sql` e grava cada INSERT como "inserir se ainda não existir": repetir a importação não
 * duplica nada e **nunca sobrescreve** o que já está no banco (conteúdo revisado e publicado por um curador fica
 * intacto). Aceita apenas INSERTs nas tabelas do catálogo; qualquer outra instrução recusa o arquivo inteiro. Tudo
 * roda numa transação; se a verificação de nomes e sinônimos (CAT-09) falhar, nada é gravado.
 */
final class SeedImporter
{
    /** Tabela do catálogo => coluna usada no no-op de "já existe" (qualquer coluna da chave única). */
    private const TABLES = [
        'grupos_musculares' => 'nome',
        'equipamentos' => 'nome',
        'exercicios' => 'uuid',
        'exercicios_musculos' => 'exercicio_id',
        'exercicios_cuidados' => 'exercicio_id',
        'exercicios_sinonimos' => 'exercicio_id',
        'exercicios_alternativas' => 'exercicio_id',
        'modelos_sugestao' => 'codigo',
    ];

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, int> linhas novas por tabela (0 = já estava tudo lá) */
    public function import(string $sql): array
    {
        $statements = $this->statements($sql);
        preg_match_all('/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i', $sql, $found);
        $uuids = array_values(array_unique(array_map('strtolower', $found[0])));
        $inserted = array_fill_keys(array_keys(self::TABLES), 0);

        $this->db->transaction(function () use ($statements, $uuids, &$inserted): void {
            foreach ($statements as [$table, $statement]) {
                $inserted[$table] += $this->db->execute($statement);
            }
            $this->assertNamesAreUnambiguous($uuids);
        });

        return $inserted;
    }

    /**
     * Separa e valida as instruções; devolve cada INSERT já reescrito como no-op em caso de chave existente.
     *
     * @return list<array{string, string}> tabela e instrução
     */
    private function statements(string $sql): array
    {
        $result = [];
        foreach ($this->split($sql) as $statement) {
            if (preg_match('/^(SET\s+NAMES\s+utf8mb4|USE\s+`?[a-z0-9_]+`?)$/i', $statement) === 1) {
                continue; // preparação do script; a conexão já é utf8mb4 e o banco vem da configuração
            }
            if (preg_match('/^INSERT\s+INTO\s+`?([a-z_]+)`?\s*\(/i', $statement, $m) !== 1 || !isset(self::TABLES[strtolower($m[1])])) {
                throw new \RuntimeException('Instrução fora do catálogo no arquivo de seed; importação recusada.');
            }
            $table = strtolower($m[1]);
            if (stripos($statement, 'ON DUPLICATE KEY') !== false) {
                throw new \RuntimeException('O arquivo de seed não deve conter ON DUPLICATE KEY; importação recusada.');
            }
            $column = self::TABLES[$table];
            $result[] = [$table, $statement . " ON DUPLICATE KEY UPDATE $column = $column"];
        }
        if ($result === []) {
            throw new \RuntimeException('Nenhum INSERT encontrado no arquivo de seed.');
        }

        return $result;
    }

    /**
     * Divide em instruções no `;` que está fora de texto entre aspas e de comentário de linha (`-- ...`).
     *
     * @return list<string>
     */
    private function split(string $sql): array
    {
        $statements = [];
        $current = '';
        $inString = false;
        $length = strlen($sql);
        for ($i = 0; $i < $length; ++$i) {
            $c = $sql[$i];
            if ($inString) {
                $current .= $c;
                if ($c === '\\' && $i + 1 < $length) {
                    $current .= $sql[++$i];
                } elseif ($c === "'") {
                    if ($i + 1 < $length && $sql[$i + 1] === "'") {
                        $current .= $sql[++$i]; // '' dentro do texto
                    } else {
                        $inString = false;
                    }
                }
                continue;
            }
            if ($c === '-' && ($sql[$i + 1] ?? '') === '-' && in_array($sql[$i + 2] ?? '', [' ', "\t", "\r", "\n", ''], true)) {
                $end = strpos($sql, "\n", $i);
                $i = $end === false ? $length : $end;
                continue;
            }
            if ($c === "'") {
                $inString = true;
                $current .= $c;
            } elseif ($c === ';') {
                $statement = trim($current);
                if ($statement !== '') {
                    $statements[] = $statement;
                }
                $current = '';
            } else {
                $current .= $c;
            }
        }
        if ($inString) {
            throw new \RuntimeException('Texto sem fechar no arquivo de seed.');
        }
        if (trim($current) !== '') {
            throw new \RuntimeException('Instrução sem ponto e vírgula no fim do arquivo de seed.');
        }

        return $statements;
    }

    /**
     * CAT-09: entre os exercícios que o seed cita, nenhum nome duplicado e nenhum sinônimo ambíguo (igual ao nome de
     * outro ou repetido entre exercícios). O escopo é o conjunto do seed: o que o curador cadastra depois é validado
     * pelo cadastro administrativo.
     *
     * @param list<string> $uuids
     */
    private function assertNamesAreUnambiguous(array $uuids): void
    {
        if ($uuids === []) {
            return;
        }
        $marks = implode(',', array_fill(0, count($uuids), '?'));
        $types = str_repeat('s', count($uuids));
        $problems = [];
        $duplicates = $this->db->fetchAll("SELECT nome_normalizado AS t FROM exercicios WHERE uuid IN ($marks) GROUP BY nome_normalizado HAVING COUNT(*) > 1", $types, ...$uuids);
        foreach ($duplicates as $r) {
            $problems[] = 'nome repetido: ' . $r['t'];
        }
        $ambiguous = $this->db->fetchAll(
            "SELECT s.termo_normalizado AS t FROM exercicios_sinonimos s JOIN exercicios x ON x.id = s.exercicio_id AND x.uuid IN ($marks)
              WHERE EXISTS (SELECT 1 FROM exercicios e WHERE e.uuid IN ($marks) AND e.nome_normalizado = s.termo_normalizado AND e.id <> s.exercicio_id)
                 OR EXISTS (SELECT 1 FROM exercicios_sinonimos o JOIN exercicios y ON y.id = o.exercicio_id AND y.uuid IN ($marks)
                             WHERE o.termo_normalizado = s.termo_normalizado AND o.exercicio_id <> s.exercicio_id)",
            $types . $types . $types,
            ...$uuids,
            ...$uuids,
            ...$uuids,
        );
        foreach ($ambiguous as $r) {
            $problems[] = 'sinônimo ambíguo: ' . $r['t'];
        }
        if ($problems !== []) {
            throw new \RuntimeException('Catálogo com nomes ou sinônimos ambíguos (CAT-09): ' . implode('; ', array_unique($problems)));
        }
    }
}
