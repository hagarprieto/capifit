<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Support\ClientIp;
use Nyholm\Psr7\ServerRequest;
use PHPUnit\Framework\TestCase;

final class ClientIpTest extends TestCase
{
    /**
     * @param array<string, string> $headers
     * @param array<string, string> $server
     */
    private function request(array $headers = [], array $server = []): ServerRequest
    {
        return new ServerRequest('GET', '/x', $headers, null, '1.1', $server);
    }

    public function testUsesRemoteAddrByDefaultAndIgnoresForwardedFor(): void
    {
        $r = $this->request(['X-Forwarded-For' => '203.0.113.9'], ['REMOTE_ADDR' => '198.51.100.4']);

        self::assertSame('198.51.100.4', ClientIp::from($r, false));
    }

    public function testUsesTheFirstForwardedAddressOnlyWhenTrusted(): void
    {
        $r = $this->request(['X-Forwarded-For' => '203.0.113.9, 10.0.0.1'], ['REMOTE_ADDR' => '10.0.0.1']);

        self::assertSame('203.0.113.9', ClientIp::from($r, true));
    }

    public function testInvalidValuesFallBackSafely(): void
    {
        self::assertSame('10.0.0.1', ClientIp::from($this->request(['X-Forwarded-For' => 'lixo, ; drop'], ['REMOTE_ADDR' => '10.0.0.1']), true));
        self::assertSame('unknown', ClientIp::from($this->request(), false));
        self::assertSame('unknown', ClientIp::from($this->request([], ['REMOTE_ADDR' => 'não-é-ip']), false));
        self::assertSame('2001:db8::1', ClientIp::from($this->request([], ['REMOTE_ADDR' => '2001:db8::1']), false));
    }
}
