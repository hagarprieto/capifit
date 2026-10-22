<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Kernel;
use CapiFit\Support\Text;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\TestCase;

/**
 * Catálogo de exercícios (E03-01) contra um MySQL real: só exercícios publicados e mídia aprovada (CT-70, CT-71),
 * busca por nome e sinônimo sem diferenciar acentos (CAT-03), paginação por cursor (CT-76).
 */
final class CatalogTest extends TestCase
{
    private Kernel $kernel;
    private string $prefix;
    private string $token;

    protected function setUp(): void
    {
        if (getenv('DB_NAME') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_NAME, DB_* e CAPIFIT_ALLOW_DB_TESTS=1 para rodar contra um banco descartável.');
        }
        $env = [...getenv(), 'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789', 'MEDIA_BASE_URL' => 'https://cdn.exemplo.invalid/media/', 'MEDIA_SIGNING_SECRET' => 'segredo-de-teste-de-midia-com-mais-de-32-bytes'];
        if (getenv('DB_APP_USER') !== false) {
            $env['DB_USER'] = (string) getenv('DB_APP_USER');
            $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        }
        $this->kernel = new Kernel(Config::fromArray($env), new Logger('t', [new TestHandler()]));
        // Prefixo único: isola os exercícios deste teste dos demais (o banco é compartilhado entre os testes).
        $this->prefix = 'Zt' . bin2hex(random_bytes(4));

        $register = $this->call('POST', '/auth/register', [
            'nome' => 'Catálogo', 'email' => 'c' . bin2hex(random_bytes(6)) . '@exemplo.invalid', 'senha' => 'senha-de-teste-bem-longa-42',
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true,
        ], false);
        $this->token = $register['body']['data']['access_token'];
    }

    protected function tearDown(): void
    {
        if (isset($this->kernel)) {
            $this->kernel->db->close();
        }
    }

