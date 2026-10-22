<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Infrastructure\Database\DatabaseErrorTranslator;
use PHPUnit\Framework\TestCase;

/**
 * Regras do schema (Migration 001/002) verificadas por SQL direto, contra um MySQL real.
 * Só roda com DB_NAME definido e CAPIFIT_ALLOW_DB_TESTS=1: os testes deixam linhas de teste no banco
 * (versões publicadas são imutáveis), então use um banco descartável criado por tools/db/apply-schema.ps1.
 */
final class DatabaseIntegrityTest extends TestCase
{
    private Connection $db;
    private \mysqli $m;

    protected function setUp(): void
    {
        if (getenv('DB_NAME') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_NAME, DB_* e CAPIFIT_ALLOW_DB_TESTS=1 para rodar contra um banco descartável.');
        }
        $this->db = new Connection(Config::fromArray(getenv()));
        $this->m = $this->db->mysqli();
    }

    protected function tearDown(): void
    {
        if (isset($this->db)) {
            $this->db->close();
        }
    }

    private function exec(string $sql, string $types = '', mixed ...$params): int
    {
        $stmt = $this->m->prepare($sql);
        if ($params !== []) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $id = $this->m->insert_id;
        $stmt->close();

        return (int) $id;
    }

    private function user(): int
    {
        $email = 't' . bin2hex(random_bytes(6)) . '@exemplo.invalid';

        return $this->exec('INSERT INTO usuarios(uuid,nome,email) VALUES (UUID(),?,?)', 'ss', 'Teste', $email);
    }

    private function expectDbError(callable $sql): \mysqli_sql_exception
    {
        try {
            $sql();
        } catch (\mysqli_sql_exception $e) {
            return $e;
        }
        self::fail('Era esperado um erro do banco.');
    }

    public function testPublishedVersionRejectsNewFicha(): void
    {
        $aluno = $this->user();
        $programa = $this->exec("INSERT INTO programas_treino(uuid,aluno_id,autor_id,origem,titulo) VALUES (UUID(),?,?,'usuario','P')", 'ii', $aluno, $aluno);
        $versao = $this->exec('INSERT INTO versoes_programa(programa_id,numero) VALUES (?,1)', 'i', $programa);
        $this->exec("INSERT INTO fichas_treino(versao_id,codigo,titulo,ordem,uuid) VALUES (?,'A','A',1,UUID())", 'i', $versao);
        $this->exec("UPDATE versoes_programa SET estado='publicado' WHERE id=?", 'i', $versao);

        $e = $this->expectDbError(fn () => $this->exec("INSERT INTO fichas_treino(versao_id,codigo,titulo,ordem,uuid) VALUES (?,'B','B',2,UUID())", 'i', $versao));
        $translated = (new DatabaseErrorTranslator())->translate($e);

        self::assertSame(ErrorCode::VersionImmutable, $translated?->errorCode);
    }

    public function testOnlyOneOpenSessionPerStudent(): void
    {
        $aluno = $this->user();
        $this->exec("INSERT INTO sessoes_treino(uuid,aluno_id,tipo,iniciada_em) VALUES (UUID(),?,'avulso',NOW(6))", 'i', $aluno);

        $e = $this->expectDbError(fn () => $this->exec("INSERT INTO sessoes_treino(uuid,aluno_id,tipo,iniciada_em) VALUES (UUID(),?,'avulso',NOW(6))", 'i', $aluno));

        self::assertSame(ErrorCode::SessionAlreadyOpen, (new DatabaseErrorTranslator())->translate($e)?->errorCode);

        // Outro aluno não é afetado.
        $this->exec("INSERT INTO sessoes_treino(uuid,aluno_id,tipo,iniciada_em) VALUES (UUID(),?,'avulso',NOW(6))", 'i', $this->user());
        $this->addToAssertionCount(1);
    }

    public function testProgrammedSessionRequiresFicha(): void
    {
        $aluno = $this->user();

        $this->expectDbError(fn () => $this->exec('INSERT INTO sessoes_treino(uuid,aluno_id,iniciada_em) VALUES (UUID(),?,NOW(6))', 'i', $aluno));
        $this->addToAssertionCount(1);
    }

