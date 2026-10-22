<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** Substituir exercício, pausar e retomar (E07-02; CT-34, CT-37). */
final class SessionReplacePauseTest extends ApiTestCase
{
    /** @return list<string> uuids dos itens da sessão, na ordem */
    private function itemOrder(string $session): array
    {
        return array_column($this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'], 'id');
    }

    public function testReplacingKeepsRecordedSeriesAndMovesPendingOnes(): void
    {
        $session = $this->open();
        $a = $this->addItem($session, 'Supino reto');
        $b = $this->addItem($session, 'Remada');
        $s1 = $this->addSeriesTo($session, $a['id']);
        $this->addSeriesTo($session, $a['id']);
        $this->addSeriesTo($session, $a['id']);
        $this->doSeries($session, $s1);

        $newExercise = $this->published('Supino na máquina');
        $r = $this->call('POST', "/me/sessoes/$session/exercicios/{$a['id']}/substituir", ['exercicio_uuid' => $newExercise]);
        $new = $r['body']['data'];

        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');
        self::assertSame('substituido', $new['tipo_item']);
        self::assertSame($newExercise, $new['exercicio']['id']);
        self::assertSame($a['exercicio'], $new['exercicio_prescrito_id'], 'guarda qual era o exercício original');
        self::assertSame(2, $new['ordem'], 'o substituto fica logo depois do original');
        self::assertSame(['pendente', 'pendente'], array_column($new['series'], 'status'), 'as séries pendentes migram para o substituto');
        self::assertSame([$a['id'], $new['id'], $b['id']], $this->itemOrder($session), 'os itens seguintes são empurrados');

        $original = $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'][0];
        self::assertSame(['realizada'], array_column($original['series'], 'status'), 'o que já foi feito permanece no exercício original');
        self::assertSame(1, $this->call('GET', "/me/sessoes/$session")['body']['data']['series_realizadas']);
    }

    public function testReplacingAReplacementStillPointsToTheOriginalExercise(): void
    {
        $session = $this->open();
        $a = $this->addItem($session);
        $this->addSeriesTo($session, $a['id']);
        $second = $this->call('POST', "/me/sessoes/$session/exercicios/{$a['id']}/substituir", ['exercicio_uuid' => $this->published('Segundo')])['body']['data'];

        $third = $this->call('POST', "/me/sessoes/$session/exercicios/{$second['id']}/substituir", ['exercicio_uuid' => $this->published('Terceiro')]);

        self::assertSame(201, $third['status']);
        self::assertSame($a['exercicio'], $third['body']['data']['exercicio_prescrito_id']);
        self::assertSame(['pendente'], array_column($third['body']['data']['series'], 'status'));
    }

    public function testReplacementValidation(): void
    {
        $session = $this->open();
        $a = $this->addItem($session);
        $path = "/me/sessoes/$session/exercicios/{$a['id']}/substituir";

        $same = $this->call('POST', $path, ['exercicio_uuid' => $a['exercicio']]);
        self::assertSame(422, $same['status']);
        self::assertArrayHasKey('exercicio_uuid', $same['body']['error']['details']['fields']);
        self::assertSame(422, $this->call('POST', $path, ['exercicio_uuid' => $this->published('Rascunho', 'reps_carga', 'rascunho')])['status']);
        self::assertSame(422, $this->call('POST', $path, [])['status']);
        self::assertSame(404, $this->call('POST', "/me/sessoes/$session/exercicios/" . Uuid::v4() . '/substituir', ['exercicio_uuid' => $this->published('X')])['status']);
        self::assertSame(404, $this->call('POST', "/me/sessoes/$session/exercicios/nao-e-uuid/substituir", ['exercicio_uuid' => $this->published('Y')])['status']);
        self::assertCount(1, $this->itemOrder($session), 'nenhuma tentativa inválida alterou a sessão');
    }

    public function testReplacementIsRepeatableWithAClientUuidAndBlockedWhenClosed(): void
    {
        $session = $this->open();
        $a = $this->addItem($session);
        $clientUuid = Uuid::v4();
        $replacement = $this->published('Substituto');

        $first = $this->call('POST', "/me/sessoes/$session/exercicios/{$a['id']}/substituir", ['uuid' => $clientUuid, 'exercicio_uuid' => $replacement]);
        $again = $this->call('POST', "/me/sessoes/$session/exercicios/{$a['id']}/substituir", ['uuid' => $clientUuid, 'exercicio_uuid' => $replacement]);
        self::assertSame([201, 200], [$first['status'], $again['status']]);
        self::assertSame($clientUuid, $again['body']['data']['id']);
        self::assertCount(2, $this->itemOrder($session), 'repetir não duplica o substituto');

        $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());
        $closed = $this->call('POST', "/me/sessoes/$session/exercicios/{$a['id']}/substituir", ['exercicio_uuid' => $this->published('Tarde')]);
        self::assertSame(409, $closed['status']);
        self::assertSame('SESSION_CLOSED', $closed['body']['error']['code']);
    }

