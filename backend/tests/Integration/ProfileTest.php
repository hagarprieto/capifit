<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

/** Conta (`PATCH /me`) e perfil de treino (E01-04). */
final class ProfileTest extends ApiTestCase
{
    public function testAccountCanBeUpdatedAndInputIsNormalized(): void
    {
        $r = $this->call('PATCH', '/me', ['nome' => '  Ana Conceição  ', 'fuso_horario' => 'America/Sao_Paulo', 'unidade_peso' => 'lb', 'idioma' => 'pt-BR']);
        $data = $r['body']['data'];

        self::assertSame(200, $r['status']);
        self::assertSame('Ana Conceição', $data['nome']);
        self::assertSame('America/Sao_Paulo', $data['fuso_horario']);
        self::assertSame('lb', $data['unidade_peso']);
        self::assertSame($this->userEmail, $data['email'], 'o e-mail não muda por aqui');
        self::assertSame($data, $this->call('GET', '/me')['body']['data'], 'GET /me reflete a alteração');

        $partial = $this->call('PATCH', '/me', ['unidade_peso' => 'kg']);
        self::assertSame('kg', $partial['body']['data']['unidade_peso']);
        self::assertSame('Ana Conceição', $partial['body']['data']['nome'], 'campos não enviados permanecem');
    }

    public function testAccountValidationRejectsBadAndPrivilegedFields(): void
    {
        $bad = [
            [['nome' => '   '], 'nome'], [['nome' => str_repeat('a', 161)], 'nome'], [['fuso_horario' => 'Marte/Olympus'], 'fuso_horario'],
            [['fuso_horario' => 'sao paulo'], 'fuso_horario'], [['unidade_peso' => 'stone'], 'unidade_peso'], [['idioma' => 'portugues'], 'idioma'],
            [['email' => 'outro@exemplo.invalid'], 'email'], [['papeis' => ['admin']], 'papeis'], [['estado' => 'ativo'], 'estado'], [['senha_hash' => 'x'], 'senha_hash'],
        ];
        foreach ($bad as [$body, $field]) {
            $r = $this->call('PATCH', '/me', $body);
            self::assertSame(422, $r['status'], $field);
            self::assertArrayHasKey($field, $r['body']['error']['details']['fields'], $field);
        }
        self::assertSame(422, $this->call('PATCH', '/me', [])['status'], 'corpo vazio');

        $unchanged = $this->call('GET', '/me')['body']['data'];
        self::assertSame(['aluno'], $unchanged['papeis'], 'não é possível se promover pelo PATCH');
        self::assertSame('Teste', $unchanged['nome']);
    }

    public function testProfileRoutesRequireAuthentication(): void
    {
        foreach ([['PATCH', '/me'], ['GET', '/me/perfil-treinamento'], ['PUT', '/me/perfil-treinamento']] as [$method, $path]) {
            self::assertSame(401, $this->call($method, $path, $method === 'GET' ? null : [], null, false)['status'], "$method $path");
        }
    }

    public function testTrainingProfileStartsMissingThenIsCreatedAndFullyReplaced(): void
    {
        self::assertSame(404, $this->call('GET', '/me/perfil-treinamento')['status']);

        $full = [
            'nivel' => 'intermediario', 'objetivo' => 'hipertrofia', 'dias_semana' => 4, 'minutos_sessao' => 60,
            'preferencias' => ['evitar_exercicios_ids' => [], 'tema' => 'escuro'],
            'restricoes' => ['areas' => ['ombro', 'joelho'], 'condicoes' => ['hipertensao'], 'dor_atual' => false, 'observacao_livre' => 'x'],
        ];
        $created = $this->call('PUT', '/me/perfil-treinamento', $full);
        self::assertSame(200, $created['status'], json_encode($created['body']) ?: '');
        self::assertEquals($full, $created['body']['data']);
        self::assertEquals($full, $this->call('GET', '/me/perfil-treinamento')['body']['data']);

        $replaced = $this->call('PUT', '/me/perfil-treinamento', ['nivel' => 'iniciante', 'dias_semana' => 3]);
        self::assertSame(
            ['nivel' => 'iniciante', 'objetivo' => null, 'dias_semana' => 3, 'minutos_sessao' => null, 'preferencias' => null, 'restricoes' => null],
            $replaced['body']['data'],
            'PUT substitui o perfil: o que não foi enviado vira nulo',
        );
        self::assertSame(1, (int) $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM perfis_treinamento WHERE usuario_id = (SELECT id FROM usuarios WHERE uuid = ?)', 's', $this->userUuid)['n']);
    }

    public function testTrainingProfileValidation(): void
    {
        $cases = [
            'nivel' => ['nivel' => 'mestre'], 'objetivo' => ['objetivo' => 'emagrecer'], 'dias_semana' => ['dias_semana' => 8],
            'minutos_sessao' => ['minutos_sessao' => 9], 'preferencias' => ['preferencias' => ['a', 'b']],
            'restricoes' => ['restricoes' => ['areas' => ['ombro', 'cabeca']]],
        ];
        foreach ($cases as $field => $body) {
            $r = $this->call('PUT', '/me/perfil-treinamento', $body);
            self::assertSame(422, $r['status'], $field);
            self::assertArrayHasKey($field, $r['body']['error']['details']['fields'], $field);
        }
        foreach ([['dias_semana' => '3'], ['dias_semana' => 2.5], ['restricoes' => ['dor_atual' => 'sim']], ['restricoes' => ['condicoes' => [1, 2]]], ['restricoes' => 'texto'], ['usuario_id' => 1]] as $bad) {
            self::assertSame(422, $this->call('PUT', '/me/perfil-treinamento', $bad)['status'], json_encode($bad) ?: '');
        }
        $tooBig = $this->call('PUT', '/me/perfil-treinamento', ['preferencias' => ['x' => str_repeat('a', 5000)]]);
        self::assertSame(422, $tooBig['status']);
        self::assertSame(404, $this->call('GET', '/me/perfil-treinamento')['status'], 'nenhuma tentativa inválida criou perfil');
    }

    public function testProfilesArePrivateAndHealthDataNeverReachesTheLogsOrErrors(): void
    {
        $this->call('PUT', '/me/perfil-treinamento', ['nivel' => 'iniciante', 'restricoes' => ['areas' => ['lombar'], 'condicoes' => ['gestacao-secreta-123']]]);
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('GET', '/me/perfil-treinamento', null, null, true, $other)['status'], 'outro usuário não vê o perfil');

        $invalid = $this->call('PUT', '/me/perfil-treinamento', ['restricoes' => ['areas' => ['lombar', 'dado-de-saude-invalido']]]);
        self::assertStringNotContainsString('dado-de-saude-invalido', json_encode($invalid['body'], JSON_THROW_ON_ERROR), 'o erro não ecoa o conteúdo enviado');

        $logs = json_encode(array_map(static fn ($r) => [$r->message, $r->context, $r->extra], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        foreach (['gestacao-secreta-123', 'lombar', 'dado-de-saude-invalido'] as $secret) {
            self::assertStringNotContainsString($secret, $logs);
        }
    }
}
