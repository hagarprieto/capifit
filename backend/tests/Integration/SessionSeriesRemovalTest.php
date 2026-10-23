<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** `DELETE /me/sessoes/{uuid}/series/{serie_uuid}`: remover uma série adicionada por engano (achado em aparelho). */
final class SessionSeriesRemovalTest extends ApiTestCase
{
    /** @return list<string> UUIDs das séries da sessão, na ordem */
    private function seriesOf(string $session): array
    {
        $data = $this->call('GET', "/me/sessoes/$session")['body']['data'];

        return array_merge(...array_map(static fn (array $item): array => array_column($item['series'], 'id'), $data['exercicios']));
    }

    /** @return array{status: int, body: array<string, mixed>, headers: array<string, string>} */
    private function remove(string $session, string $series, ?string $token = null): array
    {
        return $this->call('DELETE', "/me/sessoes/$session/series/$series", null, null, true, $token);
    }

    /** @return array{string, string, string} Treino de ficha com um exercício de 2 séries: [sessão, série 1, série 2] */
    private function programmed(): array
    {
        $exercise = $this->published('Supino reto');
        $program = $this->call('POST', '/me/programas', ['titulo' => 'Programa'], Uuid::v4())['body']['data']['id'];
        $put = $this->call('PUT', "/programas/$program/versoes/1/estrutura", ['expected_revision' => 1, 'fichas' => [[
            'codigo' => 'A', 'titulo' => 'Treino A', 'ordem' => 1,
            'exercicios' => [['exercicio_uuid' => $exercise, 'ordem' => 1, 'series' => [['ordem' => 1, 'tipo' => 'normal', 'reps_min' => 8, 'reps_max' => 10], ['ordem' => 2, 'tipo' => 'normal', 'reps_min' => 8, 'reps_max' => 10]]]],
        ]]]);
        self::assertSame(200, $put['status'], json_encode($put['body']) ?: '');
        self::assertSame(200, $this->call('POST', "/programas/$program/versoes/1/publicar", null, Uuid::v4())['status']);
        $ficha = $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0]['id'];
        $session = Uuid::v4();
        $created = $this->call('POST', '/me/sessoes', ['sessao_uuid' => $session, 'ficha_uuid' => $ficha, 'iniciada_em' => $this->iso(300)], Uuid::v4());
        self::assertSame(201, $created['status'], json_encode($created['body']) ?: '');
        [$first, $second] = $this->seriesOf($session);

        return [$session, $first, $second];
    }

    public function testRemovesAnAccidentalExtraSeriesAndRepeatingIsSafe(): void
    {
        $session = $this->open();
        $item = $this->addItem($session);
        $series = $this->addSeriesTo($session, $item['id']);
        self::assertSame([$series], $this->seriesOf($session));

        $r = $this->remove($session, $series);

        self::assertSame(204, $r['status']);
        self::assertSame([], $this->seriesOf($session));
        self::assertSame(204, $this->remove($session, $series)['status'], 'repetir (resposta perdida) não é erro');
    }

    public function testAnExtraSeriesAlreadyDoneCanAlsoBeRemoved(): void
    {
        $session = $this->open();
        $series = $this->addSeriesTo($session, $this->addItem($session)['id']);
        self::assertSame(200, $this->call('PATCH', "/me/sessoes/$session/series/$series", ['carga_kg' => 40, 'repeticoes' => 10, 'status' => 'realizada'])['status']);

        self::assertSame(204, $this->remove($session, $series)['status']);
        self::assertSame([], $this->seriesOf($session));
    }

    public function testAPendingPrescribedSeriesCanBeRemovedButADonePrescribedOneCannot(): void
    {
        [$session, $first, $second] = $this->programmed();
        self::assertSame(200, $this->call('PATCH', "/me/sessoes/$session/series/$first", ['carga_kg' => 60, 'repeticoes' => 8, 'status' => 'realizada'])['status']);

        $blocked = $this->remove($session, $first);
        self::assertSame(422, $blocked['status']);
        self::assertArrayHasKey('serie', $blocked['body']['error']['details']['fields']);
        self::assertContains($first, $this->seriesOf($session), 'o histórico do que foi feito continua');

        self::assertSame(204, $this->remove($session, $second)['status']);
        self::assertSame([$first], $this->seriesOf($session));
    }

    public function testSessionRulesApply(): void
    {
        $session = $this->open();
        $series = $this->addSeriesTo($session, $this->addItem($session)['id']);

        // De outro usuário: a sessão não existe para ele.
        [$otherToken] = $this->newUser();
        self::assertSame(404, $this->remove($session, $series, $otherToken)['status']);
        self::assertContains($series, $this->seriesOf($session));

        // Sem login.
        self::assertSame(401, $this->call('DELETE', "/me/sessoes/$session/series/$series", null, null, false)['status']);

        // UUID que não é de uma série desta sessão não remove nada (e não vaza nada).
        self::assertSame(204, $this->remove($session, Uuid::v4())['status']);
        self::assertSame(204, $this->remove($session, 'nao-e-uuid')['status']);
        self::assertContains($series, $this->seriesOf($session));

        // Treino encerrado: não se mexe mais nele.
        self::assertSame(200, $this->call('POST', "/me/sessoes/$session/concluir", ['encerrada_em' => $this->iso(10)], Uuid::v4())['status']);
        $closed = $this->remove($session, $series);
        self::assertSame(409, $closed['status']);
        self::assertSame('SESSION_CLOSED', $closed['body']['error']['code']);
    }
}
