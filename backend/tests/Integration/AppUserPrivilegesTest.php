<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Infrastructure\Database\DatabaseErrorTranslator;
use PHPUnit\Framework\TestCase;

/**
 * O usuário da aplicação só pode ler e gravar dados: não altera o schema nem triggers (Doc 06 §5, Doc 11 bloco C).
 * Roda com DB_APP_USER/DB_APP_PASSWORD (criados por `apply-schema.ps1 -AppUser`) e CAPIFIT_ALLOW_DB_TESTS=1.
 * Como proteção, aborta ANTES de qualquer DDL se o usuário parecer privilegiado.
 */
final class AppUserPrivilegesTest extends TestCase
{
    private const DENIED_CODES = [1419, 1044, 1142, 1227, 1370, 1045];

    private Connection $db;
    private \mysqli $m;

    protected function setUp(): void
    {
        if (getenv('DB_APP_USER') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_APP_USER, DB_APP_PASSWORD e CAPIFIT_ALLOW_DB_TESTS=1.');
        }
        $env = getenv();
        $env['DB_USER'] = (string) getenv('DB_APP_USER');
        $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        $this->db = new Connection(Config::fromArray($env));
        $this->m = $this->db->mysqli();

        $current = (string) $this->m->query('SELECT CURRENT_USER()')->fetch_row()[0];
        self::assertStringNotContainsStringIgnoringCase('root@', $current, 'Este teste não deve rodar com um usuário administrativo.');
        $grants = [];
        foreach ($this->m->query('SHOW GRANTS')->fetch_all() as $row) {
            $grants[] = (string) $row[0];
        }
        $all = implode("\n", $grants);
        self::assertStringNotContainsStringIgnoringCase('ALL PRIVILEGES', $all, 'Usuário da aplicação com privilégio excessivo: abortando antes de qualquer DDL.');
        self::assertStringNotContainsStringIgnoringCase('WITH GRANT OPTION', $all);
    }

    protected function tearDown(): void
    {
        if (isset($this->db)) {
            $this->db->close();
        }
    }

    public function testCanReadAndWriteData(): void
    {
        $email = 'app' . bin2hex(random_bytes(6)) . '@exemplo.invalid';
        $stmt = $this->m->prepare('INSERT INTO usuarios(uuid,nome,email) VALUES (UUID(),?,?)');
        $nome = 'App';
        $stmt->bind_param('ss', $nome, $email);
        $stmt->execute();

        $stmt = $this->m->prepare('UPDATE usuarios SET nome=? WHERE email=?');
        $novo = 'App 2';
        $stmt->bind_param('ss', $novo, $email);
        $stmt->execute();
        self::assertSame(1, $this->m->affected_rows);

        $stmt = $this->m->prepare('DELETE FROM usuarios WHERE email=?');
        $stmt->bind_param('s', $email);
        $stmt->execute();
        self::assertSame(1, $this->m->affected_rows);
    }

    /** @return array<string, array{string}> */
    public static function forbiddenStatements(): array
    {
        return [
            'criar tabela' => ['CREATE TABLE zz_nao_pode (id INT)'],
            'alterar tabela' => ['ALTER TABLE usuarios ADD COLUMN zz_nao_pode INT'],
            'apagar tabela' => ['DROP TABLE usuarios'],
            'truncar tabela' => ['TRUNCATE TABLE usuarios'],
            'apagar trigger' => ['DROP TRIGGER tg_versoes_bu'],
            'criar trigger' => ['CREATE TRIGGER zz_trigger BEFORE INSERT ON usuarios FOR EACH ROW SET NEW.nome = NEW.nome'],
            'criar índice' => ['CREATE INDEX zz_idx ON usuarios (nome)'],
            'criar usuário' => ["CREATE USER 'zz_intruso'@'%' IDENTIFIED BY 'x'"],
            'conceder privilégio' => ["GRANT ALL ON *.* TO 'zz_intruso'@'%'"],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('forbiddenStatements')]
    public function testSchemaChangesAreDenied(string $sql): void
    {
        try {
            $this->m->query($sql);
        } catch (\mysqli_sql_exception $e) {
            self::assertContains($e->getCode(), self::DENIED_CODES, 'Era esperado erro de permissão, veio: ' . $e->getCode());

            return;
        }
        self::fail('O usuário da aplicação conseguiu executar: ' . $sql);
    }

    public function testTriggersStillProtectDataForTheAppUser(): void
    {
        $email = 'trg' . bin2hex(random_bytes(6)) . '@exemplo.invalid';
        $stmt = $this->m->prepare('INSERT INTO usuarios(uuid,nome,email) VALUES (UUID(),?,?)');
        $nome = 'Trigger';
        $stmt->bind_param('ss', $nome, $email);
        $stmt->execute();
        $aluno = (int) $this->m->insert_id;

        $this->m->query("INSERT INTO programas_treino(uuid,aluno_id,autor_id,origem,titulo) VALUES (UUID(),$aluno,$aluno,'usuario','P')");
        $programa = (int) $this->m->insert_id;
        $this->m->query("INSERT INTO versoes_programa(programa_id,numero) VALUES ($programa,1)");
        $versao = (int) $this->m->insert_id;
        $this->m->query("UPDATE versoes_programa SET estado='publicado' WHERE id=$versao");

        $translated = null;
        try {
            $this->m->query("INSERT INTO fichas_treino(versao_id,codigo,titulo,ordem,uuid) VALUES ($versao,'A','A',1,UUID())");
        } catch (\mysqli_sql_exception $e) {
            $translated = (new DatabaseErrorTranslator())->translate($e);
        }

        self::assertNotNull($translated, 'O trigger de imutabilidade deveria disparar para o usuário da aplicação.');
        self::assertSame('VERSION_IMMUTABLE', $translated->errorCode->value);
    }
}
