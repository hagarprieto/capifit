<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** Programas manuais: versões, estrutura, publicação, ativação, cópia e sessão programada (E06-01, E07-12; CT-17…CT-24). */
final class ProgramFlowTest extends ApiTestCase
{
    /** @return array<string, mixed> */
    private function structure(int $revision, string ...$exercises): array
    {
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

        return ['expected_revision' => $revision, 'fichas' => [['codigo' => 'A', 'titulo' => 'Peito e tríceps', 'ordem' => 1, 'exercicios' => $items]]];
    }

    private function createProgram(string $title = 'Meu programa', ?string $token = null): string
    {
        $r = $this->call('POST', '/me/programas', ['titulo' => $title, 'objetivo' => 'Hipertrofia'], Uuid::v4(), true, $token);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['id'];
    }

    /** @return string uuid do programa com a versão 1 publicada */
    private function publishedProgram(string ...$exercises): string
    {
        $program = $this->createProgram();
        $put = $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(1, ...($exercises ?: [$this->published('Supino reto'), $this->published('Tríceps corda')])));
        self::assertSame(200, $put['status'], json_encode($put['body']) ?: '');
        $pub = $this->call('POST', "/programas/$program/versoes/1/publicar", null, Uuid::v4());
        self::assertSame(200, $pub['status'], json_encode($pub['body']) ?: '');