    public function testClosedSessionRejectsSeriesChanges(): void
    {
        $aluno = $this->user();
        $sessao = $this->exec("INSERT INTO sessoes_treino(uuid,aluno_id,tipo,iniciada_em) VALUES (UUID(),?,'avulso',NOW(6))", 'i', $aluno);
        $exercicio = $this->exec("INSERT INTO exercicios(uuid,nome,nome_normalizado) VALUES (UUID(),?,?)", 'ss', 'Teste ' . bin2hex(random_bytes(4)), 'teste');
        $itemSessao = $this->exec('INSERT INTO sessoes_exercicios(sessao_id,exercicio_id,ordem,uuid) VALUES (?,?,1,UUID())', 'ii', $sessao, $exercicio);
        $serie = $this->exec("INSERT INTO sessoes_series(uuid,sessao_exercicio_id,ordem) VALUES (UUID(),?,1)", 'i', $itemSessao);
        $this->exec("UPDATE sessoes_series SET carga_kg=40, repeticoes=10, status='realizada' WHERE id=?", 'i', $serie);
        $this->exec("UPDATE sessoes_treino SET status='concluida', encerrada_em=NOW(6) WHERE id=?", 'i', $sessao);

        $e = $this->expectDbError(fn () => $this->exec('UPDATE sessoes_series SET repeticoes=11 WHERE id=?', 'i', $serie));
        self::assertSame(ErrorCode::SessionClosed, (new DatabaseErrorTranslator())->translate($e)?->errorCode);

        $e = $this->expectDbError(fn () => $this->exec("UPDATE sessoes_treino SET status='em_andamento' WHERE id=?", 'i', $sessao));
        self::assertSame(ErrorCode::SessionClosed, (new DatabaseErrorTranslator())->translate($e)?->errorCode);
    }

    public function testOnlyOneCurrentCoachLinkButHistoryIsKept(): void
    {
        $coach = $this->user();
        $aluno = $this->user();
        $vinculo = $this->exec('INSERT INTO vinculos_coach_aluno(coach_id,aluno_id) VALUES (?,?)', 'ii', $coach, $aluno);

        $this->expectDbError(fn () => $this->exec('INSERT INTO vinculos_coach_aluno(coach_id,aluno_id) VALUES (?,?)', 'ii', $coach, $aluno));

        $this->exec("UPDATE vinculos_coach_aluno SET status='revogado' WHERE id=?", 'i', $vinculo);
        $this->exec('INSERT INTO vinculos_coach_aluno(coach_id,aluno_id) VALUES (?,?)', 'ii', $coach, $aluno);
        $this->addToAssertionCount(1);
    }

    public function testTransactionCommitsAndRollsBack(): void
    {
        $email = 'tx' . bin2hex(random_bytes(6)) . '@exemplo.invalid';

        $propagou = false;
        try {
            $this->db->transaction(function (\mysqli $m) use ($email): void {
                $stmt = $m->prepare('INSERT INTO usuarios(uuid,nome,email) VALUES (UUID(),?,?)');
                $nome = 'Rollback';
                $stmt->bind_param('ss', $nome, $email);
                $stmt->execute();
                // Depois do INSERT o insert_id é sempre >= 0; a condição só existe para o analisador estático.
                if ((int) $m->insert_id >= 0) {
                    throw new \RuntimeException('falha proposital');
                }
            });
        } catch (\RuntimeException) {
            $propagou = true;
        }
        self::assertTrue($propagou, 'a falha deveria ter sido propagada');
        self::assertSame(0, $this->countUsers($email), 'a linha deveria ter sofrido rollback');

        $this->db->transaction(function (\mysqli $m) use ($email): void {
            $stmt = $m->prepare('INSERT INTO usuarios(uuid,nome,email) VALUES (UUID(),?,?)');
            $nome = 'Commit';
            $stmt->bind_param('ss', $nome, $email);
            $stmt->execute();
        });
        self::assertSame(1, $this->countUsers($email));
    }

    public function testSessionTimeZoneIsUtc(): void
    {
        $row = $this->m->query("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS d")->fetch_assoc();
        self::assertSame(0, (int) $row['d']);
    }

    private function countUsers(string $email): int
    {
        $stmt = $this->m->prepare('SELECT COUNT(*) FROM usuarios WHERE email=?');
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $stmt->bind_result($n);
        $stmt->fetch();
        $stmt->close();

        return (int) $n;
    }
}
