<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Valida tamanho e tipo do corpo antes do controlador e expõe o JSON em `json`.
 * Corpo vazio => `json` nulo. Corpo que não é objeto/lista JSON => 400 INVALID_JSON.
 */
final class JsonBodyMiddleware implements MiddlewareInterface
{
    private const WITH_BODY = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(private readonly int $maxBytes)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!in_array($request->getMethod(), self::WITH_BODY, true)) {
            return $handler->handle($request->withAttribute('json', null));
        }

        $declared = $request->getHeaderLine('Content-Length');
        if ($declared !== '' && ctype_digit($declared) && (int) $declared > $this->maxBytes) {
            throw $this->tooLarge();
        }

        $stream = $request->getBody();
        $raw = $stream->getSize() === 0 ? '' : (string) $stream;
        if (strlen($raw) > $this->maxBytes) {
            throw $this->tooLarge();
        }
        if (trim($raw) === '') {
            return $handler->handle($request->withAttribute('json', null));
        }

        $type = strtolower(trim(explode(';', $request->getHeaderLine('Content-Type'))[0]));
        if ($type !== 'application/json') {
            throw new ApiException(ErrorCode::InvalidJson, 'O corpo deve ser enviado como application/json.', ['reason' => 'UNSUPPORTED_CONTENT_TYPE']);
        }

        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException(ErrorCode::InvalidJson, null, ['reason' => 'MALFORMED_JSON']);
        }
        if (!is_array($decoded)) {
            throw new ApiException(ErrorCode::InvalidJson, 'O corpo deve ser um objeto ou uma lista JSON.', ['reason' => 'NOT_AN_OBJECT']);
        }

        return $handler->handle($request->withAttribute('json', $decoded));
    }

    private function tooLarge(): ApiException
    {
        return new ApiException(ErrorCode::InvalidJson, 'O corpo da requisição excede o tamanho máximo.', ['reason' => 'BODY_TOO_LARGE', 'max_bytes' => $this->maxBytes]);
    }
}
