<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Http\ApiResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** GET /health — monitoramento. Público, sem dados sensíveis, fora do OpenAPI (Doc 11 §6). */
final class HealthController
{
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::json(200, ['status' => 'ok']);
    }
}
