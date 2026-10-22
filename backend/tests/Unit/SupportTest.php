<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Config;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\DatabaseErrorTranslator;
use CapiFit\Infrastructure\Logger\RedactingProcessor;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

final class SupportTest extends TestCase
{
    public function testErrorCodesMatchOpenApiContract(): void
    {
        $spec = Yaml::parseFile(__DIR__ . '/../../../docs/07_openapi.yaml');
        $contract = $spec['components']['schemas']['ErrorCode']['enum'];
        $implemented = array_map(static fn (ErrorCode $c): string => $c->value, ErrorCode::cases());

        sort($contract);
        sort($implemented);
        self::assertSame($contract, $implemented, 'ErrorCode do PHP divergiu do OpenAPI (docs/07_openapi.yaml).');
    }

    public function testEveryErrorCodeHasMessageAndValidStatus(): void
    {
        foreach (ErrorCode::cases() as $code) {
            self::assertNotSame('', $code->defaultMessage());
            self::assertGreaterThanOrEqual(400, $code->status());
            self::assertLessThan(600, $code->status());
        }
    }

    public function testRedactingProcessorMasksSensitiveKeysAtAnyDepth(): void
    {
        $handler = new TestHandler();
        $logger = new Logger('t', [$handler]);
        $logger->pushProcessor(new RedactingProcessor());

        $logger->info('login', [
            'email_dominio' => 'exemplo.invalid',
            'senha' => 'hunter2',
            'corpo' => ['Authorization' => 'Bearer abc', 'refresh_token' => 'r', 'nested' => ['restricoes' => ['lombar'], 'ok' => 1]],
        ]);
        $context = $handler->getRecords()[0]->context;
        $json = json_encode($context, JSON_THROW_ON_ERROR);

        self::assertSame(RedactingProcessor::REDACTED, $context['senha']);
        self::assertSame(RedactingProcessor::REDACTED, $context['corpo']['Authorization']);
        self::assertSame(RedactingProcessor::REDACTED, $context['corpo']['nested']['restricoes']);
        self::assertSame(1, $context['corpo']['nested']['ok']);
        foreach (['hunter2', 'Bearer abc', 'lombar'] as $secret) {
            self::assertStringNotContainsString($secret, $json);
        }
    }

    #[DataProvider('triggerMessages')]
    public function testTriggerMessagesAreTranslated(string $message, ErrorCode $expected): void
    {
        $e = new \mysqli_sql_exception($message, 1644);
        (new \ReflectionProperty(\mysqli_sql_exception::class, 'sqlstate'))->setValue($e, '45000');

        $translated = (new DatabaseErrorTranslator())->translate($e);

        self::assertNotNull($translated);
        self::assertSame($expected, $translated->errorCode);
        self::assertSame(409, $translated->status());
    }

    /** @return array<string, array{string, ErrorCode}> */
    public static function triggerMessages(): array
    {
        return [
            'versão imutável' => ['VERSION_IMMUTABLE: ficha em versao publicada', ErrorCode::VersionImmutable],
            'modelo imutável' => ['MODEL_IMMUTABLE: modelo aprovado nao e editado', ErrorCode::VersionImmutable],
            'sessão encerrada' => ['SESSION_CLOSED: sessao encerrada', ErrorCode::SessionClosed],
        ];
    }

    public function testDuplicateOpenSessionIsTranslatedAndOthersAreNot(): void
    {
        $translator = new DatabaseErrorTranslator();

        $open = $translator->translate(new \mysqli_sql_exception("Duplicate entry '1' for key 'uq_sessao_em_andamento'", 1062));
        self::assertSame(ErrorCode::SessionAlreadyOpen, $open?->errorCode);

        self::assertNull($translator->translate(new \mysqli_sql_exception("Duplicate entry 'a' for key 'uq_usuarios_email'", 1062)));
        self::assertNull($translator->translate(new \mysqli_sql_exception('qualquer outra falha', 1146)));
    }

    public function testConfigParsesEnvironment(): void
    {
        $config = Config::fromArray([
            'APP_ENV' => 'local', 'DB_PORT' => '3307', 'CORS_ORIGINS' => ' https://a.invalid , ,https://b.invalid ', 'MAX_BODY_BYTES' => '10',
        ]);

        self::assertSame(3307, $config->dbPort);
        self::assertSame(['https://a.invalid', 'https://b.invalid'], $config->corsOrigins);
        self::assertSame(1024, $config->maxBodyBytes, 'limite mínimo de 1 KB');
        self::assertSame('production', Config::fromArray([])->env);
        self::assertSame([], Config::fromArray([])->corsOrigins);
    }
}