    public function testPauseAndResume(): void
    {
        $session = $this->open();

        $paused = $this->call('POST', "/me/sessoes/$session/pausar");
        self::assertSame(200, $paused['status']);
        self::assertSame(['id', 'iniciada_em', 'encerrada_em'], array_keys($paused['body']['data']));
        self::assertNull($paused['body']['data']['encerrada_em']);

        $again = $this->call('POST', "/me/sessoes/$session/pausar");
        self::assertSame($paused['body']['data']['id'], $again['body']['data']['id'], 'pausar de novo devolve a mesma pausa');

        $resumed = $this->call('POST', "/me/sessoes/$session/retomar");
        self::assertSame(200, $resumed['status']);
        self::assertSame($paused['body']['data']['id'], $resumed['body']['data']['id']);
        self::assertNotNull($resumed['body']['data']['encerrada_em']);

        $nothing = $this->call('POST', "/me/sessoes/$session/retomar");
        self::assertSame(422, $nothing['status']);
        self::assertArrayHasKey('sessao', $nothing['body']['error']['details']['fields']);

        $second = $this->call('POST', "/me/sessoes/$session/pausar");
        self::assertNotSame($paused['body']['data']['id'], $second['body']['data']['id'], 'uma nova pausa depois de retomar');
        self::assertCount(2, $this->call('GET', "/me/sessoes/$session")['body']['data']['pausas']);
    }

    public function testPauseRulesAndOwnership(): void
    {
        $session = $this->open();
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('POST', "/me/sessoes/$session/pausar", null, null, true, $other)['status']);
        self::assertSame(404, $this->call('POST', "/me/sessoes/$session/retomar", null, null, true, $other)['status']);
        self::assertSame(404, $this->call('POST', '/me/sessoes/nao-e-uuid/pausar')['status']);

        $this->call('POST', "/me/sessoes/$session/cancelar", []);
        $closed = $this->call('POST', "/me/sessoes/$session/pausar");
        self::assertSame(409, $closed['status']);
        self::assertSame('SESSION_CLOSED', $closed['body']['error']['code']);
    }

    public function testCompletingClosesAnOpenPauseAndDiscountsItFromTheActiveDuration(): void
    {
        $session = $this->open(null, 3600);
        $this->call('POST', "/me/sessoes/$session/pausar");
        $sessionId = (int) $this->kernel->db->fetchOne('SELECT id FROM sessoes_treino WHERE uuid = ?', 's', $session)['id'];
        $this->kernel->db->execute('UPDATE sessoes_pausas SET iniciada_em = ? WHERE sessao_id = ?', 'si', gmdate('Y-m-d H:i:s.000000', time() - 600), $sessionId);

        $done = $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());
        $data = $done['body']['data'];

        self::assertSame(200, $done['status']);
        self::assertNotNull($data['pausas'][0]['encerrada_em'], 'a pausa aberta termina com a sessão');
        self::assertEqualsWithDelta(3000, $data['duracao_ativa_segundos'], 3, '60 min de sessão menos 10 min pausada');
    }
}
