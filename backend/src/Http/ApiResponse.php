<?php

declare(strict_types=1);

namespace CapiFit\Http;

use Nyholm\Psr7\Factory\Psr17Factory;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Monta respostas no envelope do contrato (Doc 05 §3.1/§3.2; Doc 07 §3.2). */
final class ApiResponse
{
    public const SCHEMA_VERSION = '1.0';

    /**
     * @param array<string, mixed>|list<mixed> $body
     * @param array<string, string> $headers
     */
    public static function json(int $status, array $body, array $headers = []): ResponseInterface
    {
        $factory = new Psr17Factory();
        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        $response = $factory->createResponse($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withBody($factory->createStream($json));
        foreach ($headers as $name => $value) {
            $response = $response->withHeader($name, $value);
        }

        return $response;
    }

    public static function noContent(): ResponseInterface
    {
        return (new Psr17Factory())->createResponse(204)
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    public static function data(ServerRequestInterface $request, mixed $data, int $status = 200): ResponseInterface
    {
        return self::json($status, ['data' => $data, 'meta' => self::meta($request)]);
    }

    /** @param list<mixed> $items */
    public static function list(ServerRequestInterface $request, array $items, int $limit, ?string $nextCursor): ResponseInterface
    {
        return self::json(200, [
            'data' => $items,
            'pagination' => ['limit' => $limit, 'next_cursor' => $nextCursor],
            'meta' => self::meta($request),
        ]);
    }

    public static function error(ServerRequestInterface $request, ApiException $e): ResponseInterface
    {
        $error = [
            'code' => $e->errorCode->value,
            'message' => $e->getMessage(),
            'request_id' => self::requestId($request),
        ];
        if ($e->details !== []) {
            $error['details'] = $e->details;
        }

        return self::json($e->status(), ['error' => $error], $e->headers);
    }

    /** @return array<string, string> */
    public static function meta(ServerRequestInterface $request): array
    {
        return ['request_id' => self::requestId($request), 'schema_version' => self::SCHEMA_VERSION];
    }

    public static function requestId(ServerRequestInterface $request): string
    {
        $id = $request->getAttribute('request_id');

        return is_string($id) ? $id : 'req_unknown';
    }
}
