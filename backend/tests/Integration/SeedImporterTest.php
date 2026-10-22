<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Services\SeedImporter;

/** Importador idempotente do seed do catálogo (E03-02; CAT-09). */
final class SeedImporterTest extends ApiTestCase
{
    private function importer(): SeedImporter
    {
        return new SeedImporter($this->kernel->db);
    }

    private function seed(): string
    {
        $sql = file_get_contents(dirname(__DIR__, 3) . '/docs/09_seed_catalogo.sql');
        self::assertIsString($sql);

        return $sql;
    }

    /** @return array<string, mixed> */
    private function seedExercise(int $offset): array
    {
        // Exercício que o próprio seed define (os outros testes também criam exercícios sem autor).
        preg_match_all('/INSERT INTO exercicios\(uuid.*?;\r?\n/s', $this->seed(), $block);
        preg_match_all("/\('([0-9a-f-]{36})'/", $block[0][0], $found);
        $row = $this->kernel->db->fetchOne('SELECT id, uuid, nome, nome_normalizado FROM exercicios WHERE uuid = ?', 's', $found[1][$offset]);
        self::assertNotNull($row);

        return $row;
    }

    private function total(string $table): int
    {
        return (int) $this->kernel->db->fetchOne("SELECT COUNT(*) AS n FROM $table")['n'];
    }

    public function testImportingTheSameSeedAgainInsertsNothing(): void
    {
        $before = [$this->total('exercicios'), $this->total('exercicios_musculos'), $this->total('modelos_sugestao'), $this->total('grupos_musculares')];

        $result = $this->importer()->import($this->seed());

        self::assertSame(0, array_sum($result), json_encode($result) ?: '');
        self::assertSame($before, [$this->total('exercicios'), $this->total('exercicios_musculos'), $this->total('modelos_sugestao'), $this->total('grupos_musculares')]);
    }

    public function testMissingRowsAreRestoredAndExistingContentIsNeverOverwritten(): void
    {
        $curated = $this->seedExercise(20);
        $this->kernel->db->execute("UPDATE exercicios SET status = 'publicado', instrucoes = 'Texto revisado pelo curador.', dificuldade = 'avancado' WHERE id = ?", 'i', (int) $curated['id']);

        $lost = $this->seedExercise(30);
        $db = $this->kernel->db;
        $db->execute('DELETE FROM exercicios_musculos WHERE exercicio_id = ?', 'i', (int) $lost['id']);
        $db->execute('DELETE FROM exercicios_cuidados WHERE exercicio_id = ?', 'i', (int) $lost['id']);
        $db->execute('DELETE FROM exercicios_sinonimos WHERE exercicio_id = ?', 'i', (int) $lost['id']);
        $db->execute('DELETE FROM exercicios_alternativas WHERE exercicio_id = ? OR alternativa_id = ?', 'ii', (int) $lost['id'], (int) $lost['id']);
        $db->execute('DELETE FROM exercicios WHERE id = ?', 'i', (int) $lost['id']);

        $result = $this->importer()->import($this->seed());

        self::assertSame(1, $result['exercicios']);
        self::assertGreaterThanOrEqual(1, $result['exercicios_musculos']);
        self::assertSame(0, $result['grupos_musculares'] + $result['equipamentos'] + $result['modelos_sugestao']);
        $restored = $db->fetchOne('SELECT nome, status FROM exercicios WHERE uuid = ?', 's', $lost['uuid']);
        self::assertSame([$lost['nome'], 'rascunho'], [$restored['nome'] ?? null, $restored['status'] ?? null], 'o que faltava voltou como rascunho');

        $kept = $db->fetchOne('SELECT status, instrucoes, dificuldade FROM exercicios WHERE id = ?', 'i', (int) $curated['id']);
        self::assertSame(['publicado', 'Texto revisado pelo curador.', 'avancado'], [$kept['status'], $kept['instrucoes'], $kept['dificuldade']], 'conteúdo curado não é sobrescrito');
        self::assertSame(0, array_sum($this->importer()->import($this->seed())), 'repetir de novo não muda mais nada');
    }

    public function testQuotesSemicolonsAndCommentsInsideTheScriptAreHandled(): void
    {
        $name = 'Grupo; com ponto e vírgula ' . bin2hex(random_bytes(3));
        $sql = "-- comentário; com ponto e vírgula\nSET NAMES utf8mb4;\nUSE capifit;\nINSERT INTO grupos_musculares(nome) VALUES ('$name'); -- fim\n";

        self::assertSame(1, $this->importer()->import($sql)['grupos_musculares']);
        self::assertSame(0, $this->importer()->import($sql)['grupos_musculares']);
        self::assertSame(1, $this->total('grupos_musculares WHERE nome = ' . "'" . $name . "'"));
        $this->kernel->db->execute('DELETE FROM grupos_musculares WHERE nome = ?', 's', $name);
    }

    public function testAnythingOutsideTheCatalogInsertsIsRefusedWithoutWritingAnything(): void
    {
        $users = $this->total('usuarios');
        $group = 'Grupo recusado ' . bin2hex(random_bytes(3));
        foreach (["DELETE FROM usuarios;", "INSERT INTO usuarios(uuid) VALUES ('x');", "UPDATE exercicios SET status = 'publicado';", "DROP TABLE exercicios;", "INSERT INTO grupos_musculares(nome) VALUES ('$group'); DELETE FROM equipamentos;", "INSERT INTO grupos_musculares(nome) VALUES ('$group') ON DUPLICATE KEY UPDATE nome = 'x';", ''] as $sql) {
            try {
                $this->importer()->import($sql);
                self::fail('Deveria recusar: ' . $sql);
            } catch (\RuntimeException) {
                self::assertSame(0, $this->total("grupos_musculares WHERE nome = '$group'"), 'nada foi gravado: ' . $sql);
            }
        }
        self::assertSame($users, $this->total('usuarios'));
    }

    public function testAmbiguousSynonymFailsTheWholeImportAndRollsBack(): void
    {
        $a = $this->seedExercise(1);
        $b = $this->seedExercise(2);
        $group = 'Grupo revertido ' . bin2hex(random_bytes(3));
        $sql = "INSERT INTO grupos_musculares(nome) VALUES ('$group');\n"
            . "INSERT INTO exercicios_sinonimos(exercicio_id,termo_normalizado) VALUES ((SELECT id FROM exercicios WHERE uuid='{$a['uuid']}'),'{$b['nome_normalizado']}');\n"
            . "INSERT INTO exercicios_cuidados(exercicio_id,area) VALUES ((SELECT id FROM exercicios WHERE uuid='{$b['uuid']}'),'ombro');\n";

        try {
            $this->importer()->import($sql);
            self::fail('Sinônimo igual ao nome de outro exercício deve ser recusado.');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('CAT-09', $e->getMessage());
        }
        self::assertSame(0, $this->total("grupos_musculares WHERE nome = '$group'"), 'a transação inteira foi revertida');
    }
}
