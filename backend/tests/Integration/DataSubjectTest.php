<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Services\DataExportBuilder;
use CapiFit\Services\PrivacyWorkflow;
use CapiFit\Support\MediaUrlSigner;
use CapiFit\Support\Uuid;

/** Pedidos do titular: exportação e exclusão de conta, com o workflow interno (E02-02; LGPD, RG-021). */
final class DataSubjectTest extends ApiTestCase
{
    private const PASSWORD = 'senha-de-teste-bem-longa-42';
    private const SECRET = 'segredo-de-teste-de-exportacao-com-mais-de-32-bytes';
    private string $dir = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'capifit-export-' . bin2hex(random_bytes(4));
        $this->kernel->db->close();
        $this->kernel = $this->makeKernel(['EXPORT_BASE_URL' => 'https://files.exemplo.invalid/privado', 'EXPORT_SIGNING_SECRET' => self::SECRET, 'EXPORT_URL_TTL' => '300']);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->dir);
        parent::tearDown();
    }

    /** @return array{exportacoes: int, exclusoes: int, falhas: int} */
    private function runWorkflow(?string $dir = null): array
    {
        $config = Config::fromArray(['EXPORT_DIR' => $dir ?? $this->dir]);

        return (new PrivacyWorkflow($this->kernel->db, $config, new DataExportBuilder($this->kernel->db)))->run();
    }

    private function fillAccount(): void
    {
        $this->call('PUT', '/me/perfil-treinamento', ['nivel' => 'iniciante', 'objetivo' => 'hipertrofia', 'dias_semana' => 3, 'minutos_sessao' => 60, 'preferencias' => [], 'restricoes' => ['areas' => ['joelho'], 'condicoes' => [], 'dor_atual' => false]]);
        $session = $this->open();
        $item = $this->addItem($session, 'Supino reto ' . bin2hex(random_bytes(2)));
        $series = $this->addSeriesTo($session, $item['id']);
        $this->doSeries($session, $series, 42.5, 10);
        $this->call('PATCH', "/me/sessoes/$session", ['observacoes' => 'Dor leve no ombro direito.']);
        $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());
        self::assertSame(201, $this->call('POST', '/me/programas', ['titulo' => 'Meu plano pessoal'], Uuid::v4())['status']);
    }

    public function testExportRequestIsTrackedIsNotDuplicatedAndProducesAPrivateFileWithASignedLink(): void
    {
        $this->fillAccount();
        $first = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao']);
        $again = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao']);
        $id = $first['body']['data']['id'];

        self::assertSame([201, 201], [$first['status'], $again['status']]);
        self::assertSame($id, $again['body']['data']['id'], 'um pedido ativo não se duplica');
        self::assertSame(['exportacao', 'solicitada', null, null], [$first['body']['data']['tipo'], $first['body']['data']['estado'], $first['body']['data']['concluida_em'], $first['body']['data']['download_url']]);

        $result = $this->runWorkflow();
        self::assertSame(1, $result['exportacoes']);
        $done = $this->call('GET', "/me/solicitacoes/$id")['body']['data'];
        self::assertSame('concluida', $done['estado']);
        self::assertNotNull($done['concluida_em']);

        $parts = parse_url((string) $done['download_url']);
        parse_str((string) $parts['query'], $query);
        self::assertSame("/privado/exports/$id.json", $parts['path']);
        self::assertTrue((new MediaUrlSigner('https://files.exemplo.invalid/privado', self::SECRET, 300))->verify("exports/$id.json", (int) $query['exp'], $query['sig']));

        $raw = file_get_contents($this->dir . DIRECTORY_SEPARATOR . "$id.json");
        self::assertIsString($raw);
        $export = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(DataExportBuilder::SCHEMA, $export['schema']);
        self::assertSame($this->userEmail, $export['conta']['email']);
        self::assertSame(['joelho'], $export['perfil_treinamento']['restricoes']['areas']);
        self::assertSame('Dor leve no ombro direito.', $export['sessoes'][0]['observacoes']);
        self::assertSame(42.5, $export['sessoes'][0]['exercicios'][0]['series'][0]['carga_kg']);
        self::assertSame('Meu plano pessoal', $export['programas'][0]['titulo']);
        self::assertEqualsCanonicalizing(['termos_uso', 'politica_privacidade'], array_column($export['consentimentos'], 'tipo'));
        self::assertStringNotContainsString('argon2', $raw, 'hash de senha nunca vai para o arquivo');
        self::assertStringNotContainsString('senha_hash', $raw);
        self::assertStringNotContainsString('refresh', $raw);

        self::assertSame(0, array_sum($this->runWorkflow()), 'rodar de novo não reprocessa');
        self::assertSame(200, $this->call('GET', '/me')['status'], 'exportar não suspende a conta');
        self::assertCount(1, $this->call('GET', '/me/solicitacoes')['body']['data']);
    }

    public function testRequestsBelongToTheirOwnerAndAreValidated(): void
    {
        $id = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao'])['body']['data']['id'];
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('GET', "/me/solicitacoes/$id", null, null, true, $other)['status']);
        self::assertSame(404, $this->call('GET', '/me/solicitacoes/nao-e-uuid')['status']);
        self::assertSame([], $this->call('GET', '/me/solicitacoes', null, null, true, $other)['body']['data']);
        foreach ([[], ['tipo' => 'apagar'], ['tipo' => 'exportacao', 'senha' => self::PASSWORD], ['tipo' => 'exportacao', 'usuario_id' => 1], ['tipo' => 'exclusao'], ['tipo' => 'exclusao', 'senha' => '']] as $body) {
            self::assertSame(422, $this->call('POST', '/me/solicitacoes', $body)['status'], json_encode($body) ?: '');
        }
        self::assertSame(401, $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao'], null, false)['status']);
    }

    public function testDeletionNeedsThePasswordCutsAccessAtOnceAndIsAnonymizedByTheWorkflow(): void
    {
        $this->fillAccount();
        $wrong = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exclusao', 'senha' => 'senha-errada-qualquer-123']);
        self::assertSame(422, $wrong['status']);
        self::assertArrayHasKey('senha', $wrong['body']['error']['details']['fields']);
        self::assertSame(200, $this->call('GET', '/me')['status'], 'senha errada não suspende nada');

        $refresh = $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => self::PASSWORD], null, false)['body']['data']['refresh_token'];
        $ok = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exclusao', 'senha' => self::PASSWORD]);
        self::assertSame(201, $ok['status'], json_encode($ok['body']) ?: '');
        self::assertSame(['exclusao', 'solicitada'], [$ok['body']['data']['tipo'], $ok['body']['data']['estado']]);

        self::assertSame(401, $this->call('GET', '/me')['status'], 'acesso revogado na hora');
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $refresh], null, false)['status']);
        self::assertSame(401, $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => self::PASSWORD], null, false)['status']);

        self::assertSame(1, $this->runWorkflow()['exclusoes']);
        $db = $this->kernel->db;
        $user = $db->fetchOne('SELECT id, nome, email, estado, senha_hash, excluido_em FROM usuarios WHERE uuid = ?', 's', $this->userUuid);
        self::assertSame(['Conta excluída', 'excluido', null], [$user['nome'], $user['estado'], $user['senha_hash']]);
        self::assertNotNull($user['excluido_em']);
        self::assertStringNotContainsString($this->userEmail, (string) $user['email']);
        $id = (int) $user['id'];
        self::assertSame(0, (int) $db->fetchOne('SELECT COUNT(*) AS n FROM perfis_treinamento WHERE usuario_id = ?', 'i', $id)['n'], 'perfil e restrições de saúde removidos');
        self::assertSame(0, (int) $db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_autenticacao WHERE usuario_id = ?', 'i', $id)['n']);
        self::assertSame(0, (int) $db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_treino WHERE aluno_id = ? AND (observacoes IS NOT NULL OR titulo_avulso IS NOT NULL)', 'i', $id)['n'], 'anotações livres removidas');
        self::assertSame(['Programa excluído', 'arquivado'], array_values((array) $db->fetchOne('SELECT titulo, status FROM programas_treino WHERE aluno_id = ?', 'i', $id)));
        self::assertSame(2, (int) $db->fetchOne('SELECT COUNT(*) AS n FROM consentimentos_privacidade WHERE usuario_id = ?', 'i', $id)['n'], 'o registro dos consentimentos permanece como prova');
        self::assertSame('concluida', $db->fetchOne('SELECT estado FROM solicitacoes_titular WHERE usuario_id = ?', 'i', $id)['estado']);
        self::assertSame(1, (int) $db->fetchOne("SELECT COUNT(*) AS n FROM auditoria_eventos WHERE acao = 'titular.conta_anonimizada' AND recurso_id = ?", 's', $this->userUuid)['n']);

        // o e-mail original fica livre: a pessoa pode se cadastrar de novo
        $again = $this->call('POST', '/auth/register', [
            'nome' => 'Voltei', 'email' => $this->userEmail, 'senha' => self::PASSWORD,
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true,
        ], null, false);
        self::assertSame(201, $again['status'], json_encode($again['body']) ?: '');
        self::assertSame(0, array_sum($this->runWorkflow()), 'nada mais a processar');
    }

    public function testAFailedRunPutsTheRequestBackForTheNextRound(): void
    {
        $id = $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao'])['body']['data']['id'];
        $blocker = tempnam(sys_get_temp_dir(), 'capifit');
        self::assertIsString($blocker);

        try {
            $failed = $this->runWorkflow($blocker . DIRECTORY_SEPARATOR . 'sub'); // a "pasta" tem um arquivo no caminho
            self::assertSame(1, $failed['falhas']);
            self::assertSame('solicitada', $this->call('GET', "/me/solicitacoes/$id")['body']['data']['estado']);
        } finally {
            @unlink($blocker);
        }
        self::assertSame(1, $this->runWorkflow()['exportacoes'], 'na rodada seguinte, com a pasta certa, conclui');
    }
}
