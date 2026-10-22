<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** Último registro por exercício (E07-03) e resumo de progresso (E09-02; CT-39…CT-41). */
final class ProgressTest extends ApiTestCase
{
    /**
     * Cria uma sessão avulsa, registra os exercícios/séries e a conclui (ou cancela) em horários controlados.
     *
     * @param list<array{ex: string, series: list<array<string, mixed>>}> $items
     */
    private function session(array $items, string $startIso, string $endIso, ?string $token = null, bool $cancel = false): string
    {
        $r = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $startIso], Uuid::v4(), true, $token);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');
        $session = $r['body']['data']['id'];
        foreach ($items as $item) {
            $added = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $item['ex']], null, true, $token);
            self::assertSame(201, $added['status'], json_encode($added['body']) ?: '');
            foreach ($item['series'] as $fields) {
                $series = $this->call('POST', "/me/sessoes/$session/series", ['sessao_exercicio_uuid' => $added['body']['data']['id'], 'tipo' => $fields['tipo'] ?? 'normal'], null, true, $token);
                self::assertSame(201, $series['status'], json_encode($series['body']) ?: '');
                $patch = array_diff_key($fields, ['tipo' => 1]);
                if ($patch !== []) {
                    $done = $this->call('PATCH', "/me/sessoes/$session/series/{$series['body']['data']['id']}", $patch, null, true, $token);
                    self::assertSame(200, $done['status'], json_encode($done['body']) ?: '');
                }
            }
        }
        $end = $cancel
            ? $this->call('POST', "/me/sessoes/$session/cancelar", [], null, true, $token)
            : $this->call('POST', "/me/sessoes/$session/concluir", ['encerrada_em' => $endIso], Uuid::v4(), true, $token);
        self::assertSame(200, $end['status'], json_encode($end['body']) ?: '');

        return $session;
    }

    /** @return array<string, mixed> */
    private function realizada(float $kg, int $reps, string $tipo = 'normal'): array
    {
        return ['carga_kg' => $kg, 'repeticoes' => $reps, 'status' => 'realizada', 'tipo' => $tipo];
    }

    // ------------------------------------------------------------------------------- último registro

    public function testLastRecordIsTheMostRecentCompletedSessionWithOnlyDoneSeries(): void
    {
        $ex = $this->published('Supino reto');
        $this->session([['ex' => $ex, 'series' => [$this->realizada(40, 10)]]], $this->iso(6 * 86400 + 3600), $this->iso(6 * 86400));
        $newer = $this->session([['ex' => $ex, 'series' => [$this->realizada(45, 8), $this->realizada(45, 7), ['carga_kg' => 45, 'repeticoes' => 6], ['status' => 'ignorada']]]], $this->iso(2 * 86400 + 3600), $this->iso(2 * 86400));
        // Uma sessão cancelada e mais recente NÃO conta.
        $this->session([['ex' => $ex, 'series' => [$this->realizada(99, 1)]]], $this->iso(86400), $this->iso(86400), null, true);

        $r = $this->call('GET', "/me/exercicios/$ex/ultimo-registro");
        $data = $r['body']['data'];

        self::assertSame(200, $r['status']);
        self::assertSame(['exercicio_id', 'sessao_id', 'data', 'series'], array_keys($data));
        self::assertSame($ex, $data['exercicio_id']);
        self::assertSame($newer, $data['sessao_id']);
        self::assertSame([[1, 45.0, 8], [2, 45.0, 7]], array_map(static fn (array $s): array => [$s['ordem'], $s['carga_kg'], $s['repeticoes']], $data['series']), 'só as séries realizadas, em ordem');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $data['data']);
    }

    public function testLastRecordIsPrivateAndSurvivesTheExerciseBeingArchived(): void
    {
        $ex = $this->published('Agachamento');
        $this->session([['ex' => $ex, 'series' => [$this->realizada(60, 5)]]], $this->iso(3600), $this->iso(600));
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('GET', "/me/exercicios/$ex/ultimo-registro", null, null, true, $other)['status'], 'cada usuário só vê o próprio histórico');

        $this->kernel->db->execute("UPDATE exercicios SET status = 'arquivado' WHERE uuid = ?", 's', $ex);
        self::assertSame(200, $this->call('GET', "/me/exercicios/$ex/ultimo-registro")['status'], 'o histórico permanece mesmo com o exercício arquivado');
    }

    public function testLastRecordNotFoundCases(): void
    {
        $withoutHistory = $this->published('Sem histórico');

        self::assertSame(404, $this->call('GET', "/me/exercicios/$withoutHistory/ultimo-registro")['status']);
        self::assertSame(404, $this->call('GET', '/me/exercicios/' . Uuid::v4() . '/ultimo-registro')['status']);
        self::assertSame(404, $this->call('GET', '/me/exercicios/nao-e-uuid/ultimo-registro')['status']);
        self::assertSame(401, $this->call('GET', "/me/exercicios/$withoutHistory/ultimo-registro", null, null, false)['status']);
    }

    public function testBatchReturnsOnlyExercisesWithAHistory(): void
    {
        $a = $this->published('Lote A');
        $b = $this->published('Lote B sem histórico');
        $c = $this->published('Lote C');
        $this->session([['ex' => $a, 'series' => [$this->realizada(10, 10)]], ['ex' => $c, 'series' => [$this->realizada(20, 12)]]], $this->iso(3600), $this->iso(600));

        $r = $this->call('GET', "/me/exercicios/ultimos-registros?ids=$a,$b,$c,$a");

        self::assertSame(200, $r['status']);
        self::assertSame([$a, $c], array_column($r['body']['data'], 'exercicio_id'), 'na ordem pedida, sem repetir e sem os que não têm registro');
    }

    public function testBatchValidation(): void
    {
        $many = implode(',', array_map(static fn (): string => Uuid::v4(), range(1, 51)));
        foreach (['', 'ids=', 'ids=abc', 'ids=' . Uuid::v4() . ',lixo', 'ids=' . $many, 'ids=' . Uuid::v4() . '&extra=1'] as $query) {
            $r = $this->call('GET', '/me/exercicios/ultimos-registros' . ($query === '' ? '' : '?' . $query));
            self::assertSame(422, $r['status'], $query);
            self::assertNotEmpty($r['body']['error']['details']['fields'], $query);
        }
        $fifty = implode(',', array_map(static fn (): string => Uuid::v4(), range(1, 50)));
        self::assertSame(200, $this->call('GET', '/me/exercicios/ultimos-registros?ids=' . $fifty)['status'], 'o limite é de 50');
    }

    // ------------------------------------------------------------------------------- resumo

    public function testSummaryCountsVolumeTimeAndWeeksInTheUsersTimeZone(): void
    {
        self::assertSame(200, $this->call('PATCH', '/me', ['fuso_horario' => 'America/Sao_Paulo'])['status']);
        $tz = new \DateTimeZone('America/Sao_Paulo');
        $day = (new \DateTimeImmutable('today', $tz))->modify('-10 days');
        $at = static fn (\DateTimeImmutable $d, string $time): string => (new \DateTimeImmutable($d->format('Y-m-d') . ' ' . $time, $tz))->format('Y-m-d\TH:i:sP');

        $supino = $this->published('Resumo supino');
        $flexao = $this->published('Resumo flexão', 'reps_peso_corporal');
        $prancha = $this->published('Resumo prancha', 'tempo');
        $assistido = $this->published('Resumo barra assistida', 'reps_assistido');

        // Sessão 1 (09:00 locais): 40×10 + 50×5 contam no volume; aquecimento e pendente não.
        $this->session([['ex' => $supino, 'series' => [$this->realizada(40, 10), $this->realizada(50, 5), $this->realizada(20, 10, 'aquecimento'), ['carga_kg' => 60, 'repeticoes' => 3]]]], $at($day, '08:00:00'), $at($day, '09:00:00'));
        // Sessão 2 termina às 23:30 locais (02:30 do dia seguinte em UTC): conta no dia LOCAL.
        $this->session([
            ['ex' => $flexao, 'series' => [['repeticoes' => 10, 'status' => 'realizada'], ['carga_kg' => 5, 'repeticoes' => 8, 'status' => 'realizada']]],
            ['ex' => $prancha, 'series' => [['duracao_segundos' => 45, 'status' => 'realizada']]],
            ['ex' => $assistido, 'series' => [['carga_kg' => 30, 'repeticoes' => 10, 'status' => 'realizada']]],
        ], $at($day, '22:30:00'), $at($day, '23:30:00'));
        // Sessão 3, oito dias depois.
        $this->session([['ex' => $supino, 'series' => [$this->realizada(55, 4)]]], $at($day->modify('+8 days'), '10:00:00'), $at($day->modify('+8 days'), '11:00:00'));

        $dayStr = $day->format('Y-m-d');
        $one = $this->call('GET', "/me/progresso/resumo?de=$dayStr&ate=$dayStr");
        $data = $one['body']['data'];

        self::assertSame(200, $one['status'], json_encode($one['body']) ?: '');
        self::assertSame(['de', 'ate', 'sessoes_concluidas', 'series_realizadas', 'tempo_ativo_segundos', 'volume_kg', 'frequencia_semanal'], array_keys($data));
        self::assertSame(2, $data['sessoes_concluidas'], 'as duas sessões do dia local, inclusive a das 23:30');
        self::assertSame(7, $data['series_realizadas'], '3 do supino (com aquecimento) + 4 das demais');
        self::assertSame(7200, $data['tempo_ativo_segundos']);
        self::assertSame(690.0, $data['volume_kg'], '400 + 250 + 40 (flexão com 5 kg extra); sem aquecimento, tempo, assistido nem carga zero');
        self::assertCount(1, $data['frequencia_semanal']);
        self::assertSame(2, $data['frequencia_semanal'][0]['sessoes']);
        self::assertSame('1', (new \DateTimeImmutable($data['frequencia_semanal'][0]['semana_inicio']))->format('N'), 'a semana começa na segunda');

        $next = $day->modify('+1 day')->format('Y-m-d');
        self::assertSame(0, $this->call('GET', "/me/progresso/resumo?de=$next&ate=$next")['body']['data']['sessoes_concluidas'], 'no dia seguinte (local) não há sessão');

        $range = $this->call('GET', '/me/progresso/resumo?de=' . $dayStr . '&ate=' . $day->modify('+9 days')->format('Y-m-d'))['body']['data'];
        self::assertSame(3, $range['sessoes_concluidas']);
        self::assertSame(3, array_sum(array_column($range['frequencia_semanal'], 'sessoes')));
        $weeks = array_column($range['frequencia_semanal'], 'semana_inicio');
        $sorted = $weeks;
        sort($sorted);
        self::assertSame($sorted, $weeks, 'semanas em ordem crescente');
        self::assertGreaterThanOrEqual(2, count($weeks));

        // Com o fuso UTC, a sessão das 23:30 locais cai no dia seguinte.
        $this->call('PATCH', '/me', ['fuso_horario' => 'UTC']);
        self::assertSame(1, $this->call('GET', "/me/progresso/resumo?de=$next&ate=$next")['body']['data']['sessoes_concluidas'], 'o dia depende do fuso horário do usuário');
    }

    public function testSummaryOfAnEmptyPeriodAndOfAnotherUser(): void
    {
        $this->session([['ex' => $this->published('Só meu'), 'series' => [$this->realizada(40, 10)]]], $this->iso(7200), $this->iso(3600));
        [$other] = $this->newUser();
        $from = gmdate('Y-m-d', time() - 3 * 86400);
        $to = gmdate('Y-m-d', time() + 86400);

        $mine = $this->call('GET', "/me/progresso/resumo?de=$from&ate=$to")['body']['data'];
        $theirs = $this->call('GET', "/me/progresso/resumo?de=$from&ate=$to", null, null, true, $other)['body']['data'];

        self::assertSame(1, $mine['sessoes_concluidas']);
        self::assertSame(0, $theirs['sessoes_concluidas']);
        self::assertSame(0.0, $theirs['volume_kg']);
        self::assertSame(0, $theirs['series_realizadas']);
        self::assertNotEmpty($theirs['frequencia_semanal'], 'semanas sem treino aparecem com zero');
        self::assertSame(0, array_sum(array_column($theirs['frequencia_semanal'], 'sessoes')));
    }

    public function testSummaryValidation(): void
    {
        foreach (['', 'de=2026-10-01', 'ate=2026-10-01', 'de=ontem&ate=hoje', 'de=2026-02-30&ate=2026-03-01', 'de=2026-10-10&ate=2026-10-01', 'de=2025-01-01&ate=2026-12-31', 'de=2026-10-01&ate=2026-10-02&x=1'] as $query) {
            $r = $this->call('GET', '/me/progresso/resumo' . ($query === '' ? '' : '?' . $query));
            self::assertSame(422, $r['status'], $query);
        }
        self::assertSame(200, $this->call('GET', '/me/progresso/resumo?de=2026-01-01&ate=2026-12-31')['status'], '365 dias é aceito');
    }
}
