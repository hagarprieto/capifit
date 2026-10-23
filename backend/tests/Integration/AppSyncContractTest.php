<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/**
 * Contrato app ↔ servidor: empurra no `POST /sync/push` REAL as operações que o APP monta para um treino feito sem
 * rede (arquivo gerado pelo Jest em `mobile/src/data/contract/appSyncFixture.test.ts`). Se o app passar a mandar algo
 * que o servidor recusa (campo desconhecido, `sessao_uuid` ou `tipo` faltando, ordem errada), este teste falha no CI.
 *
 * Os UUIDs do catálogo e da prescrição no arquivo são "sentinelas"; aqui são trocados pelos reais do programa criado
 * pelo teste. Os horários são deslocados para o presente, mantendo os intervalos entre eles.
 */
final class AppSyncContractTest extends ApiTestCase
{
    /** @var array<string, mixed> */
    private array $fixture = [];
    private string $device = '';

    protected function setUp(): void
    {
        parent::setUp();
        $raw = file_get_contents(__DIR__ . '/../fixtures/app-sync-ops.json');
        self::assertNotFalse($raw, 'Fixture do app ausente: rode o Jest do mobile com UPDATE_CONTRACT_FIXTURE=1.');
        $this->fixture = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        $this->device = Uuid::v4();
        self::assertSame(201, $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $this->device])['status']);
    }

    /**
     * Programa publicado com a mesma forma que o app usou (1 ficha, 2 exercícios, 2 séries cada: aquecimento e normal).
     *
     * @return array<string, string> sentinela => UUID real
     */
    private function realIds(): array
    {
        $exercises = [$this->published('Supino reto'), $this->published('Tríceps corda')];
        $items = [];
        foreach ($exercises as $i => $exercise) {
            $items[] = [
                'exercicio_uuid' => $exercise, 'ordem' => $i + 1, 'descanso_segundos' => 90,
                'series' => [
                    ['ordem' => 1, 'tipo' => 'aquecimento', 'reps_min' => 12, 'reps_max' => 15],
                    ['ordem' => 2, 'tipo' => 'normal', 'reps_min' => 8, 'reps_max' => 10, 'carga_alvo_kg' => 60.5, 'rir_alvo' => 2],
                ],
            ];
        }
        $created = $this->call('POST', '/me/programas', ['titulo' => 'Programa do contrato'], Uuid::v4());
        self::assertSame(201, $created['status'], json_encode($created['body']) ?: '');
        $program = $created['body']['data']['id'];
        $put = $this->call('PUT', "/programas/$program/versoes/1/estrutura", ['expected_revision' => 1, 'fichas' => [['codigo' => 'A', 'titulo' => 'Peito e tríceps', 'ordem' => 1, 'exercicios' => $items]]]);
        self::assertSame(200, $put['status'], json_encode($put['body']) ?: '');
        $published = $this->call('POST', "/programas/$program/versoes/1/publicar", null, Uuid::v4());
        self::assertSame(200, $published['status'], json_encode($published['body']) ?: '');

        $ficha = $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0];
        $s = $this->fixture['sentinelas'];
        $map = [$s['ficha'] => $ficha['id']];
        // Exercícios extras que o treino avulso escolhe/troca durante a execução (precisam estar publicados).
        $map[$s['exercicio'][2]] = $this->published('Crucifixo');
        $map[$s['exercicio'][3]] = $this->published('Remada alta');
        foreach ($ficha['exercicios'] as $i => $item) {
            $map[$s['ficha_exercicio'][$i]] = $item['id'];
            $map[$s['exercicio'][$i]] = $exercises[$i];
            foreach ($item['series'] as $j => $series) {
                $map[$s['serie_prescrita'][$i][$j]] = $series['id'];
            }
        }

        return $map;
    }

    /**
     * @param array<string, string> $ids
     * @return list<array<string, mixed>>
     */
    private function operations(string $scenario, array $ids): array
    {
        $json = json_encode($this->fixture['cenarios'][$scenario]['operacoes'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $json = strtr($json, $ids);
        // Desloca todos os horários para o presente (a fixture foi gerada com uma data fixa).
        $base = strtotime((string) $this->fixture['base_time']);
        $shift = (time() - 7200) - $base;
        $json = (string) preg_replace_callback(
            '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/',
            static fn (array $m): string => gmdate('Y-m-d\TH:i:s.000\Z', strtotime($m[0]) + $shift),
            $json,
        );

        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param list<array<string, mixed>> $operations
     * @return list<array<string, mixed>>
     */
    private function push(array $operations): array
    {
        $r = $this->call('POST', '/sync/push', ['dispositivo_uuid' => $this->device, 'operacoes' => $operations]);
        self::assertSame(200, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['resultados'];
    }

    public function testAProgrammedWorkoutDoneOfflineIsAcceptedInFull(): void
    {
        $ids = $this->realIds();
        $operations = $this->operations('programado_completo', $ids);
        $expected = $this->fixture['cenarios']['programado_completo']['esperado'];

        $results = $this->push($operations);

        foreach ($results as $i => $result) {
            self::assertSame('aplicada', $result['resultado'], "operação $i ({$operations[$i]['entidade']}:{$operations[$i]['tipo']}): " . json_encode($result));
        }
        self::assertCount(count($operations), $results);

        $session = $this->call('GET', '/me/sessoes/' . $operations[0]['entidade_uuid'])['body']['data'];
        self::assertSame([$expected['tipo'], $expected['status']], [$session['tipo'], $session['status']]);
        self::assertSame($ids[$this->fixture['sentinelas']['ficha']], $session['ficha_id'], 'a sessão ficou ligada à ficha de origem');
        self::assertSame($expected['series_total'], $session['series_total']);
        self::assertSame($expected['series_realizadas'], $session['series_realizadas']);
        self::assertCount($expected['pausas'], $session['pausas']);
        self::assertSame($expected['duracao_ativa_segundos'], $session['duracao_ativa_segundos'], 'a pausa de 5 min é descontada');

        $first = $session['exercicios'][0]['series'];
        self::assertSame(['aquecimento', 'realizada', 20.0, 12], [$first[0]['tipo'], $first[0]['status'], (float) $first[0]['carga_kg'], $first[0]['repeticoes']]);
        self::assertSame($ids[$this->fixture['sentinelas']['serie_prescrita'][0][1]], $first[1]['serie_prescrita_id'], 'cada série guarda a série prescrita de origem');
        self::assertCount(3, $first, 'a série extra criada no aparelho foi aceita com o UUID do aparelho');
        self::assertSame(['realizada', 55.0, 8], [$first[2]['status'], (float) $first[2]['carga_kg'], $first[2]['repeticoes']]);
    }

    public function testResendingTheSameQueueChangesNothing(): void
    {
        $ids = $this->realIds();
        $operations = $this->operations('programado_completo', $ids);
        $first = $this->push($operations);

        $again = $this->push($operations);

        self::assertEquals($first, $again, 'reenviar a fila (resposta perdida) devolve os mesmos resultados');
        $count = (int) $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_treino WHERE uuid = ?', 's', $operations[0]['entidade_uuid'])['n'];
        self::assertSame(1, $count);
    }

    public function testAddingAndReplacingAnExerciseOfflineIsAcceptedAndMovesThePendingSeries(): void
    {
        $ids = $this->realIds();
        $operations = $this->operations('avulso_com_troca', $ids);
        $expected = $this->fixture['cenarios']['avulso_com_troca']['esperado'];

        $results = $this->push($operations);

        foreach ($results as $i => $result) {
            self::assertSame('aplicada', $result['resultado'], "operação $i ({$operations[$i]['entidade']}:{$operations[$i]['tipo']}): " . json_encode($result));
        }
        $session = $this->call('GET', '/me/sessoes/' . $operations[0]['entidade_uuid'])['body']['data'];
        self::assertSame([$expected['tipo'], $expected['status']], [$session['tipo'], $session['status']]);
        self::assertCount($expected['exercicios'], $session['exercicios']);
        self::assertSame($expected['tipos_item'], array_column($session['exercicios'], 'tipo_item'));
        self::assertSame($expected['series_total'], $session['series_total']);
        self::assertSame($expected['series_realizadas'], $session['series_realizadas']);

        [$original, $replacement] = $session['exercicios'];
        self::assertCount(1, $original['series'], 'o original ficou só com o que foi registrado');
        self::assertSame(['realizada', 30.0], [$original['series'][0]['status'], (float) $original['series'][0]['carga_kg']]);
        self::assertCount(1, $replacement['series'], 'a série que faltava passou ao substituto');
        self::assertSame(['realizada', 25.0], [$replacement['series'][0]['status'], (float) $replacement['series'][0]['carga_kg']]);
        self::assertSame($ids[$this->fixture['sentinelas']['exercicio'][3]], $replacement['exercicio']['id']);
    }

    public function testADiscardedFreeWorkoutIsAcceptedAndCancelled(): void
    {
        $operations = $this->operations('avulso_descartado', []);
        $expected = $this->fixture['cenarios']['avulso_descartado']['esperado'];

        $results = $this->push($operations);

        foreach ($results as $i => $result) {
            self::assertSame('aplicada', $result['resultado'], "operação $i ({$operations[$i]['entidade']}:{$operations[$i]['tipo']}): " . json_encode($result));
        }
        $session = $this->call('GET', '/me/sessoes/' . $operations[0]['entidade_uuid'])['body']['data'];
        self::assertSame([$expected['tipo'], $expected['status']], [$session['tipo'], $session['status']]);
        self::assertCount($expected['pausas'], $session['pausas']);
    }
}
