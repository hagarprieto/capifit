<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Kernel;
use CapiFit\Support\Text;
use CapiFit\Support\Uuid;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\TestCase;

/**
 * Sessões de treino avulsas (E07-01) e Idempotency-Key (CT-30…CT-38, CT-50…CT-52) contra um MySQL real.
 */
final class SessionFlowTest extends TestCase
{
    private Kernel $kernel;
    private string $token;
    private string $userUuid;

    protected function setUp(): void
    {
        if (getenv('DB_NAME') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_NAME, DB_* e CAPIFIT_ALLOW_DB_TESTS=1 para rodar contra um banco descartável.');
        }
        $env = [...getenv(), 'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789'];
        if (getenv('DB_APP_USER') !== false) {
            $env['DB_USER'] = (string) getenv('DB_APP_USER');
            $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        }
        $this->kernel = new Kernel(Config::fromArray($env), new Logger('t', [new TestHandler()]));
        [$this->token, $this->userUuid] = $this->newUser();
    }

    protected function tearDown(): void
    {
        if (isset($this->kernel)) {
            $this->kernel->db->close();
        }
    }

    /** @return array{string, string} token de acesso e uuid do usuário */
    private function newUser(): array
    {
        $r = $this->call('POST', '/auth/register', [
            'nome' => 'Sessão', 'email' => 's' . bin2hex(random_bytes(6)) . '@exemplo.invalid', 'senha' => 'senha-de-teste-bem-longa-42',
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true,
        ], null, false);

        return [$r['body']['data']['access_token'], $r['body']['data']['usuario']['id']];
    }

    /**
     * @param array<string, mixed>|null $body
     * @return array{status: int, body: array<string, mixed>, headers: array<string, string>}
     */
    private function call(string $method, string $path, ?array $body = null, ?string $key = null, bool $auth = true, ?string $token = null): array
    {
        $json = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        $headers = $json === '' ? [] : ['Content-Type' => 'application/json'];
        if ($auth) {
            $headers['Authorization'] = 'Bearer ' . ($token ?? $this->token);
        }
        if ($key !== null) {
            $headers['Idempotency-Key'] = $key;
        }
        $request = new ServerRequest($method, $path, $headers, $json);
        if (str_contains($path, '?')) {
            parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
            $request = $request->withQueryParams($query);
        }
        $response = $this->kernel->handle($json === '' ? $request : $request->withBody(Stream::create($json)));
        $raw = (string) $response->getBody();
        /** @var array<string, mixed> $decoded */
        $decoded = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        return ['status' => $response->getStatusCode(), 'body' => $decoded, 'headers' => array_map(static fn (array $v): string => $v[0], $response->getHeaders())];
    }

    private function iso(int $secondsAgo = 0): string
    {
        return gmdate('Y-m-d\TH:i:s\Z', time() - $secondsAgo);
    }

    /** @return array{status: int, body: array<string, mixed>, headers: array<string, string>} */
    private function start(?string $token = null, int $secondsAgo = 60, ?string $uuid = null, ?string $key = null): array
    {
        return $this->call('POST', '/me/sessoes', ['sessao_uuid' => $uuid ?? Uuid::v4(), 'iniciada_em' => $this->iso($secondsAgo)], $key ?? Uuid::v4(), true, $token);
    }

    private function open(): string
    {
        $r = $this->start();
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['id'];
    }

    private function published(string $name, string $modalidade = 'reps_carga', string $status = 'publicado'): string
    {
        $uuid = Uuid::v4();
        $this->kernel->db->execute(
            'INSERT INTO exercicios(uuid, nome, nome_normalizado, modalidade, status) VALUES (?, ?, ?, ?, ?)',
            'sssss',
            $uuid,
            $name,
            Text::normalize($name),
            $modalidade,
            $status,
        );

        return $uuid;
    }

