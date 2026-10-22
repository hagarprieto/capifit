<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Infrastructure\Logger\RedactingProcessor;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use PHPUnit\Framework\TestCase;

/** Segunda barreira do log (E02-05): chaves sensíveis e padrões de dado pessoal ou token dentro de qualquer texto. */
final class RedactingProcessorTest extends TestCase
{
    private TestHandler $handler;
    private Logger $logger;

    protected function setUp(): void
    {
        $this->handler = new TestHandler();
        $this->logger = new Logger('t', [$this->handler]);
        $this->logger->pushProcessor(new RedactingProcessor());
    }

    public function testPatternsAreScrubbedFromTheMessageAndFromAnyContextValue(): void
    {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.assinatura_abc-123';
        $opaque = str_repeat('aB3-', 11); // 44 caracteres, aparência de refresh token
        $this->logger->warning("Falha para fulano@exemplo.com com $jwt", [
            'detalhe' => "Authorization: Bearer abc.def-123 e $opaque",
            'aninhado' => ['linha' => 'contato: outra.pessoa+tag@sub.dominio.com.br'],
        ]);

        $record = $this->handler->getRecords()[0];
        $text = $record->message . json_encode($record->context);
        foreach (['fulano@exemplo.com', 'outra.pessoa', $jwt, 'abc.def-123', $opaque] as $secret) {
            self::assertStringNotContainsString($secret, $text);
        }
        self::assertStringContainsString('[EMAIL]', $record->message);
        self::assertStringContainsString('[JWT]', $record->message);
        self::assertStringContainsString('Bearer [REDACTED]', (string) $record->context['detalhe']);
        self::assertStringContainsString('[TOKEN]', (string) $record->context['detalhe']);
    }

    public function testSensitiveKeysAreMaskedAtAnyDepthIncludingPersonalAndNetworkData(): void
    {
        $this->logger->info('x', ['email' => 'a', 'Nome' => 'b', 'nested' => ['observacoes' => 'c', 'ip' => '10.0.0.1', 'storage_key' => 'k/v.mp4', 'justificativa' => 'd'], 'ok' => 'visível']);

        $context = $this->handler->getRecords()[0]->context;
        self::assertSame(RedactingProcessor::REDACTED, $context['email']);
        self::assertSame(RedactingProcessor::REDACTED, $context['Nome']);
        self::assertSame([RedactingProcessor::REDACTED, RedactingProcessor::REDACTED, RedactingProcessor::REDACTED, RedactingProcessor::REDACTED], array_values((array) $context['nested']));
        self::assertSame('visível', $context['ok']);
    }

    public function testOrdinaryOperationalValuesAreKept(): void
    {
        $this->logger->info('request', ['request_id' => 'req_97d2abf65e5ae062119d1ae397', 'route' => '/me/sessoes/{uuid}', 'status' => 200, 'family' => '3f2b8c1e-6a43-4d0e-9a38-7a1f6a0c9f11', 'exception' => 'CapiFit\\Http\\ApiException']);

        $context = $this->handler->getRecords()[0]->context;
        self::assertSame('req_97d2abf65e5ae062119d1ae397', $context['request_id']);
        self::assertSame('/me/sessoes/{uuid}', $context['route']);
        self::assertSame('3f2b8c1e-6a43-4d0e-9a38-7a1f6a0c9f11', $context['family']);
        self::assertSame('CapiFit\\Http\\ApiException', $context['exception']);
    }
}
