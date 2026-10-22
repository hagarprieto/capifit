<?php

declare(strict_types=1);

namespace CapiFit\Support;

use Psr\Http\Message\ServerRequestInterface;

/**
 * Endereço do cliente, usado SOMENTE para limitar taxa (nunca é gravado em log nem no banco em claro).
 * `X-Forwarded-For` só vale quando o servidor está atrás de um proxy confiável que SOBRESCREVE o cabeçalho
 * (TRUST_FORWARDED_FOR=1); caso contrário qualquer cliente poderia forjá-lo para escapar do limite.
 */
final class ClientIp
{
    public static function from(ServerRequestInterface $request, bool $trustForwarded): string
    {
        if ($trustForwarded) {
            $forwarded = trim(explode(',', $request->getHeaderLine('X-Forwarded-For'))[0]);
            if (filter_var($forwarded, FILTER_VALIDATE_IP) !== false) {
                return $forwarded;
            }
        }
        $remote = $request->getServerParams()['REMOTE_ADDR'] ?? null;

        return is_string($remote) && filter_var($remote, FILTER_VALIDATE_IP) !== false ? $remote : 'unknown';
    }
}
