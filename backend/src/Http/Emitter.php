<?php

declare(strict_types=1);

namespace CapiFit\Http;

use Psr\Http\Message\ResponseInterface;

/** Envia a resposta PSR-7 ao cliente (SAPI). */
final class Emitter
{
    public static function emit(ResponseInterface $response): void
    {
        if (!headers_sent()) {
            header_remove('X-Powered-By');
            http_response_code($response->getStatusCode());
            foreach ($response->getHeaders() as $name => $values) {
                foreach ($values as $i => $value) {
                    header($name . ': ' . $value, $i === 0);
                }
            }
        }

        if ($response->getStatusCode() === 204) {
            return;
        }
        echo $response->getBody();
    }
}
