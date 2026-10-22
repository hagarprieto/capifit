<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Auth\PasswordHasher;
use CapiFit\Auth\TokenService;
use CapiFit\Config;
use Firebase\JWT\JWT;
use PHPUnit\Framework\TestCase;

final class AuthUnitTest extends TestCase
{
    private const SECRET = 'segredo-de-teste-com-mais-de-32-bytes-0123456789';

    private function tokens(string $secret = self::SECRET, string $extra = ''): TokenService
    {
        return new TokenService(Config::fromArray(['JWT_SECRET' => $secret, 'JWT_ISSUER' => 'capifit' . $extra]));
    }

    public function testAccessTokenRoundTrip(): void
    {
        $issued = $this->tokens()->issueAccessToken('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

        self::assertSame(900, $issued['expires_in']);
        self::assertSame(
            ['sub' => '11111111-1111-4111-8111-111111111111', 'sid' => '22222222-2222-4222-8222-222222222222'],
            $this->tokens()->verifyAccessToken($issued['token']),
        );
    }

    public function testTamperedSignatureIsRejected(): void
    {
        $token = $this->tokens()->issueAccessToken('u', 's')['token'];
        $parts = explode('.', $token);
        $parts[2] = strrev($parts[2]);

        self::assertNull($this->tokens()->verifyAccessToken(implode('.', $parts)));
    }

    public function testTokenSignedWithAnotherSecretIsRejected(): void
    {
        $other = $this->tokens('outro-segredo-de-teste-com-mais-de-32-bytes-999')->issueAccessToken('u', 's')['token'];

        self::assertNull($this->tokens()->verifyAccessToken($other));
    }

    public function testTokenFromAnotherIssuerIsRejected(): void
    {
        $token = $this->tokens(self::SECRET, '-outro')->issueAccessToken('u', 's')['token'];

        self::assertNull($this->tokens()->verifyAccessToken($token));
    }

    public function testExpiredTokenIsRejected(): void
    {
        $token = JWT::encode(['iss' => 'capifit', 'sub' => 'u', 'sid' => 's', 'iat' => time() - 7200, 'exp' => time() - 3600], self::SECRET, 'HS256');

        self::assertNull($this->tokens()->verifyAccessToken($token));
    }

    public function testAlgorithmNoneIsRejected(): void
    {
        $b64 = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $payload = ['iss' => 'capifit', 'sub' => 'u', 'sid' => 's', 'iat' => time(), 'exp' => time() + 600];
        $none = $b64('{"typ":"JWT","alg":"none"}') . '.' . $b64(json_encode($payload, JSON_THROW_ON_ERROR)) . '.';

        self::assertNull($this->tokens()->verifyAccessToken($none));
    }

    public function testTokenWithoutClaimsIsRejected(): void
    {
        $token = JWT::encode(['iss' => 'capifit', 'iat' => time(), 'exp' => time() + 600], self::SECRET, 'HS256');

        self::assertNull($this->tokens()->verifyAccessToken($token));
        self::assertNull($this->tokens()->verifyAccessToken('isto-nao-e-um-jwt'));
    }

    public function testShortSecretIsRefused(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->tokens('curto');
    }

    public function testRefreshTokensAreRandomUrlSafeAndHashedDeterministically(): void
    {
        $tokens = $this->tokens();
        $a = $tokens->newRefreshToken();
        $b = $tokens->newRefreshToken();

        self::assertNotSame($a, $b);
        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $a);
        self::assertSame($tokens->hashRefreshToken($a), $tokens->hashRefreshToken($a));
        self::assertNotSame($a, $tokens->hashRefreshToken($a));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $tokens->hashRefreshToken($a));
    }

    public function testPasswordHasherUsesArgon2idWithSalt(): void
    {
        $hasher = new PasswordHasher();
        $a = $hasher->hash('uma senha longa 123');
        $b = $hasher->hash('uma senha longa 123');

        self::assertStringStartsWith('$argon2id$', $a);
        self::assertNotSame($a, $b, 'cada hash tem um sal próprio');
        self::assertTrue($hasher->verify('uma senha longa 123', $a));
        self::assertFalse($hasher->verify('outra senha qualquer', $a));
        self::assertFalse($hasher->needsRehash($a));
    }

    public function testUnknownUserStillSpendsHashingTimeAndFails(): void
    {
        $hasher = new PasswordHasher();

        self::assertFalse($hasher->verify('qualquer', null));
        self::assertFalse($hasher->verify('qualquer', ''));
        $dummy = new \ReflectionClassConstant(PasswordHasher::class, 'DUMMY_HASH');
        self::assertSame('argon2id', password_get_info((string) $dummy->getValue())['algoName']);
    }
}
