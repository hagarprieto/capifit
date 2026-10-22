<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Support\Cursor;
use CapiFit\Support\Text;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TextCursorTest extends TestCase
{
    /** @return array<string, array{string, string}> */
    public static function normalizations(): array
    {
        return [
            'acentos' => ['Tríceps na polia com corda', 'triceps na polia com corda'],
            'cedilha e til' => ['Avanço Afundo ÇÃO', 'avanco afundo cao'],
            'maiúsculas e bordas' => ['  SUPINO Reto  ', 'supino reto'],
            'sem mudança' => ['pulldown', 'pulldown'],
            'vazio' => ['   ', ''],
        ];
    }

    #[DataProvider('normalizations')]
    public function testNormalizeMatchesTheCatalogSeedRule(string $input, string $expected): void
    {
        self::assertSame($expected, Text::normalize($input));
    }

    public function testSeedAndSearchUseTheSameNormalization(): void
    {
        // A regra do seed (09_seed_catalogo.sql) é NFD + remoção de marcas; a da busca tem de produzir o mesmo para os nomes do piloto.
        $seed = file_get_contents(__DIR__ . '/../../../docs/09_seed_catalogo.sql');
        self::assertIsString($seed);
        preg_match_all("/\\('[0-9a-f-]{36}','([^']+)','([^']+)',/u", $seed, $matches, PREG_SET_ORDER);
        self::assertGreaterThan(40, count($matches));
        foreach ($matches as [, $nome, $normalizado]) {
            self::assertSame($normalizado, Text::normalize($nome), "normalização divergente para: $nome");
        }
    }

    public function testEscapeLikeNeutralizesWildcards(): void
    {
        self::assertSame('100\\%\\_\\\\x', Text::escapeLike('100%_\\x'));
    }

    public function testCursorRoundTrip(): void
    {
        $cursor = Cursor::encode(['triceps na polia com corda', 41]);

        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $cursor);
        self::assertSame(['triceps na polia com corda', 41], Cursor::decode($cursor));
    }

    /** @return array<string, array{string}> */
    public static function invalidCursors(): array
    {
        $b64 = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');

        return [
            'vazio' => [''],
            'não é base64' => ['@@@'],
            'não é JSON' => [$b64('abc')],
            'JSON escalar' => [$b64('"x"')],
            'tamanho errado' => [$b64('["a"]')],
            'tipos errados' => [$b64('[1,"a"]')],
            'id negativo' => [$b64('["a",-1]')],
            'objeto' => [$b64('{"a":1,"b":2}')],
            'muito grande' => [str_repeat('A', 401)],
        ];
    }

    #[DataProvider('invalidCursors')]
    public function testInvalidCursorsAreRejectedAsBadRequest(string $cursor): void
    {
        try {
            Cursor::decode($cursor);
            self::fail('Deveria rejeitar o cursor.');
        } catch (ApiException $e) {
            self::assertSame(ErrorCode::InvalidJson, $e->errorCode);
            self::assertSame(400, $e->status());
            self::assertSame('INVALID_CURSOR', $e->details['reason']);
        }
    }
}
