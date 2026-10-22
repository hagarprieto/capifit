<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** `POST /sync/push`: lote idempotente de operações offline (E08-04; CT-33…CT-38, API-10, API-12). */
final class SyncPushTest extends ApiTestCase
{
    private string $device = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->device = Uuid::v4();
        self::assertSame(201, $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $this->device])['status']);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function op(string $entity, string $uuid, string $type, array $payload, ?int $sequence = null, ?string $operation = null): array
    {
        return ['operacao_uuid' => $operation ?? Uuid::v4(), 'entidade' => $entity, 'entidade_uuid' => $uuid, 'tipo' => $type, 'payload' => $payload] + ($sequence === null ? [] : ['sequencia_cliente' => $sequence]);
    }

    /**
     * @param list<array<string, mixed>> $operations
     * @return array{status: int, body: array<string, mixed>}
     */
    private function push(array $operations, ?string $device = null, ?string $token = null): array
    {
        $r = $this->call('POST', '/sync/push', ['dispositivo_uuid' => $device ?? $this->device, 'operacoes' => $operations], null, true, $token);

        return ['status' => $r['status'], 'body' => $r['body']];
    }

    /**
     * @param array{status: int, body: array<string, mixed>} $response
     * @return list<array<string, mixed>>
     */
    private function results(array $response): array
    {
        self::assertSame(200, $response['status'], json_encode($response['body']) ?: '');

        return $response['body']['data']['resultados'];
    }

    public function testOfflineSessionIsReplayedInOrderWithTheClientUuids(): void
    {
        $exercise = $this->published('Supino reto');
        $session = Uuid::v4();
        $item = Uuid::v4();
        $series = Uuid::v4();
        $pause = Uuid::v4();
        $r = $this->push([
            $this->op('sessao_treino', $session, 'criar', ['tipo' => 'avulso', 'titulo_avulso' => 'Treino offline', 'iniciada_em' => $this->iso(1800), 'exercicios' => [
                ['uuid' => $item, 'exercicio_uuid' => $exercise, 'tipo_item' => 'adicionado', 'ordem' => 1, 'series' => [['uuid' => $series, 'ordem' => 1, 'tipo' => 'normal']]],
            ]], 1),
            $this->op('sessao_serie', $series, 'atualizar', ['sessao_uuid' => $session, 'carga_kg' => 42.5, 'repeticoes' => 10, 'status' => 'realizada', 'atualizado_cliente_em' => $this->iso(1500)], 2),
            $this->op('sessao_pausa', $pause, 'criar', ['sessao_uuid' => $session, 'iniciada_em' => $this->iso(1400)], 3),
            $this->op('sessao_pausa', $pause, 'atualizar', ['sessao_uuid' => $session, 'encerrada_em' => $this->iso(1300)], 4),
            $this->op('sessao_treino', $session, 'concluir', ['encerrada_em' => $this->iso(900)], 5),
        ]);

        $results = $this->results($r);
        self::assertSame(['aplicada', 'aplicada', 'aplicada', 'aplicada', 'aplicada'], array_column($results, 'resultado'), json_encode($results) ?: '');
        self::assertSame($session, $results[0]['recurso_uuid']);

        $saved = $this->call('GET', "/me/sessoes/$session")['body']['data'];
        self::assertSame(['concluida', 'Treino offline'], [$saved['status'], $saved['titulo']]);
        self::assertSame($item, $saved['exercicios'][0]['id'], 'os UUIDs do cliente foram preservados');
        self::assertSame($series, $saved['exercicios'][0]['series'][0]['id']);
        self::assertSame(['realizada', 42.5, 10], [$saved['exercicios'][0]['series'][0]['status'], $saved['exercicios'][0]['series'][0]['carga_kg'], $saved['exercicios'][0]['series'][0]['repeticoes']]);
        self::assertSame($pause, $saved['pausas'][0]['id']);
        self::assertSame(1800 - 900 - 100, $saved['duracao_ativa_segundos'], 'a pausa de 100 s é descontada');
        self::assertNotNull($this->call('GET', '/me/dispositivos')['body']['data'][0]['ultima_sync_em']);
    }

    public function testOperationsAreOrderedBySequenceAndResultsKeepTheRequestOrder(): void
    {
        $session = Uuid::v4();
        $first = $this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(600)], 1);
        $second = $this->op('sessao_treino', $session, 'concluir', ['encerrada_em' => $this->iso(60)], 2);

        $results = $this->results($this->push([$second, $first]));

        self::assertSame([$second['operacao_uuid'], $first['operacao_uuid']], array_column($results, 'operacao_uuid'));
        self::assertSame(['aplicada', 'aplicada'], array_column($results, 'resultado'), 'a criação rodou antes da conclusão');
        self::assertSame('concluida', $this->call('GET', "/me/sessoes/$session")['body']['data']['status']);
    }

    public function testRepeatingTheSameBatchChangesNothingAndReturnsTheStoredResults(): void
    {
        $session = Uuid::v4();
        $ops = [
            $this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(600)], 1),
            $this->op('sessao_treino', $session, 'concluir', ['encerrada_em' => $this->iso(300)], 2),
        ];
        $first = $this->results($this->push($ops));
        $again = $this->results($this->push($ops));

        self::assertEquals($first, $again);
        self::assertSame(1, (int) $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_treino WHERE uuid = ?', 's', $session)['n']);
        self::assertSame(2, (int) $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM operacoes_sync WHERE entidade_uuid = ?', 's', $session)['n']);
    }

    public function testSameOperationUuidWithDifferentContentIsAConflict(): void
    {
        $session = Uuid::v4();
        $operation = Uuid::v4();
        $this->results($this->push([$this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(600)], null, $operation)]));

        $r = $this->results($this->push([$this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(600), 'titulo_avulso' => 'Outro'], null, $operation)]));

        self::assertSame('conflito', $r[0]['resultado']);
        self::assertSame('IDEMPOTENCY_KEY_REUSED', $r[0]['erro']['code']);
    }

    public function testKeyOrderInThePayloadDoesNotChangeTheIdentityOfAnOperation(): void
    {
        $session = Uuid::v4();
        $operation = Uuid::v4();
        $a = $this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(600), 'titulo_avulso' => 'X'], null, $operation);
        $b = $this->op('sessao_treino', $session, 'criar', ['titulo_avulso' => 'X', 'iniciada_em' => $a['payload']['iniciada_em']], null, $operation);

        $first = $this->results($this->push([$a]));
        $second = $this->results($this->push([$b]));

        self::assertSame('aplicada', $second[0]['resultado']);
        self::assertEquals($first, $second);
    }

    public function testWritingToAClosedSessionIsAConflictAndInvalidDataIsRejected(): void
    {
        $session = $this->open();
        $item = $this->addItem($session);
        $series = $this->addSeriesTo($session, $item['id']);
        $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());

        $late = $this->results($this->push([$this->op('sessao_serie', $series, 'atualizar', ['sessao_uuid' => $session, 'carga_kg' => 50, 'repeticoes' => 8, 'status' => 'realizada', 'atualizado_cliente_em' => $this->iso(10)])]));
        self::assertSame('conflito', $late[0]['resultado']);
        self::assertSame('SESSION_CLOSED', $late[0]['erro']['code']);
        self::assertSame(['sessao_uuid' => $session, 'status' => 'concluida'], $late[0]['estado_servidor']);

        $bad = $this->results($this->push([
            $this->op('sessao_serie', Uuid::v4(), 'atualizar', ['sessao_uuid' => Uuid::v4(), 'repeticoes' => 8]),
            $this->op('sessao_serie', Uuid::v4(), 'atualizar', ['repeticoes' => 8]),
            $this->op('sessao_treino', Uuid::v4(), 'criar', ['iniciada_em' => 'ontem']),
            $this->op('sessao_pausa', Uuid::v4(), 'concluir', []),
        ]));
        self::assertSame(['rejeitada', 'rejeitada', 'rejeitada', 'rejeitada'], array_column($bad, 'resultado'));
        self::assertSame(['RESOURCE_NOT_FOUND', 'VALIDATION_ERROR', 'VALIDATION_ERROR', 'VALIDATION_ERROR'], array_map(static fn (array $x): string => $x['erro']['code'], $bad));
        self::assertSame(1, (int) $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_treino s JOIN usuarios u ON u.id = s.aluno_id WHERE u.uuid = ?', 's', $this->userUuid)['n'], 'nada foi criado pelas inválidas');
    }

    public function testCreatingASessionWhileAnotherIsOpenIsAConflictThatPointsToTheOpenOne(): void
    {
        $open = $this->open();

        $r = $this->results($this->push([$this->op('sessao_treino', Uuid::v4(), 'criar', ['iniciada_em' => $this->iso(60)])]));

        self::assertSame(['conflito', 'SESSION_ALREADY_OPEN'], [$r[0]['resultado'], $r[0]['erro']['code']]);
        self::assertSame(['sessao_uuid' => $open], $r[0]['estado_servidor']);
    }

    public function testProgrammedSnapshotIsValidatedAgainstTheFicha(): void
    {
        $a = $this->published('Supino');
        $b = $this->published('Crucifixo');
        $program = $this->call('POST', '/me/programas', ['titulo' => 'P'], Uuid::v4())['body']['data']['id'];
        $this->call('PUT', "/programas/$program/versoes/1/estrutura", ['expected_revision' => 1, 'fichas' => [['codigo' => 'A', 'titulo' => 'A', 'ordem' => 1, 'exercicios' => [
            ['exercicio_uuid' => $a, 'ordem' => 1, 'series' => [['ordem' => 1, 'tipo' => 'normal', 'reps_min' => 8, 'reps_max' => 10]]],
        ]]]]);
        $this->call('POST', "/programas/$program/versoes/1/publicar", null, Uuid::v4());
        $ficha = $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0];
        $feUuid = $ficha['exercicios'][0]['id'];
        $spUuid = $ficha['exercicios'][0]['series'][0]['id'];

        $snapshot = fn (string $exercise, string $type, ?string $fe, ?string $sp, array $extra = []): array => ['tipo' => 'programado', 'ficha_uuid' => $ficha['id'], 'iniciada_em' => $this->iso(300), 'exercicios' => [
            ['uuid' => Uuid::v4(), 'ficha_exercicio_uuid' => $fe, 'exercicio_uuid' => $exercise, 'tipo_item' => $type, 'ordem' => 1] + $extra + ['series' => [['uuid' => Uuid::v4(), 'serie_prescrita_uuid' => $sp, 'ordem' => 1, 'tipo' => 'normal']]],
        ]];

        $wrongExercise = $this->results($this->push([$this->op('sessao_treino', Uuid::v4(), 'criar', $snapshot($b, 'prescrito', $feUuid, $spUuid))]));
        self::assertSame('rejeitada', $wrongExercise[0]['resultado']);
        self::assertArrayHasKey('exercicios.0.exercicio_uuid', $wrongExercise[0]['erro']['details']['fields']);

        $foreignSeries = $this->results($this->push([$this->op('sessao_treino', Uuid::v4(), 'criar', $snapshot($a, 'prescrito', $feUuid, Uuid::v4()))]));
        self::assertArrayHasKey('exercicios.0.series.0.serie_prescrita_uuid', $foreignSeries[0]['erro']['details']['fields']);

        $ok = Uuid::v4();
        $good = $this->results($this->push([$this->op('sessao_treino', $ok, 'criar', $snapshot($a, 'prescrito', $feUuid, $spUuid))]));
        self::assertSame('aplicada', $good[0]['resultado'], json_encode($good) ?: '');
        $saved = $this->call('GET', "/me/sessoes/$ok")['body']['data'];
        self::assertSame([$program, $ficha['id'], $feUuid, $spUuid], [$saved['programa_id'], $saved['ficha_id'], $saved['exercicios'][0]['ficha_exercicio_id'], $saved['exercicios'][0]['series'][0]['serie_prescrita_id']]);
    }

    public function testReplacementAndExtraSeriesTravelAsOperations(): void
    {
        $a = $this->published('Supino');
        $b = $this->published('Supino máquina');
        $session = Uuid::v4();
        $item = Uuid::v4();
        $substitute = Uuid::v4();
        $s1 = Uuid::v4();
        $s2 = Uuid::v4();

        $r = $this->results($this->push([
            $this->op('sessao_treino', $session, 'criar', ['iniciada_em' => $this->iso(300), 'exercicios' => [['uuid' => $item, 'exercicio_uuid' => $a, 'tipo_item' => 'adicionado', 'ordem' => 1, 'series' => [['uuid' => $s1, 'ordem' => 1]]]]], 1),
            $this->op('sessao_exercicio', $substitute, 'criar', ['sessao_uuid' => $session, 'exercicio_uuid' => $b, 'substitui_uuid' => $item], 2),
            $this->op('sessao_serie', $s2, 'criar', ['sessao_uuid' => $session, 'sessao_exercicio_uuid' => $substitute, 'tipo' => 'dropset'], 3),
        ]));

        self::assertSame(['aplicada', 'aplicada', 'aplicada'], array_column($r, 'resultado'), json_encode($r) ?: '');
        $saved = $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'];
        self::assertSame([$item, $substitute], array_column($saved, 'id'));
        self::assertSame('substituido', $saved[1]['tipo_item']);
        self::assertSame([$s1, $s2], array_column($saved[1]['series'], 'id'), 'a série pendente migrou e a extra foi criada com o UUID do cliente');
    }

    public function testSeriesLastWriteWinsAndOtherDeviceConflictIsExplicit(): void
    {
        $session = $this->open();
        $item = $this->addItem($session);
        $series = $this->addSeriesTo($session, $item['id']);
        $other = Uuid::v4();
        $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $other]);
        $write = fn (string $device, int $kg, int $ago): array => $this->results($this->push([$this->op('sessao_serie', $series, 'atualizar', ['sessao_uuid' => $session, 'carga_kg' => $kg, 'repeticoes' => 10, 'status' => 'realizada', 'atualizado_cliente_em' => $this->iso($ago)])], $device))[0];

        self::assertSame('aplicada', $write($this->device, 40, 100)['resultado']);
        $conflict = $write($other, 60, 200);
        self::assertSame(['conflito', 'REVISION_CONFLICT'], [$conflict['resultado'], $conflict['erro']['code']]);
        self::assertSame(40.0, $conflict['estado_servidor']['carga_kg'], 'a escrita mais antiga de outro aparelho não sobrescreve em silêncio');

        self::assertSame('aplicada', $write($other, 60, 50)['resultado'], 'a escrita mais nova vence');
        self::assertSame(60.0, $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'][0]['series'][0]['carga_kg']);
        self::assertSame('aplicada', $write($this->device, 60, 200)['resultado'], 'mais antiga, mas sem divergência de valores: nada a perder');
    }

    public function testWildClockIsReplacedByServerTimeAndFlagged(): void
    {
        $session = $this->open();
        $item = $this->addItem($session);
        $series = $this->addSeriesTo($session, $item['id']);

        $r = $this->results($this->push([$this->op('sessao_serie', $series, 'atualizar', ['sessao_uuid' => $session, 'carga_kg' => 30, 'repeticoes' => 10, 'status' => 'realizada', 'atualizado_cliente_em' => gmdate('Y-m-d\TH:i:s\Z', time() - 3 * 86400)])]));

        self::assertSame(['aplicada', true], [$r[0]['resultado'], $r[0]['clock_skew'] ?? false]);
        self::assertSame('realizada', $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'][0]['series'][0]['status']);
    }

    public function testBatchEnvelopeValidationAndDeviceRules(): void
    {
        $valid = $this->op('sessao_treino', Uuid::v4(), 'criar', ['iniciada_em' => $this->iso(60)]);
        $tooMany = array_fill(0, 51, $valid);

        self::assertSame(422, $this->push([])['status']);
        self::assertSame(422, $this->push($tooMany)['status']);
        $bad = $this->push([['operacao_uuid' => 'x', 'entidade' => 'plano', 'entidade_uuid' => Uuid::v4(), 'tipo' => 'criar', 'payload' => [], 'extra' => 1]]);
        self::assertSame(422, $bad['status']);
        self::assertEqualsCanonicalizing(['operacoes.0.operacao_uuid', 'operacoes.0.entidade', 'operacoes.0.extra'], array_keys($bad['body']['error']['details']['fields']));
        self::assertSame(422, $this->push([$valid], Uuid::v4())['status'], 'dispositivo não registrado');
        self::assertSame(401, $this->call('POST', '/sync/push', ['dispositivo_uuid' => $this->device, 'operacoes' => [$valid]], null, false)['status']);

        [$otherToken] = $this->newUser();
        self::assertSame(422, $this->push([$valid], $this->device, $otherToken)['status'], 'o dispositivo de outro usuário não vale');

        $this->call('DELETE', "/me/dispositivos/{$this->device}");
        self::assertSame(403, $this->push([$valid])['status'], 'dispositivo revogado não sincroniza');
    }
}
