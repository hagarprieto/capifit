<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Support\MediaUrlSigner;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class MediaUrlSignerTest extends TestCase
{
    private const SECRET = 'segredo-de-midia-de-teste-com-mais-de-32-bytes';

    private function signer(string $base = 'https://cdn.exemplo.invalid/media/', string $secret = self::SECRET): MediaUrlSigner
    {
        return new MediaUrlSigner($base, $secret, 600);
    }

    /** @return array{string, int, string} caminho, exp e sig extraídos da URL */
    private function parts(string $url): array
    {
        $parts = parse_url($url);
        parse_str((string) $parts['query'], $query);

        return [ltrim((string) $parts['path'], '/'), (int) $query['exp'], (string) $query['sig']];
    }

    public function testSignedUrlExpiresAndVerifies(): void
    {
        $url = $this->signer()->sign('ex/supino/v1.mp4', 1_000_000);

        self::assertNotNull($url);
        self::assertStringStartsWith('https://cdn.exemplo.invalid/media/ex/supino/v1.mp4?exp=1000600&sig=', $url);
        [, $exp, $sig] = $this->parts($url);
        self::assertSame(1_000_600, $exp);
        self::assertTrue($this->signer()->verify('ex/supino/v1.mp4', $exp, $sig, 1_000_599));
        self::assertFalse($this->signer()->verify('ex/supino/v1.mp4', $exp, $sig, 1_000_601), 'vencida');
        self::assertFalse($this->signer()->verify('ex/outro.mp4', $exp, $sig, 1_000_000), 'assinatura é da chave original');
        self::assertFalse($this->signer()->verify('ex/supino/v1.mp4', $exp + 3600, $sig, 1_000_000), 'prazo não pode ser estendido');
        self::assertFalse($this->signer('https://cdn.exemplo.invalid/', str_repeat('x', 40))->verify('ex/supino/v1.mp4', $exp, $sig, 1_000_000), 'outro segredo');
    }

    public function testDisabledWithoutBaseOrWithAWeakSecret(): void
    {
        self::assertFalse($this->signer('')->enabled());
        self::assertFalse($this->signer('https://cdn.exemplo.invalid', 'curto')->enabled());
        self::assertNull($this->signer('')->sign('ex/a.mp4'));
        self::assertNull($this->signer('https://cdn.exemplo.invalid', '')->sign('ex/a.mp4'));
    }

    /** @return array<string, array{string, bool}> */
    public static function keys(): array
    {
        return [
            'simples' => ['ex/supino/v1.mp4', true],
            'raiz' => ['a.png', true],
            'com ..' => ['ex/../segredo', false],
            'barra inicial' => ['/ex/a.mp4', false],
            'barra dupla' => ['ex//a.mp4', false],
            'esquema' => ['https://x.invalid/a.mp4', false],
            'consulta' => ['a.mp4?x=1', false],
            'espaço' => ['a b.mp4', false],
            'vazia' => ['', false],
            'muito longa' => [str_repeat('a', 601), false],
        ];
    }

    #[DataProvider('keys')]
    public function testOnlySimpleRelativeKeysAreAccepted(string $key, bool $valid): void
    {
        self::assertSame($valid, MediaUrlSigner::validKey($key));
        self::assertSame($valid, $this->signer()->sign($key) !== null);
    }
}
