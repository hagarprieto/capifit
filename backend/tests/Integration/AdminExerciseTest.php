<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** Cadastro, revisão e publicação de exercícios pelo admin, com auditoria (E03-05, E03-07; CT-72, CT-73, CT-75). */
final class AdminExerciseTest extends ApiTestCase
{
    private string $curator = '';
    private string $reviewer = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->curator = $this->makeAdmin($this->token, $this->userUuid);
        [$token, $uuid] = $this->newUser();
        $this->reviewer = $this->makeAdmin($token, $uuid);
    }

    private function makeAdmin(string $token, string $uuid): string
    {
        $this->kernel->db->execute('INSERT INTO usuarios_papeis(usuario_id, papel_id) SELECT id, 3 FROM usuarios WHERE uuid = ?', 's', $uuid);

        return $token;
    }

    /** @return array<string, mixed> */
    private function complete(string $name): array
    {
        $group = (string) $this->kernel->db->fetchOne('SELECT id FROM grupos_musculares ORDER BY id LIMIT 1')['id'];
        $equipment = (string) $this->kernel->db->fetchOne('SELECT id FROM equipamentos ORDER BY id LIMIT 1')['id'];

        return [
            'nome' => $name, 'equipamento_id' => $equipment, 'instrucoes' => '1. Posicione-se. 2. Execute o movimento com controle.', 'observacoes_seguranca' => 'Evite dor aguda.',
            'unilateral' => false, 'modalidade' => 'reps_carga', 'dificuldade' => 'iniciante', 'musculos' => [['grupo_id' => $group, 'papel' => 'primario']],
        ];
    }

    private function create(string $name): string
    {
        $r = $this->call('POST', '/admin/exercicios', $this->complete($name), null, true, $this->curator);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['id'];
    }

    public function testOnlyAdminsCanUseTheAdminRoutes(): void
    {
        [$student] = $this->newUser();
        foreach ([['POST', '/admin/exercicios', ['nome' => 'X']], ['PATCH', '/admin/exercicios/' . Uuid::v4(), ['nome' => 'X']], ['POST', '/admin/exercicios/' . Uuid::v4() . '/publicar', null], ['GET', '/admin/auditoria', null]] as [$method, $path, $body]) {
            self::assertSame(403, $this->call($method, $path, $body, null, true, $student)['status'], "$method $path");
        }
        self::assertSame(401, $this->call('GET', '/admin/auditoria', null, null, false)['status']);
    }

    public function testFullLifecycleMakesTheExerciseVisibleOnlyWhenPublished(): void
    {
        $uuid = $this->create('Elevação pélvica unilateral');
        self::assertSame(404, $this->call('GET', "/exercicios/$uuid", null, null, true, $this->curator)['status'], 'rascunho não aparece no catálogo');

        $submit = $this->call('POST', "/admin/exercicios/$uuid/enviar-revisao", null, null, true, $this->curator);
        self::assertSame(['em_revisao', null], [$submit['body']['data']['status'], $submit['body']['data']['revisado_em']], json_encode($submit['body']) ?: '');
        self::assertSame(409, $this->call('POST', "/admin/exercicios/$uuid/publicar", null, null, true, $this->reviewer)['status'], 'sem aprovação não publica');
        self::assertSame(404, $this->call('GET', "/exercicios/$uuid")['status']);

        $approve = $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'aprovar'], null, true, $this->reviewer);
        self::assertSame(200, $approve['status'], json_encode($approve['body']) ?: '');
        self::assertNotNull($approve['body']['data']['revisado_em']);
        self::assertSame('em_revisao', $approve['body']['data']['status'], 'aprovado, aguardando publicação');
        self::assertSame(404, $this->call('GET', "/exercicios/$uuid")['status'], 'aprovar ainda não publica');

        $publish = $this->call('POST', "/admin/exercicios/$uuid/publicar", null, null, true, $this->curator);
        self::assertSame('publicado', $publish['body']['data']['status'], json_encode($publish['body']) ?: '');

        $public = $this->call('GET', "/exercicios/$uuid");
        self::assertSame(200, $public['status']);
        self::assertStringContainsString('Execute o movimento', $public['body']['data']['instrucoes']);
        $found = $this->call('GET', '/exercicios?q=' . urlencode('pelvica'))['body']['data'];
        self::assertContains($uuid, array_column($found, 'id'));

        self::assertSame(409, $this->call('PATCH', "/admin/exercicios/$uuid", ['nome' => 'Outro'], null, true, $this->curator)['status'], 'publicado não se edita direto');
    }

    public function testCreatorCannotReviewAndRejectionNeedsAReasonAndReturnsToDraft(): void
    {
        $uuid = $this->create('Remada curvada com halteres');
        $this->call('POST', "/admin/exercicios/$uuid/enviar-revisao", null, null, true, $this->curator);

        self::assertSame(403, $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'aprovar'], null, true, $this->curator)['status'], 'quem cadastra não aprova');
        self::assertSame(422, $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'rejeitar'], null, true, $this->reviewer)['status'], 'rejeitar exige justificativa');
        self::assertSame(422, $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'talvez'], null, true, $this->reviewer)['status']);

        $reject = $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'rejeitar', 'justificativa' => 'Instrução sem o cuidado com a lombar.'], null, true, $this->reviewer);
        self::assertSame('rascunho', $reject['body']['data']['status']);
        self::assertSame(200, $this->call('PATCH', "/admin/exercicios/$uuid", ['observacoes_seguranca' => 'Mantenha a lombar neutra.'], null, true, $this->curator)['status'], 'volta a ser editável');
        self::assertSame(409, $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'aprovar'], null, true, $this->reviewer)['status'], 'fora de revisão não se revisa');
    }

    public function testSubmittingRequiresACompleteSheetAndPublishingRequiresTextInstructions(): void
    {
        $r = $this->call('POST', '/admin/exercicios', ['nome' => 'Incompleto'], null, true, $this->curator);
        $uuid = $r['body']['data']['id'];

        $submit = $this->call('POST', "/admin/exercicios/$uuid/enviar-revisao", null, null, true, $this->curator);
        self::assertSame(422, $submit['status']);
        self::assertEqualsCanonicalizing(['instrucoes', 'dificuldade', 'equipamento_id', 'musculos'], array_keys($submit['body']['error']['details']['fields']));
        self::assertSame('rascunho', $this->call('PATCH', "/admin/exercicios/$uuid", ['unilateral' => true], null, true, $this->curator)['body']['data']['status']);
    }

    public function testValidationAndNameUniqueness(): void
    {
        $name = 'Supino teste ' . bin2hex(random_bytes(3));
        $this->create($name);

        $dup = $this->call('POST', '/admin/exercicios', ['nome' => '  ' . strtoupper($name) . ' '], null, true, $this->curator);
        self::assertSame(422, $dup['status']);
        self::assertArrayHasKey('nome', $dup['body']['error']['details']['fields']);
        $synonym = $this->call('POST', '/admin/exercicios', ['nome' => 'Pulldown'], null, true, $this->curator);
        self::assertSame(422, $synonym['status'], 'sinônimo de um exercício do seed não pode virar outro exercício');

        foreach ([['nome' => ''], ['nome' => 'A', 'modalidade' => 'x'], ['nome' => 'A', 'dificuldade' => 'x'], ['nome' => 'A', 'equipamento_id' => '99999'], ['nome' => 'A', 'musculos' => [['grupo_id' => '99999', 'papel' => 'primario']]], ['nome' => 'A', 'musculos' => [['grupo_id' => '1', 'papel' => 'x']]], ['nome' => 'A', 'status' => 'publicado']] as $body) {
            self::assertSame(422, $this->call('POST', '/admin/exercicios', $body, null, true, $this->curator)['status'], json_encode($body) ?: '');
        }
        self::assertSame(404, $this->call('PATCH', '/admin/exercicios/' . Uuid::v4(), ['nome' => 'Z'], null, true, $this->curator)['status']);
        self::assertSame(422, $this->call('PATCH', '/admin/exercicios/' . $this->create('Outro exercício teste'), [], null, true, $this->curator)['status']);
    }

    public function testEveryStepIsAuditedWithoutLeakingContentAndTheTrailIsQueryable(): void
    {
        $uuid = $this->create('Búlgaro teste ' . bin2hex(random_bytes(3)));
        $this->call('POST', "/admin/exercicios/$uuid/enviar-revisao", null, null, true, $this->curator);
        $this->call('POST', "/admin/exercicios/$uuid/revisar", ['decisao' => 'rejeitar', 'justificativa' => 'Ajustar o texto.'], null, true, $this->reviewer);

        $trail = $this->call('GET', "/admin/auditoria?recurso=exercicio&recurso_id=$uuid", null, null, true, $this->reviewer);
        self::assertSame(200, $trail['status']);
        $items = $trail['body']['data'];
        self::assertSame(['exercicio.rejeitado', 'exercicio.enviado_revisao', 'exercicio.criado'], array_column($items, 'acao'), 'mais recente primeiro');
        self::assertSame($this->reviewerUuid(), $items[0]['ator_id']);
        self::assertArrayNotHasKey('metadados_json', $items[0], 'a justificativa fica guardada, mas não é devolvida na lista');

        $page = $this->call('GET', "/admin/auditoria?recurso=exercicio&recurso_id=$uuid&limit=2", null, null, true, $this->reviewer);
        self::assertCount(2, $page['body']['data']);
        $next = $this->call('GET', "/admin/auditoria?recurso=exercicio&recurso_id=$uuid&limit=2&cursor=" . urlencode((string) $page['body']['pagination']['next_cursor']), null, null, true, $this->reviewer);
        self::assertSame(['exercicio.criado'], array_column($next['body']['data'], 'acao'));
        self::assertSame(422, $this->call('GET', '/admin/auditoria?limit=0', null, null, true, $this->reviewer)['status']);
        self::assertSame(422, $this->call('GET', '/admin/auditoria?foo=1', null, null, true, $this->reviewer)['status']);
    }

    private function reviewerUuid(): string
    {
        return (string) $this->call('GET', '/me', null, null, true, $this->reviewer)['body']['data']['id'];
    }
}
