<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ApiResponse;
use CapiFit\Http\ErrorCode;
use CapiFit\Http\RequestContext;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Uuid;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Cabeçalho `Idempotency-Key` (Doc 05 §3; CT-50…CT-52): a mesma chave com o mesmo corpo devolve a resposta
 * original sem repetir o efeito; com corpo diferente, 409 IDEMPOTENCY_KEY_REUSED.
 *
 * A reserva da chave, a operação e o armazenamento da resposta acontecem na MESMA transação:
 *  - se a operação falha, nada é gravado e o cliente pode tentar de novo (erros não ficam em cache);
 *  - duas requisições simultâneas com a mesma chave: a segunda espera a primeira terminar e então repete a resposta.
 * Só respostas de sucesso (2xx) são guardadas.
 */
final class IdempotencyService
{
    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * @param callable(): array{status: int, body: array<string, mixed>} $work executa a operação (dentro da transação)
     */
    public function run(AuthenticatedUser $user, ServerRequestInterface $request, callable $work): ResponseInterface
    {
        $key = $request->getHeaderLine('Idempotency-Key');
        if (!Uuid::isValid($key)) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['Idempotency-Key' => ['Informe o cabeçalho Idempotency-Key com um UUID.']]]);
        }
        $key = strtolower($key);
        $context = $request->getAttribute('context');
        $route = $context instanceof RequestContext && $context->routePattern !== null ? $context->routePattern : $request->getUri()->getPath();
        $hash = hash('sha256', $request->getMethod() . "\n" . $request->getUri()->getPath() . "\n" . trim((string) $request->getBody()));

        try {
            $result = $this->db->transaction(function () use ($user, $key, $request, $route, $hash, $work): array {
                $this->db->execute(
                    'INSERT INTO requisicoes_idempotentes(usuario_id, chave, metodo, rota, payload_hash) VALUES (?, ?, ?, ?, ?)',
                    'issss',
                    $user->id,
                    $key,
                    $request->getMethod(),
                    mb_substr($route, 0, 190),
                    $hash,
                );
                $out = $work();
                $this->db->execute(
                    'UPDATE requisicoes_idempotentes SET status_http = ?, resposta_json = ? WHERE usuario_id = ? AND chave = ?',
                    'isis',
                    $out['status'],
                    json_encode($out['body'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION),
                    $user->id,
                    $key,
                );

                return $out;
            });

            return ApiResponse::json($result['status'], $result['body']);
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() !== 1062) {
                throw $e;
            }
        }

        // Chave já usada (e confirmada): confere o conteúdo e repete a resposta guardada.
        $row = $this->db->fetchOne('SELECT payload_hash, status_http, resposta_json FROM requisicoes_idempotentes WHERE usuario_id = ? AND chave = ?', 'is', $user->id, $key);
        if ($row === null || $row['payload_hash'] !== $hash) {
            throw new ApiException(ErrorCode::IdempotencyKeyReused);
        }
        if ($row['status_http'] === null || !is_string($row['resposta_json'])) {
            throw new ApiException(ErrorCode::IdempotencyKeyReused, 'A operação desta chave ainda está em andamento. Tente novamente.', ['reason' => 'IN_PROGRESS'], ['Retry-After' => '1']);
        }
        /** @var array<string, mixed> $body */
        $body = json_decode($row['resposta_json'], true, 512, JSON_THROW_ON_ERROR);

        return ApiResponse::json((int) $row['status_http'], $body, ['Idempotent-Replayed' => 'true']);
    }
}
