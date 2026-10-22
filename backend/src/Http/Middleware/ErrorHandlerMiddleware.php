<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use CapiFit\Http\ApiException;
use CapiFit\Http\ApiResponse;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\DatabaseErrorTranslator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Log\LoggerInterface;

/**
 * Converte qualquer falha no envelope de erro do contrato.
 * Nunca devolve stack trace, SQL, caminho de arquivo nem mensagem interna (Doc 05 §3).
 */
final class ErrorHandlerMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly DatabaseErrorTranslator $translator = new DatabaseErrorTranslator(),
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            return $handler->handle($request);
        } catch (ApiException $e) {
            return ApiResponse::error($request, $e);
        } catch (\mysqli_sql_exception $e) {
            $translated = $this->translator->translate($e);
            if ($translated !== null) {
                return ApiResponse::error($request, $translated);
            }
            $this->logFailure($request, $e);

            return ApiResponse::error($request, new ApiException(ErrorCode::InternalError));
        } catch (\Throwable $e) {
            $this->logFailure($request, $e);

            return ApiResponse::error($request, new ApiException(ErrorCode::InternalError));
        }
    }

    private function logFailure(ServerRequestInterface $request, \Throwable $e): void
    {
        // Só classe e código no log: a mensagem de exceções de banco pode conter valores.
        $this->logger->error('Falha não tratada na requisição', [
            'request_id' => ApiResponse::requestId($request),
            'method' => $request->getMethod(),
            'path' => $request->getUri()->getPath(),
            'exception' => $e::class,
            'code' => $e->getCode(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine(),
        ]);
    }
}