    /**
     * @param array<string, mixed>|null $body
     * @return array{status: int, body: array<string, mixed>}
     */
    private function call(string $method, string $path, ?array $body = null, bool $auth = true, ?string $token = null): array
    {
        $json = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        $headers = $json === '' ? [] : ['Content-Type' => 'application/json'];
        if ($auth) {
            $headers['Authorization'] = 'Bearer ' . ($token ?? $this->token);
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

        return ['status' => $response->getStatusCode(), 'body' => $decoded];
    }

    /** @return array{id: int, uuid: string} */
    private function exercise(string $name, string $status = 'publicado', ?int $equipmentId = null, string $modalidade = 'reps_carga'): array
    {
        $uuid = \CapiFit\Support\Uuid::v4();
        $this->kernel->db->execute(
            'INSERT INTO exercicios(uuid, nome, nome_normalizado, equipamento_id, modalidade, status) VALUES (?, ?, ?, ?, ?, ?)',
            'sssiss',
            $uuid,
            $name,
            Text::normalize($name),
            $equipmentId,
            $modalidade,
            $status,
        );

        return ['id' => $this->kernel->db->lastInsertId(), 'uuid' => $uuid];
    }

    private function groupId(string $name): int
    {
        $row = $this->kernel->db->fetchOne('SELECT id FROM grupos_musculares WHERE nome = ?', 's', $name);
        self::assertNotNull($row, 'Seed de grupos musculares ausente: rode apply-schema.ps1 -WithSeed.');

        return (int) $row['id'];
    }

    private function equipmentId(string $name): int
    {
        $row = $this->kernel->db->fetchOne('SELECT id FROM equipamentos WHERE nome = ?', 's', $name);
        self::assertNotNull($row, 'Seed de equipamentos ausente: rode apply-schema.ps1 -WithSeed.');

        return (int) $row['id'];
    }

    private function muscle(int $exerciseId, int $groupId, string $role = 'primario'): void
    {
        $this->kernel->db->execute('INSERT INTO exercicios_musculos(exercicio_id, grupo_id, papel) VALUES (?, ?, ?)', 'iis', $exerciseId, $groupId, $role);
    }

    /** @return list<string> */
    private function names(string $query): array
    {
        $r = $this->call('GET', '/exercicios?' . $query);
        self::assertSame(200, $r['status'], json_encode($r['body']) ?: '');

        return array_map(static fn (array $e): string => $e['nome'], $r['body']['data']);
    }

    public function testCatalogRequiresAuthentication(): void
    {
        foreach (['/exercicios', '/grupos-musculares', '/equipamentos', '/exercicios/' . \CapiFit\Support\Uuid::v4()] as $path) {
            self::assertSame(401, $this->call('GET', $path, null, false)['status'], $path);
        }
    }

    public function testOnlyPublishedExercisesAreVisible(): void
    {
        $this->exercise("{$this->prefix} Publicado");
        $draft = $this->exercise("{$this->prefix} Rascunho", 'rascunho');
        $review = $this->exercise("{$this->prefix} Em revisão", 'em_revisao');
        $archived = $this->exercise("{$this->prefix} Arquivado", 'arquivado');

        self::assertSame(["{$this->prefix} Publicado"], $this->names('q=' . urlencode($this->prefix)));
        foreach ([$draft, $review, $archived] as $hidden) {
            self::assertSame(404, $this->call('GET', '/exercicios/' . $hidden['uuid'])['status'], 'o detalhe de não publicado deve ser 404');
            self::assertSame(404, $this->call('GET', '/exercicios/' . $hidden['uuid'] . '/midias')['status']);
            self::assertSame(404, $this->call('GET', '/exercicios/' . $hidden['uuid'] . '/alternativas')['status']);
        }
        self::assertSame(404, $this->call('GET', '/exercicios/nao-e-uuid')['status']);
    }

    public function testListItemMatchesTheContractShape(): void
    {
        $barra = $this->equipmentId('Barra livre');
        $ex = $this->exercise("{$this->prefix} Supino", 'publicado', $barra);
        $this->muscle($ex['id'], $this->groupId('Peitoral'));
        $this->muscle($ex['id'], $this->groupId('Tríceps'), 'secundario');

        $r = $this->call('GET', '/exercicios?q=' . urlencode($this->prefix));
        $item = $r['body']['data'][0];

        self::assertSame(['id', 'nome', 'equipamento', 'grupos_primarios', 'modalidade', 'miniatura_url'], array_keys($item));
        self::assertSame($ex['uuid'], $item['id']);
        self::assertSame(['id' => (string) $barra, 'nome' => 'Barra livre'], $item['equipamento']);
        self::assertSame([['id' => (string) $this->groupId('Peitoral'), 'nome' => 'Peitoral']], $item['grupos_primarios'], 'só primários, com id textual');
        self::assertSame('reps_carga', $item['modalidade']);
        self::assertSame(20, $r['body']['pagination']['limit']);
        self::assertNull($r['body']['pagination']['next_cursor']);
    }

    public function testSearchIgnoresAccentsAndCaseAndFindsSynonyms(): void
    {
        $ex = $this->exercise("{$this->prefix} Tríceps na polia");
        $this->kernel->db->execute('INSERT INTO exercicios_sinonimos(exercicio_id, termo_normalizado) VALUES (?, ?)', 'is', $ex['id'], strtolower($this->prefix) . ' pushdown');
        $this->exercise("{$this->prefix} Remada");

        self::assertSame(["{$this->prefix} Tríceps na polia"], $this->names('q=' . urlencode($this->prefix . ' TRICEPS')), 'sem acento e em maiúsculas');
        self::assertSame(["{$this->prefix} Tríceps na polia"], $this->names('q=' . urlencode($this->prefix . ' Tríceps')), 'com acento');
        self::assertSame(["{$this->prefix} Tríceps na polia"], $this->names('q=' . urlencode($this->prefix . ' pushdown')), 'por sinônimo');
        self::assertSame([], $this->names('q=' . urlencode($this->prefix . ' inexistente')));
    }

    public function testLikeWildcardsInTheQueryAreLiteral(): void
    {
        $this->exercise("{$this->prefix} Supino");

        self::assertSame([], $this->names('q=' . urlencode($this->prefix . '%')), '% não pode virar curinga');
        self::assertSame([], $this->names('q=' . urlencode($this->prefix . ' _upino')), '_ não pode virar curinga');
    }

    public function testFiltersByMuscleGroupAndEquipment(): void
    {
        $maquina = $this->equipmentId('Máquina');
        $halteres = $this->equipmentId('Halteres');
        $a = $this->exercise("{$this->prefix} A", 'publicado', $maquina);
        $b = $this->exercise("{$this->prefix} B", 'publicado', $halteres);
        $this->muscle($a['id'], $this->groupId('Peitoral'));
        $this->muscle($b['id'], $this->groupId('Dorsais'));
        $this->muscle($b['id'], $this->groupId('Peitoral'), 'secundario');

        $q = 'q=' . urlencode($this->prefix);
        self::assertSame(["{$this->prefix} A", "{$this->prefix} B"], $this->names($q . '&grupo_id=' . $this->groupId('Peitoral')), 'o filtro de grupo considera primário e secundário');
        self::assertSame(["{$this->prefix} B"], $this->names($q . '&grupo_id=' . $this->groupId('Dorsais')));
        self::assertSame(["{$this->prefix} A"], $this->names($q . '&equipamento_id=' . $maquina));
        self::assertSame(["{$this->prefix} B"], $this->names($q . '&equipamento_id=' . $halteres . '&grupo_id=' . $this->groupId('Dorsais')));
    }

    public function testCursorPaginationWalksEveryItemOnceInStableOrder(): void
    {
        $expected = [];
        foreach (['C', 'A', 'E', 'B', 'D'] as $letter) {
            $this->exercise("{$this->prefix} $letter");
            $expected[] = "{$this->prefix} $letter";
        }
        sort($expected);

        $seen = [];
        $cursor = null;
        $pages = 0;
        do {
            $r = $this->call('GET', '/exercicios?limit=2&q=' . urlencode($this->prefix) . ($cursor === null ? '' : '&cursor=' . $cursor));
            self::assertSame(200, $r['status']);
            self::assertSame(2, $r['body']['pagination']['limit']);
            foreach ($r['body']['data'] as $item) {
                $seen[] = $item['nome'];
            }
            $cursor = $r['body']['pagination']['next_cursor'];
            $pages++;
        } while ($cursor !== null && $pages < 10);

        self::assertSame($expected, $seen, 'sem repetição, sem omissão, em ordem estável');
        self::assertSame(3, $pages);
    }

    public function testPaginationParametersAreValidated(): void
    {
        foreach (['limit=0', 'limit=101', 'limit=abc', 'limit=-1', 'grupo_id=x', 'equipamento_id=1.5', 'extra=1'] as $bad) {
            $r = $this->call('GET', '/exercicios?' . $bad);
            self::assertSame(422, $r['status'], $bad);
            self::assertSame('VALIDATION_ERROR', $r['body']['error']['code']);
        }
        $r = $this->call('GET', '/exercicios?cursor=@@@');
        self::assertSame(400, $r['status']);
        self::assertSame('INVALID_JSON', $r['body']['error']['code']);
        self::assertSame('INVALID_CURSOR', $r['body']['error']['details']['reason']);
        self::assertSame(200, $this->call('GET', '/exercicios?limit=100')['status']);
    }

    public function testDetailShowsMusclesAndOnlyApprovedMedia(): void
    {
        $ex = $this->exercise("{$this->prefix} Detalhe", 'publicado', $this->equipmentId('Polia'));
        $this->muscle($ex['id'], $this->groupId('Tríceps'));
        $this->muscle($ex['id'], $this->groupId('Peitoral'), 'secundario');
        foreach (['aprovado', 'rascunho', 'em_revisao', 'rejeitado'] as $status) {
            $this->kernel->db->execute(
                "INSERT INTO midias_exercicio(exercicio_id, tipo, url_storage, status) VALUES (?, 'video_capi', ?, ?)",
                'iss',
                $ex['id'],
                "ex/{$status}.mp4",
                $status,
            );
        }

        $r = $this->call('GET', '/exercicios/' . $ex['uuid']);
        $data = $r['body']['data'];

        self::assertSame(200, $r['status']);
        self::assertSame(['id', 'nome', 'equipamento', 'musculos', 'unilateral', 'modalidade', 'dificuldade', 'instrucoes', 'observacoes_seguranca', 'midias'], array_keys($data));
        self::assertFalse($data['unilateral']);
        self::assertSame('Polia', $data['equipamento']['nome']);
        self::assertSame(['primario', 'secundario'], array_column($data['musculos'], 'papel'));
        self::assertCount(1, $data['midias'], 'só a mídia aprovada');
        self::assertStringStartsWith('https://cdn.exemplo.invalid/media/ex/aprovado.mp4?exp=', $data['midias'][0]['url']);
        self::assertStringContainsString('&sig=', $data['midias'][0]['url']);
        self::assertSame('aprovado', $data['midias'][0]['status']);

        $media = $this->call('GET', '/exercicios/' . $ex['uuid'] . '/midias');
        self::assertCount(1, $media['body']['data']);
        self::assertStringNotContainsString('rascunho', json_encode($media['body'], JSON_THROW_ON_ERROR));
        self::assertStringNotContainsString('url_storage', json_encode($data, JSON_THROW_ON_ERROR), 'a chave interna do storage nunca é exposta');
    }

    public function testMediaIsOmittedWhenNoBaseUrlIsConfigured(): void
    {
        $env = [...getenv(), 'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789'];
        if (getenv('DB_APP_USER') !== false) {
            $env['DB_USER'] = (string) getenv('DB_APP_USER');
            $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        }
        $kernel = new Kernel(Config::fromArray($env), new Logger('t', [new TestHandler()]));
        $ex = $this->exercise("{$this->prefix} SemCdn");
        $this->kernel->db->execute("INSERT INTO midias_exercicio(exercicio_id, tipo, url_storage, status) VALUES (?, 'imagem', 'x.png', 'aprovado')", 'i', $ex['id']);

        $request = new ServerRequest('GET', '/exercicios/' . $ex['uuid'], ['Authorization' => 'Bearer ' . $this->token]);
        $body = json_decode((string) $kernel->handle($request)->getBody(), true, 512, JSON_THROW_ON_ERROR);

        self::assertSame([], $body['data']['midias']);
        $kernel->db->close();
    }

    public function testAlternativesListOnlyPublishedOnes(): void
    {
        $main = $this->exercise("{$this->prefix} Principal");
        $ok = $this->exercise("{$this->prefix} AltOk");
        $draft = $this->exercise("{$this->prefix} AltRascunho", 'rascunho');
        foreach ([$ok, $draft] as $alt) {
            $this->kernel->db->execute('INSERT INTO exercicios_alternativas(exercicio_id, alternativa_id) VALUES (?, ?)', 'ii', $main['id'], $alt['id']);
        }

        $r = $this->call('GET', '/exercicios/' . $main['uuid'] . '/alternativas');

        self::assertSame(200, $r['status']);
        self::assertSame(["{$this->prefix} AltOk"], array_column($r['body']['data'], 'nome'));
    }

    public function testTaxonomiesAreListedWithStringIds(): void
    {
        $groups = $this->call('GET', '/grupos-musculares');
        $equipment = $this->call('GET', '/equipamentos');

        self::assertSame(200, $groups['status']);
        self::assertSame(16, count($groups['body']['data']));
        self::assertSame(11, count($equipment['body']['data']));
        self::assertIsString($groups['body']['data'][0]['id']);
        self::assertSame(['id', 'nome'], array_keys($equipment['body']['data'][0]));
        self::assertContains('Tríceps', array_column($groups['body']['data'], 'nome'));
    }
}