        return $program;
    }

    public function testCreateStartsAsDraftWithAnEmptyVersionOne(): void
    {
        $key = Uuid::v4();
        $r = $this->call('POST', '/me/programas', ['titulo' => '  Treino ABC  '], $key);
        $program = $r['body']['data'];

        self::assertSame(201, $r['status']);
        self::assertSame('Treino ABC', $program['titulo']);
        self::assertSame(['rascunho', 'usuario', null, 1], [$program['status'], $program['origem'], $program['versao_atual'], $program['versao_rascunho']]);
        self::assertSame($this->userUuid, $program['autor']['id']);

        $again = $this->call('POST', '/me/programas', ['titulo' => '  Treino ABC  '], $key);
        self::assertSame('true', $again['headers']['Idempotent-Replayed'] ?? null);
        self::assertSame($program['id'], $again['body']['data']['id']);
        self::assertCount(1, $this->call('GET', '/me/programas')['body']['data'], 'a repetição não duplica');

        $version = $this->call('GET', "/programas/{$program['id']}/versoes/1");
        self::assertSame(['rascunho', 1, []], [$version['body']['data']['estado'], $version['body']['data']['revision'], $version['body']['data']['fichas']]);
    }

    public function testCreateValidation(): void
    {
        self::assertSame(422, $this->call('POST', '/me/programas', [], Uuid::v4())['status']);
        self::assertSame(422, $this->call('POST', '/me/programas', ['titulo' => str_repeat('x', 181)], Uuid::v4())['status']);
        self::assertSame(422, $this->call('POST', '/me/programas', ['titulo' => 'Ok', 'status' => 'publicado'], Uuid::v4())['status']);
        self::assertSame(401, $this->call('GET', '/me/programas', null, null, false)['status']);
    }

    public function testStructureRoundTripAndValidationPaths(): void
    {
        $program = $this->createProgram();
        $exercise = $this->published('Agachamento');

        $ok = $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(1, $exercise));
        self::assertSame(200, $ok['status'], json_encode($ok['body']) ?: '');
        $version = $ok['body']['data'];
        self::assertSame(2, $version['revision']);
        $item = $version['fichas'][0]['exercicios'][0];
        self::assertSame($exercise, $item['exercicio']['id']);
        self::assertSame(['aquecimento', 'normal'], array_column($item['series'], 'tipo'));
        self::assertSame(60.5, $item['series'][1]['carga_alvo_kg']);

        $bad = $this->structure(2, $exercise);
        $bad['fichas'][0]['exercicios'][0]['series'][1]['reps_min'] = 20;
        $bad['fichas'][0]['exercicios'][0]['exercicio_uuid'] = $this->published('Rascunho', 'reps_carga', 'rascunho');
        $r = $this->call('PUT', "/programas/$program/versoes/1/estrutura", $bad);
        self::assertSame(422, $r['status']);
        $fields = $r['body']['error']['details']['fields'];
        self::assertArrayHasKey('fichas.0.exercicios.0.series.1.reps_min', $fields);
        self::assertArrayHasKey('fichas.0.exercicios.0.exercicio_uuid', $fields);
        self::assertSame(2, $this->call('GET', "/programas/$program/versoes/1")['body']['data']['revision'], 'estrutura inválida não altera nada');
    }

    public function testStaleRevisionIsAConflict(): void
    {
        $program = $this->createProgram();
        $exercise = $this->published('Remada');
        self::assertSame(200, $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(1, $exercise))['status']);

        $stale = $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(1, $exercise));

        self::assertSame(409, $stale['status']);
        self::assertSame('REVISION_CONFLICT', $stale['body']['error']['code']);
        self::assertSame(2, $stale['body']['error']['details']['current_revision']);
    }

    public function testPublishNeedsContentAndFreezesTheVersion(): void
    {
        $program = $this->createProgram();
        $empty = $this->call('POST', "/programas/$program/versoes/1/publicar", null, Uuid::v4());
        self::assertSame(422, $empty['status']);

        $exercise = $this->published('Desenvolvimento');
        $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(1, $exercise));
        $key = Uuid::v4();
        $pub = $this->call('POST', "/programas/$program/versoes/1/publicar", null, $key);
        self::assertSame(200, $pub['status'], json_encode($pub['body']) ?: '');
        self::assertSame('publicado', $pub['body']['data']['estado']);
        self::assertNotNull($pub['body']['data']['publicado_em']);

        $header = $this->call('GET', "/programas/$program")['body']['data'];
        self::assertSame(['publicado', 1, null], [$header['status'], $header['versao_atual'], $header['versao_rascunho']]);

        $edit = $this->call('PUT', "/programas/$program/versoes/1/estrutura", $this->structure(2, $exercise));
        self::assertSame(409, $edit['status']);
        self::assertSame('VERSION_IMMUTABLE', $edit['body']['error']['code']);
        self::assertSame('true', $this->call('POST', "/programas/$program/versoes/1/publicar", null, $key)['headers']['Idempotent-Replayed'] ?? null);
    }

    public function testEditingAPublishedProgramCreatesANewVersionAndKeepsTheOldOneIntact(): void
    {
        $first = $this->published('Supino');
        $program = $this->publishedProgram($first);

        $v2 = $this->call('POST', "/programas/$program/versoes", null, Uuid::v4());
        self::assertSame(201, $v2['status'], json_encode($v2['body']) ?: '');
        self::assertSame(['rascunho', 2], [$v2['body']['data']['estado'], $v2['body']['data']['numero']]);
        self::assertCount(1, $v2['body']['data']['fichas'], 'a nova versão parte de uma cópia da publicada');

        $conflict = $this->call('POST', "/programas/$program/versoes", null, Uuid::v4());
        self::assertSame(409, $conflict['status']);
        self::assertSame('PROGRAM_VERSION_CONFLICT', $conflict['body']['error']['code']);

        $second = $this->published('Crucifixo');
        $this->call('PUT', "/programas/$program/versoes/2/estrutura", $this->structure(1, $first, $second));
        $this->call('POST', "/programas/$program/versoes/2/publicar", null, Uuid::v4());

        self::assertSame('substituido', $this->call('GET', "/programas/$program/versoes/1")['body']['data']['estado']);
        self::assertCount(1, $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0]['exercicios'], 'a versão 1 continua como foi publicada');
        self::assertCount(2, $this->call('GET', "/programas/$program/versoes/2")['body']['data']['fichas'][0]['exercicios']);
        self::assertSame(2, $this->call('GET', "/programas/$program")['body']['data']['versao_atual']);
    }

    public function testActivationNeedsAPublishedVersionAndReplacesTheActiveProgram(): void
    {
        self::assertSame(404, $this->call('GET', '/me/programa-ativo')['status']);
        $draft = $this->createProgram('Rascunho');
        self::assertSame(422, $this->call('POST', "/programas/$draft/ativar", ['versao_numero' => 1])['status'], 'rascunho não ativa');

        $a = $this->publishedProgram();
        $b = $this->publishedProgram();
        $act = $this->call('POST', "/programas/$a/ativar", ['versao_numero' => 1]);
        self::assertSame(200, $act['status'], json_encode($act['body']) ?: '');
        self::assertSame($a, $this->call('GET', '/me/programa-ativo')['body']['data']['programa']['id']);

        $this->call('POST', "/programas/$b/ativar", ['versao_numero' => 1]);
        $active = $this->call('GET', '/me/programa-ativo')['body']['data'];
        self::assertSame($b, $active['programa']['id']);
        self::assertSame(1, $active['versao']['numero']);
        self::assertNotEmpty($active['versao']['fichas']);

        self::assertSame(200, $this->call('POST', "/programas/$b/arquivar")['status']);
        self::assertSame(404, $this->call('GET', '/me/programa-ativo')['status'], 'arquivar remove dos ativos');
        self::assertSame(409, $this->call('POST', "/programas/$b/ativar", ['versao_numero' => 1])['status']);
        self::assertSame(200, $this->call('POST', "/programas/$b/arquivar")['status'], 'arquivar é idempotente');
    }

    public function testListFiltersPagesAndHidesOtherUsersPrograms(): void
    {
        $mine = [$this->createProgram('Um'), $this->createProgram('Dois'), $this->createProgram('Três')];
        [$otherToken] = $this->newUser();
        $theirs = $this->createProgram('Do outro', $otherToken);

        $page1 = $this->call('GET', '/me/programas?limit=2');
        self::assertCount(2, $page1['body']['data']);
        $cursor = $page1['body']['pagination']['next_cursor'];
        self::assertNotNull($cursor);
        $page2 = $this->call('GET', '/me/programas?limit=2&cursor=' . urlencode((string) $cursor));
        $ids = array_merge(array_column($page1['body']['data'], 'id'), array_column($page2['body']['data'], 'id'));
        self::assertEqualsCanonicalizing($mine, $ids);

        self::assertSame(404, $this->call('GET', "/programas/$theirs")['status']);
        self::assertSame(404, $this->call('PATCH', "/programas/$theirs", ['titulo' => 'Invadido'])['status']);
        self::assertSame(404, $this->call('POST', "/programas/$theirs/copiar", null, Uuid::v4())['status']);
        self::assertSame(404, $this->call('GET', "/programas/$theirs/versoes/1")['status']);
        self::assertCount(0, $this->call('GET', '/me/programas?status=arquivado')['body']['data']);
        self::assertSame(422, $this->call('GET', '/me/programas?status=qualquer')['status']);
    }

    public function testPatchRenamesAndIsBlockedWhenArchived(): void
    {
        $program = $this->createProgram('Antigo');
        $r = $this->call('PATCH', "/programas/$program", ['titulo' => 'Novo', 'objetivo' => '']);
        self::assertSame(['Novo', null], [$r['body']['data']['titulo'], $r['body']['data']['objetivo']]);
        self::assertSame(422, $this->call('PATCH', "/programas/$program", [])['status']);

        $this->call('POST', "/programas/$program/arquivar");
        self::assertSame(409, $this->call('PATCH', "/programas/$program", ['titulo' => 'Tarde'])['status']);
    }

    public function testCopyIsAnIndependentEditableProgram(): void
    {
        $program = $this->publishedProgram();
        $r = $this->call('POST', "/programas/$program/copiar", null, Uuid::v4());
        $copy = $r['body']['data'];

        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');
        self::assertSame(['Cópia de Meu programa', 'usuario', 'rascunho', $program], [$copy['titulo'], $copy['origem'], $copy['status'], $copy['derivado_de']]);
        $version = $this->call('GET', "/programas/{$copy['id']}/versoes/1")['body']['data'];
        self::assertSame('rascunho', $version['estado']);
        self::assertCount(2, $version['fichas'][0]['exercicios']);
        self::assertNotSame(
            $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0]['id'],
            $version['fichas'][0]['id'],
            'a cópia tem identificadores próprios',
        );
    }

    public function testCoachProgramsAreHiddenUntilAcceptedAndNeverEditableByTheStudent(): void
    {
        $uuid = Uuid::v4();
        $db = $this->kernel->db;
        $studentId = (int) $db->fetchOne('SELECT id FROM usuarios WHERE uuid = ?', 's', $this->userUuid)['id'];
        $db->execute("INSERT INTO programas_treino(uuid, aluno_id, autor_id, origem, titulo, status) VALUES (?, ?, ?, 'coach', 'Do coach', 'publicado')", 'sii', $uuid, $studentId, $studentId);
        $programId = $db->lastInsertId();

        self::assertSame(404, $this->call('GET', "/programas/$uuid")['status'], 'sem aceite, o programa de coach não aparece');
        self::assertCount(0, $this->call('GET', '/me/programas')['body']['data']);

        $db->execute("INSERT INTO versoes_programa(programa_id, numero, estado, publicado_em) VALUES (?, 1, 'publicado', NOW(6))", 'i', $programId);
        $versionId = $db->lastInsertId();
        $db->execute('UPDATE programas_treino SET versao_atual_id = ? WHERE id = ?', 'ii', $versionId, $programId);
        $db->execute("INSERT INTO aceites_programa(uuid, programa_id, versao_id, aluno_id, estado, enviado_por) VALUES (?, ?, ?, ?, 'aceito', ?)", 'siiii', Uuid::v4(), $programId, $versionId, $studentId, $studentId);

        self::assertSame(200, $this->call('GET', "/programas/$uuid")['status']);
        self::assertSame(403, $this->call('PATCH', "/programas/$uuid", ['titulo' => 'Meu'])['status']);
        self::assertSame(403, $this->call('POST', "/programas/$uuid/versoes", null, Uuid::v4())['status']);
        self::assertSame(200, $this->call('POST', "/programas/$uuid/ativar", ['versao_numero' => 1])['status'], 'o aluno pode ativar o que aceitou');
        self::assertSame(201, $this->call('POST', "/programas/$uuid/copiar", null, Uuid::v4())['status'], 'a saída para personalizar é a cópia');
    }

    public function testProgrammedSessionCopiesThePrescriptionAndStaysIndependentOfLaterEdits(): void
    {
        $a = $this->published('Supino reto');
        $b = $this->published('Tríceps corda');
        $program = $this->publishedProgram($a, $b);
        $version = $this->call('GET', "/programas/$program/versoes/1")['body']['data'];
        $ficha = $version['fichas'][0];

        $sessionUuid = Uuid::v4();
        $r = $this->call('POST', '/me/sessoes', ['sessao_uuid' => $sessionUuid, 'ficha_uuid' => $ficha['id'], 'iniciada_em' => $this->iso(30)], Uuid::v4());
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');
        $session = $r['body']['data'];

        self::assertSame(['programado', 'Peito e tríceps', $program, 1, $ficha['id']], [$session['tipo'], $session['titulo'], $session['programa_id'], $session['versao_numero'], $session['ficha_id']]);
        self::assertSame([$a, $b], array_map(static fn (array $e): string => $e['exercicio']['id'], $session['exercicios']));
        self::assertSame(['prescrito', 'prescrito'], array_column($session['exercicios'], 'tipo_item'));
        self::assertSame(array_column($ficha['exercicios'], 'id'), array_column($session['exercicios'], 'ficha_exercicio_id'));
        self::assertSame(['aquecimento', 'normal'], array_column($session['exercicios'][0]['series'], 'tipo'));
        self::assertSame(array_column($ficha['exercicios'][0]['series'], 'id'), array_column($session['exercicios'][0]['series'], 'serie_prescrita_id'));
        self::assertSame(['pendente', 'pendente'], array_column($session['exercicios'][0]['series'], 'status'));
        self::assertSame(4, $session['series_total']);

        $listed = $this->call('GET', '/me/sessoes')['body']['data'][0];
        self::assertSame([$program, 'Peito e tríceps'], [$listed['programa_id'], $listed['titulo']]);

        // substituir mantém o vínculo com o item prescrito
        $swap = $this->call('POST', "/me/sessoes/$sessionUuid/exercicios/{$session['exercicios'][0]['id']}/substituir", ['exercicio_uuid' => $this->published('Supino máquina')]);
        self::assertSame(201, $swap['status'], json_encode($swap['body']) ?: '');
        self::assertSame($ficha['exercicios'][0]['id'], $swap['body']['data']['ficha_exercicio_id']);
        self::assertSame($a, $swap['body']['data']['exercicio_prescrito_id']);

        // editar o programa depois não muda a sessão
        $this->call('POST', "/me/sessoes/$sessionUuid/cancelar", []);
        $this->call('POST', "/programas/$program/versoes", null, Uuid::v4());
        $this->call('PUT', "/programas/$program/versoes/2/estrutura", $this->structure(1, $b));
        self::assertCount(3, $this->call('GET', "/me/sessoes/$sessionUuid")['body']['data']['exercicios']);
    }

    public function testProgrammedSessionRejectsUnusableFichas(): void
    {
        $draft = $this->createProgram('Rascunho');
        $this->call('PUT', "/programas/$draft/versoes/1/estrutura", $this->structure(1, $this->published('Rosca')));
        $draftFicha = $this->call('GET', "/programas/$draft/versoes/1")['body']['data']['fichas'][0]['id'];
        $open = fn (string $ficha): array => $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'ficha_uuid' => $ficha, 'iniciada_em' => $this->iso(10)], Uuid::v4());

        $r = $open($draftFicha);
        self::assertSame(422, $r['status']);
        self::assertArrayHasKey('ficha_uuid', $r['body']['error']['details']['fields']);
        self::assertSame(422, $open(Uuid::v4())['status']);
        self::assertSame(422, $open('nao-e-uuid')['status']);

        $program = $this->publishedProgram();
        $ficha = $this->call('GET', "/programas/$program/versoes/1")['body']['data']['fichas'][0]['id'];
        [$otherToken] = $this->newUser();
        $foreign = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'ficha_uuid' => $ficha, 'iniciada_em' => $this->iso(10)], Uuid::v4(), true, $otherToken);
        self::assertSame(422, $foreign['status'], 'ficha de outro usuário se comporta como inexistente');

        $this->call('POST', "/programas/$program/arquivar");
        self::assertSame(422, $open($ficha)['status'], 'programa arquivado não inicia treino');
        self::assertSame(0, (int) $this->kernel->db->fetchOne("SELECT COUNT(*) AS n FROM sessoes_treino s JOIN usuarios u ON u.id = s.aluno_id WHERE s.tipo = 'programado' AND u.uuid = ?", 's', $this->userUuid)['n'], 'nenhuma sessão foi criada pelas tentativas inválidas');
    }
}
