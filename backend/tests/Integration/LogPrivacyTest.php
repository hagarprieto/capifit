<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Kernel;
use CapiFit\Services\DataExportBuilder;
use CapiFit\Services\PrivacyWorkflow;
use CapiFit\Support\Uuid;
use Monolog\LogRecord;
use Monolog\Logger;

/**
 * CT-80 / RN-10 / E02-05: nenhum dado pessoal, de saúde, credencial ou token pode aparecer em log nem em resposta de erro,
 * em NENHUM fluxo. O log aqui é o bruto (sem o RedactingProcessor): o teste prova que o código não coloca esses dados no
 * log em primeiro lugar; o processador é só a segunda barreira.
 */
final class LogPrivacyTest extends ApiTestCase
{
    private const PASSWORD = 'senha-de-teste-bem-longa-42';

    /** @var list<string> valores que NUNCA podem aparecer em log */
    private array $secrets = [];

    private function mark(string $value): string
    {
        $this->secrets[] = $value;

        return $value;
    }

    private function logText(): string
    {
        return implode("\n", array_map(
            static fn (LogRecord $r): string => $r->message . ' ' . json_encode([$r->context, $r->extra, $r->channel], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $this->logs->getRecords(),
        ));
    }

    private function assertNoSecretInLogs(string $step): void
    {
        $text = $this->logText();
        foreach ($this->secrets as $secret) {
            self::assertStringNotContainsString($secret, $text, "vazou em log após: $step");
        }
    }

    public function testNoFlowLeaksPersonalHealthOrCredentialDataToTheLogs(): void
    {
        $tag = bin2hex(random_bytes(4));
        $email = $this->mark("pessoa.$tag@exemplo.invalid");
        $name = $this->mark("Fulana Privada $tag");
        $note = $this->mark("anotacao-privada-$tag");
        $health = $this->mark("lesao-de-ombro-$tag");
        $title = $this->mark("plano-intimo-$tag");
        $reason = $this->mark("justificativa-editorial-$tag");
        $storageKey = $this->mark("midias/privadas-$tag/video.mp4");
        $this->mark(self::PASSWORD);
        $this->mark('127.0.0.77');
        $server = ['REMOTE_ADDR' => '127.0.0.77'];

        // cadastro, login (certo e errado), renovação e reuso de refresh
        $reg = $this->call('POST', '/auth/register', ['nome' => $name, 'email' => $email, 'senha' => self::PASSWORD, 'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true], null, false, null, [], null, $server);
        self::assertSame(201, $reg['status']);
        $access = $this->mark($reg['body']['data']['access_token']);
        $refresh = $this->mark($reg['body']['data']['refresh_token']);
        $this->call('POST', '/auth/login', ['email' => $email, 'senha' => 'senha-errada-' . $tag], null, false, null, [], null, $server);
        $this->mark('senha-errada-' . $tag);
        $login = $this->call('POST', '/auth/login', ['email' => $email, 'senha' => self::PASSWORD], null, false, null, [], null, $server);
        $newRefresh = $this->mark($login['body']['data']['refresh_token']);
        $this->mark($login['body']['data']['access_token']);
        $this->call('POST', '/auth/refresh', ['refresh_token' => $refresh], null, false, null, [], null, $server);
        $this->call('POST', '/auth/refresh', ['refresh_token' => $refresh], null, false, null, [], null, $server);
        $this->call('POST', '/auth/refresh', ['refresh_token' => $newRefresh], null, false, null, [], null, $server);
        $this->call('POST', '/auth/refresh', ['refresh_token' => 'invalido-' . $tag], null, false, null, [], null, $server);
        $this->assertNoSecretInLogs('cadastro, login e refresh');

        // recuperação de senha: o e-mail com o token vai para o Mailer, nunca para o log
        $this->call('POST', '/auth/password/forgot', ['email' => $email], null, false, null, [], null, $server);
        $this->call('POST', '/auth/password/forgot', ['email' => "inexistente.$tag@exemplo.invalid"], null, false, null, [], null, $server);
        $this->mark("inexistente.$tag@exemplo.invalid");
        $this->mark($this->mailer->lastToken($email));
        $this->call('POST', '/auth/password/reset', ['token' => 'token-invalido-' . $tag, 'nova_senha' => 'outra-senha-' . $tag], null, false, null, [], null, $server);
        $this->mark('token-invalido-' . $tag);
        $this->mark('outra-senha-' . $tag);
        $this->assertNoSecretInLogs('recuperação de senha');

        // perfil, restrições de saúde, sessão com anotação, programa, consentimento, dispositivo, sincronização
        $this->call('PUT', '/me/perfil-treinamento', ['nivel' => 'iniciante', 'restricoes' => ['areas' => ['ombro'], 'condicoes' => [], 'dor_atual' => true, 'observacao_livre' => $health]], null, true, $access, [], null, $server);
        $this->call('PUT', '/me/perfil-treinamento', ['nivel' => 'invalido', 'restricoes' => ['areas' => 'x', 'observacao_livre' => $health]], null, true, $access, [], null, $server);
        $session = $this->open($access);
        $this->call('PATCH', "/me/sessoes/$session", ['observacoes' => $note], null, true, $access, [], null, $server);
        $this->call('POST', '/me/programas', ['titulo' => $title, 'objetivo' => 'Hipertrofia'], Uuid::v4(), true, $access, [], null, $server);
        $this->call('POST', '/me/programas', ['titulo' => str_repeat($title, 60)], Uuid::v4(), true, $access, [], null, $server);
        $this->call('POST', '/me/consentimentos', ['tipo' => 'dados_saude', 'versao_documento' => '1'], null, true, $access, [], null, $server);
        $device = Uuid::v4();
        $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $device], null, true, $access, [], null, $server);
        $this->call('POST', '/sync/push', ['dispositivo_uuid' => $device, 'operacoes' => [
            ['operacao_uuid' => Uuid::v4(), 'entidade' => 'sessao_treino', 'entidade_uuid' => Uuid::v4(), 'tipo' => 'atualizar', 'payload' => ['observacoes' => $note]],
            ['operacao_uuid' => Uuid::v4(), 'entidade' => 'sessao_treino', 'entidade_uuid' => Uuid::v4(), 'tipo' => 'criar', 'payload' => ['titulo_avulso' => $title, 'iniciada_em' => 'ontem']],
        ]], null, true, $access, [], null, $server);
        $this->call('POST', '/me/sessoes/' . Uuid::v4() . '/concluir', ['encerrada_em' => $note], Uuid::v4(), true, $access, [], null, $server);
        $this->assertNoSecretInLogs('perfil, sessão, programa, consentimento, dispositivo e sync');

        // admin: exercício, rejeição com justificativa, mídia com chave de storage
        $this->kernel->db->execute('INSERT INTO usuarios_papeis(usuario_id, papel_id) SELECT id, 3 FROM usuarios WHERE uuid = ?', 's', $reg['body']['data']['usuario']['id']);
        [$other, $otherUuid] = $this->newUser();
        $this->kernel->db->execute('INSERT INTO usuarios_papeis(usuario_id, papel_id) SELECT id, 3 FROM usuarios WHERE uuid = ?', 's', $otherUuid);
        $group = (string) $this->kernel->db->fetchOne('SELECT id FROM grupos_musculares ORDER BY id LIMIT 1')['id'];
        $equipment = (string) $this->kernel->db->fetchOne('SELECT id FROM equipamentos ORDER BY id LIMIT 1')['id'];
        $exercise = $this->call('POST', '/admin/exercicios', ['nome' => "Exercício log $tag", 'equipamento_id' => $equipment, 'instrucoes' => 'Execute com controle.', 'dificuldade' => 'iniciante', 'musculos' => [['grupo_id' => $group, 'papel' => 'primario']]], null, true, $access, [], null, $server)['body']['data']['id'];
        $this->call('POST', "/admin/exercicios/$exercise/enviar-revisao", null, null, true, $access, [], null, $server);
        $this->call('POST', "/admin/exercicios/$exercise/revisar", ['decisao' => 'rejeitar', 'justificativa' => $reason], null, true, $other, [], null, $server);
        $this->call('POST', "/admin/exercicios/$exercise/midias", ['tipo' => 'imagem', 'storage_key' => $storageKey], null, true, $access, [], null, $server);
        $this->call('POST', "/admin/exercicios/$exercise/midias", ['tipo' => 'imagem', 'storage_key' => '../' . $storageKey], null, true, $access, [], null, $server);
        $this->assertNoSecretInLogs('admin');

        // exportação e exclusão (workflow interno)
        $this->call('POST', '/me/solicitacoes', ['tipo' => 'exportacao'], null, true, $access, [], null, $server);
        $this->call('POST', '/me/solicitacoes', ['tipo' => 'exclusao', 'senha' => 'senha-errada-' . $tag], null, true, $access, [], null, $server);
        $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'capifit-log-' . $tag;
        (new PrivacyWorkflow($this->kernel->db, Config::fromArray(['EXPORT_DIR' => $dir]), new DataExportBuilder($this->kernel->db)))->run();
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($dir);
        $this->call('POST', '/me/solicitacoes', ['tipo' => 'exclusao', 'senha' => self::PASSWORD], null, true, $access, [], null, $server);
        (new PrivacyWorkflow($this->kernel->db, Config::fromArray(['EXPORT_DIR' => $dir]), new DataExportBuilder($this->kernel->db)))->run();
        $this->assertNoSecretInLogs('exportação e exclusão');

        self::assertNotEmpty($this->logs->getRecords(), 'o teste só vale se o fluxo realmente gerou logs (acesso, reuso de refresh, e-mail)');
    }

    public function testResponsesToBadRequestsNeverEchoTheSubmittedValuesBack(): void
    {
        $tag = bin2hex(random_bytes(4));
        $health = "condicao-sigilosa-$tag";
        $note = "texto-privado-$tag";
        $cases = [
            ['PUT', '/me/perfil-treinamento', ['nivel' => 'x', 'restricoes' => ['areas' => 'x', 'observacao_livre' => $health]]],
            ['PATCH', '/me', ['nome' => str_repeat($note, 40), 'idioma' => $note]],
            ['POST', '/me/programas', ['titulo' => str_repeat($note, 40)]],
            ['POST', '/me/consentimentos', ['tipo' => $note, 'versao_documento' => $note]],
            ['POST', '/sync/push', ['dispositivo_uuid' => $note, 'operacoes' => [['payload' => ['observacoes' => $note]]]]],
            ['POST', '/me/solicitacoes', ['tipo' => 'exclusao', 'senha' => $note]],
        ];
        foreach ($cases as [$method, $path, $body]) {
            $r = $this->call($method, $path, $body, Uuid::v4());
            self::assertGreaterThanOrEqual(400, $r['status'], "$method $path");
            $json = json_encode($r['body'], JSON_UNESCAPED_UNICODE) ?: '';
            self::assertStringNotContainsString($health, $json, "$method $path devolveu o dado de saúde");
            self::assertStringNotContainsString($note, $json, "$method $path devolveu o texto enviado");
            self::assertStringNotContainsStringIgnoringCase('select ', $json);
            self::assertStringNotContainsStringIgnoringCase('mysqli', $json);
            self::assertStringNotContainsString('.php', $json);
        }
    }

    public function testAnInfrastructureFailureLogsOnlyTheClassAndCodeNotTheConnectionDetails(): void
    {
        $user = 'usuario-secreto-' . bin2hex(random_bytes(3));
        $broken = new Kernel(
            Config::fromArray([
                'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789', 'DB_HOST' => (string) getenv('DB_HOST'), 'DB_PORT' => (string) getenv('DB_PORT'),
                'DB_NAME' => (string) getenv('DB_NAME'), 'DB_USER' => $user, 'DB_PASSWORD' => 'senha-secreta-de-conexao',
            ]),
            new Logger('t', [$this->logs]),
            $this->mailer,
        );
        $r = $this->call('GET', '/exercicios', null, null, true, null, [], $broken);

        self::assertGreaterThanOrEqual(401, $r['status']);
        $text = $this->logText();
        self::assertStringNotContainsString($user, $text);
        self::assertStringNotContainsString('senha-secreta-de-conexao', $text);
        self::assertStringNotContainsStringIgnoringCase('access denied', $text);
        $broken->db->close();
    }
}
