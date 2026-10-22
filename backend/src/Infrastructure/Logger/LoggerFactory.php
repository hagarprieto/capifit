<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Logger;

use Monolog\Formatter\JsonFormatter;
use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;
use Psr\Log\LoggerInterface;

final class LoggerFactory
{
    /** Log estruturado (JSON, uma linha por evento) em stderr, com redação de campos sensíveis. */
    public static function create(string $stream = 'php://stderr', Level $level = Level::Info): LoggerInterface
    {
        $handler = new StreamHandler($stream, $level);
        $handler->setFormatter(new JsonFormatter(JsonFormatter::BATCH_MODE_NEWLINES, true));

        $logger = new Logger('capifit');
        $logger->pushHandler($handler);
        $logger->pushProcessor(new RedactingProcessor());

        return $logger;
    }
}