    /** @return array{session: string, item: string, series: string} sessão aberta com um exercício e uma série */
    private function sessionWithSeries(string $modalidade = 'reps_carga'): array
    {
        $session = $this->open();
        $exercise = $this->published('Ex ' . bin2hex(random_bytes(3)), $modalidade);
        $item = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $exercise]);
        self::assertSame(201, $item['status'], json_encode($item['body']) ?: '');
        $series = $this->call('POST', "/me/sessoes/$session/series", ['sessao_exercicio_uuid' => $item['body']['data']['id']]);
        self::assertSame(201, $series['status'], json_encode($series['body']) ?: '');

        return ['session' => $session, 'item' => $item['body']['data']['id'], 'series' => $series['body']['data']['id']];
    }

    private function countSessions(string $userUuid): int
    {
        $row = $this->kernel->db->fetchOne('SELECT COUNT(*) AS n FROM sessoes_treino s JOIN usuarios u ON u.id = s.aluno_id WHERE u.uuid = ?', 's', $userUuid);

        return (int) ($row['n'] ?? 0);
    }

    // ---------------------------------------------------------------------------------------- criação

    public function testCreationNeedsAuthenticationAndAnIdempotencyKey(): void
    {
        self::assertSame(401, $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso()], Uuid::v4(), false)['status']);

        $noKey = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso()]);
        self::assertSame(422, $noKey['status']);
        self::assertArrayHasKey('Idempotency-Key', $noKey['body']['error']['details']['fields']);

        $badKey = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso()], 'nao-e-uuid');
        self::assertSame(422, $badKey['status']);
        self::assertSame(0, $this->countSessions($this->userUuid));
    }

    public function testCreatesAnAvulsoSessionWithTheContractShape(): void
    {
        $uuid = Uuid::v4();
        $r = $this->call('POST', '/me/sessoes', ['sessao_uuid' => $uuid, 'titulo_avulso' => '  Peito livre ', 'iniciada_em' => $this->iso(120)], Uuid::v4());
        $data = $r['body']['data'];

        self::assertSame(201, $r['status']);
        self::assertSame(
            ['id', 'tipo', 'titulo', 'status', 'iniciada_em', 'encerrada_em', 'duracao_ativa_segundos', 'programa_id', 'versao_numero', 'ficha_id', 'series_realizadas', 'series_total', 'observacoes', 'exercicios', 'pausas'],
            array_keys($data),
        );
        self::assertSame($uuid, $data['id']);
        self::assertSame('avulso', $data['tipo']);
        self::assertSame('Peito livre', $data['titulo']);
        self::assertSame('em_andamento', $data['status']);
        self::assertNull($data['encerrada_em']);
        self::assertNull($data['ficha_id']);
        self::assertSame([], $data['exercicios']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $data['iniciada_em']);
    }

    public function testSameKeyAndBodyReplaysTheOriginalResponseWithoutRepeatingTheEffect(): void
    {
        $key = Uuid::v4();
        $uuid = Uuid::v4();
        $body = ['sessao_uuid' => $uuid, 'iniciada_em' => $this->iso(30)];

        $first = $this->call('POST', '/me/sessoes', $body, $key);
        $second = $this->call('POST', '/me/sessoes', $body, $key);

        self::assertSame(201, $first['status']);
        self::assertSame(201, $second['status']);
        self::assertSame($first['body'], $second['body'], 'a resposta repetida é idêntica');
        self::assertSame('true', $second['headers']['Idempotent-Replayed'] ?? null);
        self::assertArrayNotHasKey('Idempotent-Replayed', $first['headers']);
        self::assertSame(1, $this->countSessions($this->userUuid));
    }

    public function testSameKeyWithDifferentContentOrRouteIsRejected(): void
    {
        $key = Uuid::v4();
        $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(30)], $key);

        $other = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(30)], $key);
        self::assertSame(409, $other['status']);
        self::assertSame('IDEMPOTENCY_KEY_REUSED', $other['body']['error']['code']);

        $session = $this->kernel->db->fetchOne("SELECT s.uuid FROM sessoes_treino s JOIN usuarios u ON u.id = s.aluno_id WHERE u.uuid = ? AND s.status = 'em_andamento'", 's', $this->userUuid);
        $route = $this->call('POST', "/me/sessoes/{$session['uuid']}/concluir", [], $key);
        self::assertSame(409, $route['status'], 'a mesma chave em outra rota também é rejeitada');
        self::assertSame('IDEMPOTENCY_KEY_REUSED', $route['body']['error']['code']);
    }

    public function testFailedRequestsAreNotCachedUnderTheKey(): void
    {
        $first = $this->open();
        $key = Uuid::v4();
        $uuid = Uuid::v4();
        $blocked = $this->start(null, 30, $uuid, $key);
        self::assertSame(409, $blocked['status']);
        self::assertSame('SESSION_ALREADY_OPEN', $blocked['body']['error']['code']);
        self::assertSame($first, $blocked['body']['error']['details']['sessao_uuid']);

        $this->call('POST', "/me/sessoes/$first/concluir", [], Uuid::v4());
        $retry = $this->start(null, 30, $uuid, $key);

        self::assertSame(201, $retry['status'], 'o erro anterior não foi guardado: a tentativa seguinte executa de verdade');
        self::assertArrayNotHasKey('Idempotent-Replayed', $retry['headers']);
    }

    public function testOnlyOneOpenSessionPerStudentButOthersAreUnaffected(): void
    {
        $first = $this->open();
        $second = $this->start();

        self::assertSame(409, $second['status']);
        self::assertSame('SESSION_ALREADY_OPEN', $second['body']['error']['code']);
        self::assertSame($first, $second['body']['error']['details']['sessao_uuid'], 'traz a sessão aberta para retomada');

        [$otherToken] = $this->newUser();
        self::assertSame(201, $this->start($otherToken)['status']);
    }

    public function testRepeatingSessionUuidReturnsTheExistingSessionAndForeignUuidIsRefused(): void
    {
        $uuid = Uuid::v4();
        self::assertSame(201, $this->start(null, 60, $uuid)['status']);

        $again = $this->start(null, 60, $uuid);
        self::assertSame(200, $again['status']);
        self::assertSame($uuid, $again['body']['data']['id']);
        self::assertSame(1, $this->countSessions($this->userUuid));

        [$otherToken] = $this->newUser();
        $foreign = $this->start($otherToken, 60, $uuid);
        self::assertSame(422, $foreign['status']);
        self::assertArrayHasKey('sessao_uuid', $foreign['body']['error']['details']['fields']);
    }

    public function testCreationValidatesEachField(): void
    {
        $cases = [
            'sessao_uuid ausente' => [['iniciada_em' => $this->iso()], 'sessao_uuid'],
            'sessao_uuid inválido' => [['sessao_uuid' => '123', 'iniciada_em' => $this->iso()], 'sessao_uuid'],
            'iniciada_em ausente' => [['sessao_uuid' => Uuid::v4()], 'iniciada_em'],
            'iniciada_em sem fuso' => [['sessao_uuid' => Uuid::v4(), 'iniciada_em' => '2026-10-22T10:00:00'], 'iniciada_em'],
            'iniciada_em no futuro' => [['sessao_uuid' => Uuid::v4(), 'iniciada_em' => gmdate('Y-m-d\TH:i:s\Z', time() + 3600)], 'iniciada_em'],
            'iniciada_em antiga' => [['sessao_uuid' => Uuid::v4(), 'iniciada_em' => gmdate('Y-m-d\TH:i:s\Z', time() - 40 * 86400)], 'iniciada_em'],
            'título longo' => [['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(), 'titulo_avulso' => str_repeat('a', 161)], 'titulo_avulso'],
            'campo desconhecido' => [['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(), 'aluno_id' => 1], 'aluno_id'],
        ];
        foreach ($cases as $name => [$body, $field]) {
            $r = $this->call('POST', '/me/sessoes', $body, Uuid::v4());
            self::assertSame(422, $r['status'], $name);
            self::assertArrayHasKey($field, $r['body']['error']['details']['fields'], $name);
        }
        self::assertSame(0, $this->countSessions($this->userUuid));

        $unknownFicha = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(), 'ficha_uuid' => Uuid::v4()], Uuid::v4());
        self::assertSame(422, $unknownFicha['status']);
        self::assertArrayHasKey('ficha_uuid', $unknownFicha['body']['error']['details']['fields']);

        $snapshot = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso(), 'exercicios' => []], Uuid::v4());
        self::assertSame(501, $snapshot['status']);
        self::assertSame('NOT_IMPLEMENTED', $snapshot['body']['error']['code']);
    }

    // ---------------------------------------------------------------------------------------- leitura e dono

    public function testOnlyTheOwnerCanSeeASession(): void
    {
        $session = $this->open();
        [$otherToken] = $this->newUser();

        self::assertSame(200, $this->call('GET', "/me/sessoes/$session")['status']);
        // Cada chamada leva um corpo VÁLIDO para a rota: assim a resposta 404 vem da checagem de dono, não da validação.
        $attempts = [
            ['GET', '', null],
            ['PATCH', '', ['observacoes' => 'x']],
            ['POST', '/concluir', []],
            ['POST', '/cancelar', []],
            ['POST', '/series', ['sessao_exercicio_uuid' => Uuid::v4()]],
            ['POST', '/exercicios', ['exercicio_uuid' => $this->published('Ex Alheio')]],
            ['PATCH', '/series/' . Uuid::v4(), ['repeticoes' => 5]],
        ];
        foreach ($attempts as [$method, $suffix, $body]) {
            $r = $this->call($method, "/me/sessoes/$session$suffix", $body, Uuid::v4(), true, $otherToken);
            self::assertSame(404, $r['status'], "$method $suffix");
        }
        self::assertSame(404, $this->call('GET', '/me/sessoes/nao-e-uuid')['status']);
        self::assertSame('em_andamento', $this->call('GET', "/me/sessoes/$session")['body']['data']['status'], 'a sessão do dono continua intacta');
    }

    // ---------------------------------------------------------------------------------------- exercícios e séries

    public function testAddsPublishedExercisesInOrderAndRejectsOthers(): void
    {
        $session = $this->open();
        $a = $this->published('Ex A');
        $b = $this->published('Ex B');
        $draft = $this->published('Ex Rascunho', 'reps_carga', 'rascunho');

        $first = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $a]);
        $second = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $b]);
        self::assertSame(201, $first['status']);
        self::assertSame([1, 2], [$first['body']['data']['ordem'], $second['body']['data']['ordem']]);
        self::assertSame('adicionado', $first['body']['data']['tipo_item']);
        self::assertSame($a, $first['body']['data']['exercicio']['id']);
        self::assertSame([], $first['body']['data']['series']);

        $notPublished = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $draft]);
        self::assertSame(422, $notPublished['status']);
        self::assertArrayHasKey('exercicio_uuid', $notPublished['body']['error']['details']['fields']);

        $taken = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $a, 'ordem' => 1]);
        self::assertSame(422, $taken['status']);
        self::assertArrayHasKey('ordem', $taken['body']['error']['details']['fields']);

        $explicit = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $a, 'ordem' => 7]);
        self::assertSame(7, $explicit['body']['data']['ordem']);
        self::assertCount(3, $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios']);
    }

    public function testClientProvidedUuidsMakeExerciseAndSeriesCreationRepeatable(): void
    {
        $session = $this->open();
        $exercise = $this->published('Ex Repetível');
        $itemUuid = Uuid::v4();
        $seriesUuid = Uuid::v4();

        $first = $this->call('POST', "/me/sessoes/$session/exercicios", ['uuid' => $itemUuid, 'exercicio_uuid' => $exercise]);
        $again = $this->call('POST', "/me/sessoes/$session/exercicios", ['uuid' => $itemUuid, 'exercicio_uuid' => $exercise]);
        self::assertSame([201, 200], [$first['status'], $again['status']]);
        self::assertSame($itemUuid, $again['body']['data']['id']);

        $s1 = $this->call('POST', "/me/sessoes/$session/series", ['uuid' => $seriesUuid, 'sessao_exercicio_uuid' => $itemUuid]);
        $s2 = $this->call('POST', "/me/sessoes/$session/series", ['uuid' => $seriesUuid, 'sessao_exercicio_uuid' => $itemUuid]);
        self::assertSame([201, 200], [$s1['status'], $s2['status']]);
        self::assertSame(1, $s2['body']['data']['ordem']);
        self::assertCount(1, $this->call('GET', "/me/sessoes/$session")['body']['data']['exercicios'][0]['series'], 'sem duplicar');
    }

    public function testSeriesFromAnotherSessionExerciseAreRefused(): void
    {
        $a = $this->sessionWithSeries();
        $this->call('POST', "/me/sessoes/{$a['session']}/concluir", [], Uuid::v4());
        $b = $this->sessionWithSeries();

        $r = $this->call('POST', "/me/sessoes/{$b['session']}/series", ['sessao_exercicio_uuid' => $a['item']]);

        self::assertSame(422, $r['status']);
        self::assertArrayHasKey('sessao_exercicio_uuid', $r['body']['error']['details']['fields']);
    }

    public function testRegisteringASeriesValidatesAndRequiresDataForTheModality(): void
    {
        $s = $this->sessionWithSeries('reps_carga');
        $path = "/me/sessoes/{$s['session']}/series/{$s['series']}";

        $missing = $this->call('PATCH', $path, ['status' => 'realizada', 'repeticoes' => 10]);
        self::assertSame(422, $missing['status']);
        self::assertArrayHasKey('carga_kg', $missing['body']['error']['details']['fields'], 'reps_carga exige a carga');

        foreach ([['carga_kg' => -1], ['carga_kg' => 'abc'], ['repeticoes' => 1001], ['repeticoes' => 1.5], ['rir_real' => 11], ['status' => 'feita'], ['concluida_em' => 'ontem'], ['x' => 1], []] as $bad) {
            self::assertSame(422, $this->call('PATCH', $path, $bad)['status'], json_encode($bad) ?: '');
        }

        $ok = $this->call('PATCH', $path, ['carga_kg' => 42.5, 'repeticoes' => 10, 'rir_real' => 2, 'status' => 'realizada']);
        $data = $ok['body']['data'];
        self::assertSame(200, $ok['status']);
        self::assertSame(['id', 'serie_prescrita_id', 'ordem', 'tipo', 'carga_kg', 'repeticoes', 'duracao_segundos', 'rir_real', 'status', 'concluida_em', 'revision'], array_keys($data));
        self::assertSame(42.5, $data['carga_kg']);
        self::assertSame(10, $data['repeticoes']);
        self::assertSame('realizada', $data['status']);
        self::assertNotNull($data['concluida_em'], 'a hora da conclusão é preenchida');
        self::assertGreaterThan(1, $data['revision']);
    }

    public function testTimedExercisesNeedADurationInsteadOfRepetitions(): void
    {
        $s = $this->sessionWithSeries('tempo');
        $path = "/me/sessoes/{$s['session']}/series/{$s['series']}";

        $missing = $this->call('PATCH', $path, ['status' => 'realizada']);
        self::assertSame(422, $missing['status']);
        self::assertArrayHasKey('duracao_segundos', $missing['body']['error']['details']['fields']);

        $ok = $this->call('PATCH', $path, ['status' => 'realizada', 'duracao_segundos' => 45]);
        self::assertSame(200, $ok['status']);
        self::assertSame(45, $ok['body']['data']['duracao_segundos']);
        self::assertNull($ok['body']['data']['repeticoes']);
    }

    public function testLastWriteWinsByClientTimestamp(): void
    {
        $s = $this->sessionWithSeries();
        $path = "/me/sessoes/{$s['session']}/series/{$s['series']}";

        $newer = $this->call('PATCH', $path, ['carga_kg' => 50, 'repeticoes' => 8, 'atualizado_cliente_em' => $this->iso(10)]);
        self::assertSame(50.0, $newer['body']['data']['carga_kg']);

        $older = $this->call('PATCH', $path, ['carga_kg' => 30, 'repeticoes' => 12, 'atualizado_cliente_em' => $this->iso(600)]);
        self::assertSame(200, $older['status']);
        self::assertSame(50.0, $older['body']['data']['carga_kg'], 'a escrita mais antiga é ignorada');
        self::assertSame(8, $older['body']['data']['repeticoes']);

        $latest = $this->call('PATCH', $path, ['carga_kg' => 55, 'atualizado_cliente_em' => $this->iso(1)]);
        self::assertSame(55.0, $latest['body']['data']['carga_kg']);
        self::assertSame(8, $latest['body']['data']['repeticoes'], 'campos não enviados permanecem');
    }

    public function testSessionSummaryCountsSeries(): void
    {
        $s = $this->sessionWithSeries();
        $second = $this->call('POST', "/me/sessoes/{$s['session']}/series", ['sessao_exercicio_uuid' => $s['item']]);
        self::assertSame(2, $second['body']['data']['ordem']);
        $this->call('PATCH', "/me/sessoes/{$s['session']}/series/{$s['series']}", ['carga_kg' => 40, 'repeticoes' => 10, 'status' => 'realizada']);

        $data = $this->call('GET', "/me/sessoes/{$s['session']}")['body']['data'];

        self::assertSame(2, $data['series_total']);
        self::assertSame(1, $data['series_realizadas']);
        self::assertSame(['realizada', 'pendente'], array_column($data['exercicios'][0]['series'], 'status'));
    }

    // ---------------------------------------------------------------------------------------- observações, conclusão, cancelamento

    public function testNotesCanBeEditedWhileOpenOnly(): void
    {
        $session = $this->open();

        $ok = $this->call('PATCH', "/me/sessoes/$session", ['observacoes' => 'Ombro incomodando — reduzi a carga.']);
        self::assertSame('Ombro incomodando — reduzi a carga.', $ok['body']['data']['observacoes']);
        self::assertSame(422, $this->call('PATCH', "/me/sessoes/$session", ['observacoes' => str_repeat('a', 5001)])['status']);
        self::assertSame(422, $this->call('PATCH', "/me/sessoes/$session", [])['status']);

        $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());
        $closed = $this->call('PATCH', "/me/sessoes/$session", ['observacoes' => 'tarde demais']);
        self::assertSame(409, $closed['status']);
        self::assertSame('SESSION_CLOSED', $closed['body']['error']['code']);
    }

    public function testCompletingComputesActiveDurationWithoutPausesAndFreesTheOpenSlot(): void
    {
        $uuid = Uuid::v4();
        self::assertSame(201, $this->start(null, 3600, $uuid)['status']);
        $sessionId = (int) $this->kernel->db->fetchOne('SELECT id FROM sessoes_treino WHERE uuid = ?', 's', $uuid)['id'];
        $pauseStart = gmdate('Y-m-d H:i:s.000000', time() - 2400);
        $pauseEnd = gmdate('Y-m-d H:i:s.000000', time() - 1800);
        $this->kernel->db->execute('INSERT INTO sessoes_pausas(uuid, sessao_id, iniciada_em, encerrada_em) VALUES (?, ?, ?, ?)', 'siss', Uuid::v4(), $sessionId, $pauseStart, $pauseEnd);

        $done = $this->call('POST', "/me/sessoes/$uuid/concluir", ['encerrada_em' => $this->iso(0)], Uuid::v4());
        $data = $done['body']['data'];

        self::assertSame(200, $done['status']);
        self::assertSame('concluida', $data['status']);
        self::assertNotNull($data['encerrada_em']);
        self::assertEqualsWithDelta(3000, $data['duracao_ativa_segundos'], 3, '60 min de sessão menos 10 min de pausa');
        self::assertCount(1, $data['pausas']);
        self::assertSame(201, $this->start()['status'], 'a vaga de sessão aberta foi liberada');
    }

    public function testCompletingTwiceIsIdempotentAndAcceptsANewKey(): void
    {
        $session = $this->open();
        $key = Uuid::v4();

        $first = $this->call('POST', "/me/sessoes/$session/concluir", [], $key);
        $replay = $this->call('POST', "/me/sessoes/$session/concluir", [], $key);
        $newKey = $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());

        self::assertSame(200, $first['status']);
        self::assertSame($first['body'], $replay['body']);
        self::assertSame('true', $replay['headers']['Idempotent-Replayed'] ?? null);
        self::assertSame(200, $newKey['status']);
        self::assertSame($first['body']['data']['encerrada_em'], $newKey['body']['data']['encerrada_em'], 'não conclui de novo nem muda o horário');
    }

    public function testCompletionRejectsInvalidEndTimes(): void
    {
        $session = $this->open();

        foreach (['ontem', gmdate('Y-m-d\TH:i:s\Z', time() + 3600), gmdate('Y-m-d\TH:i:s\Z', time() - 7200)] as $bad) {
            $r = $this->call('POST', "/me/sessoes/$session/concluir", ['encerrada_em' => $bad], Uuid::v4());
            self::assertSame(422, $r['status'], $bad);
            self::assertArrayHasKey('encerrada_em', $r['body']['error']['details']['fields']);
        }
        self::assertSame('em_andamento', $this->call('GET', "/me/sessoes/$session")['body']['data']['status']);
    }

    public function testClosedSessionsRejectEveryChange(): void
    {
        $s = $this->sessionWithSeries();
        $exercise = $this->published('Ex Tarde');
        $this->call('PATCH', "/me/sessoes/{$s['session']}/series/{$s['series']}", ['carga_kg' => 40, 'repeticoes' => 10, 'status' => 'realizada']);
        $this->call('POST', "/me/sessoes/{$s['session']}/concluir", [], Uuid::v4());

        $attempts = [
            $this->call('PATCH', "/me/sessoes/{$s['session']}/series/{$s['series']}", ['repeticoes' => 11]),
            $this->call('POST', "/me/sessoes/{$s['session']}/series", ['sessao_exercicio_uuid' => $s['item']]),
            $this->call('POST', "/me/sessoes/{$s['session']}/exercicios", ['exercicio_uuid' => $exercise]),
            $this->call('POST', "/me/sessoes/{$s['session']}/cancelar", []),
        ];
        foreach ($attempts as $r) {
            self::assertSame(409, $r['status']);
            self::assertSame('SESSION_CLOSED', $r['body']['error']['code']);
        }
        $series = $this->call('GET', "/me/sessoes/{$s['session']}")['body']['data']['exercicios'][0]['series'][0];
        self::assertSame(10, $series['repeticoes'], 'o registro concluído não mudou');
    }

    public function testCancelingIsIdempotentAndFinal(): void
    {
        $session = $this->open();

        $first = $this->call('POST', "/me/sessoes/$session/cancelar", ['motivo' => 'Cheguei e a academia estava fechada']);
        $again = $this->call('POST', "/me/sessoes/$session/cancelar", []);

        self::assertSame(200, $first['status']);
        self::assertSame('cancelada', $first['body']['data']['status']);
        self::assertSame(200, $again['status']);
        self::assertSame($first['body']['data']['encerrada_em'], $again['body']['data']['encerrada_em']);
        $complete = $this->call('POST', "/me/sessoes/$session/concluir", [], Uuid::v4());
        self::assertSame(409, $complete['status']);
        self::assertSame('SESSION_CLOSED', $complete['body']['error']['code']);
        self::assertSame(422, $this->call('POST', "/me/sessoes/{$this->open()}/cancelar", ['motivo' => str_repeat('a', 256)])['status']);
    }

    // ---------------------------------------------------------------------------------------- histórico

    public function testHistoryIsPagedFilteredAndOnlyShowsOwnSessions(): void
    {
        // três sessões do usuário em horários diferentes (cada uma é encerrada antes da próxima)
        $uuids = [];
        foreach ([3 * 86400, 2 * 86400, 86400] as $ago) {
            $uuid = Uuid::v4();
            self::assertSame(201, $this->start(null, $ago, $uuid)['status']);
            $this->call('POST', "/me/sessoes/$uuid/concluir", ['encerrada_em' => $this->iso($ago - 1800)], Uuid::v4());
            $uuids[] = $uuid;
        }
        $cancelled = $this->open();
        $this->call('POST', "/me/sessoes/$cancelled/cancelar", []);
        [$otherToken] = $this->newUser();
        self::assertSame(201, $this->start($otherToken)['status']);

        $all = $this->call('GET', '/me/sessoes?limit=100');
        self::assertSame(200, $all['status']);
        self::assertCount(4, $all['body']['data'], 'só as sessões do próprio usuário');
        self::assertSame([$cancelled, $uuids[2], $uuids[1], $uuids[0]], array_column($all['body']['data'], 'id'), 'mais recente primeiro');
        self::assertSame(['id', 'tipo', 'titulo', 'status', 'iniciada_em', 'encerrada_em', 'duracao_ativa_segundos', 'programa_id', 'versao_numero', 'ficha_id', 'series_realizadas', 'series_total'], array_keys($all['body']['data'][0]));

        $seen = [];
        $cursor = null;
        $pages = 0;
        do {
            $r = $this->call('GET', '/me/sessoes?limit=2' . ($cursor === null ? '' : '&cursor=' . $cursor));
            $seen = [...$seen, ...array_column($r['body']['data'], 'id')];
            $cursor = $r['body']['pagination']['next_cursor'];
            $pages++;
        } while ($cursor !== null && $pages < 6);
        self::assertSame([$cancelled, $uuids[2], $uuids[1], $uuids[0]], $seen);
        self::assertSame(2, $pages);

        self::assertCount(3, $this->call('GET', '/me/sessoes?status=concluida')['body']['data']);
        self::assertCount(1, $this->call('GET', '/me/sessoes?status=cancelada')['body']['data']);
        self::assertCount(2, $this->call('GET', '/me/sessoes?status=concluida&de=' . urlencode($this->iso(2 * 86400 + 600)))['body']['data']);
    }

    public function testHistoryParametersAreValidated(): void
    {
        foreach (['status=outra', 'limit=0', 'limit=101', 'de=ontem', 'ate=2026-10-22', 'extra=1'] as $bad) {
            self::assertSame(422, $this->call('GET', '/me/sessoes?' . $bad)['status'], $bad);
        }
        $cursor = $this->call('GET', '/me/sessoes?cursor=@@@');
        self::assertSame(400, $cursor['status']);
        self::assertSame('INVALID_CURSOR', $cursor['body']['error']['details']['reason']);
    }
}
