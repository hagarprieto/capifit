<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Cursor;
use CapiFit\Support\Dates;
use CapiFit\Validation\FieldErrors;

/**
 * Trilha de auditoria das ações administrativas (E03-07; ADM-060). Registra QUEM fez O QUÊ em qual recurso.
 * Os metadados guardam só dados do próprio conteúdo editorial (ex.: justificativa de uma rejeição), nunca dado
 * pessoal ou de saúde de usuários. A escrita acontece na mesma transação da ação auditada.
 */
final class AuditService
{
    private const DEFAULT_LIMIT = 20;
    private const MAX_LIMIT = 100;

    public function __construct(private readonly Connection $db)
    {
    }

    /** @param array<string, scalar|null> $metadata */
    public function record(AuthenticatedUser $actor, string $action, string $resource, string $resourceId, array $metadata = []): void
    {
        $this->db->execute(
            'INSERT INTO auditoria_eventos(ator_id, acao, recurso, recurso_id, metadados_json) VALUES (?, ?, ?, ?, ?)',
            'issss',
            $actor->id,
            $action,
            $resource,
            $resourceId,
            $metadata === [] ? null : json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @param array<string, mixed> $query
     * @return array{items: list<array<string, mixed>>, limit: int, next: ?string}
     */
    public function search(AuthenticatedUser $user, array $query): array
    {
        if (!$user->hasRole('admin')) {
            throw new ApiException(ErrorCode::Forbidden);
        }
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['recurso', 'recurso_id', 'limit', 'cursor']);
        $where = ['1 = 1'];
        $types = '';
        $params = [];
        foreach (['recurso' => 70, 'recurso_id' => 80] as $field => $max) {
            if (array_key_exists($field, $query)) {
                $v = $query[$field];
                if (!is_string($v) || $v === '' || mb_strlen($v) > $max) {
                    $errors->add($field, "Deve ter entre 1 e $max caracteres.");
                } else {
                    $where[] = "a.$field = ?";
                    $types .= 's';
                    $params[] = $v;
                }
            }
        }
        $limit = self::DEFAULT_LIMIT;
        if (array_key_exists('limit', $query)) {
            $raw = $query['limit'];
            if (!is_string($raw) || preg_match('/^\d{1,4}$/', $raw) !== 1 || (int) $raw < 1 || (int) $raw > self::MAX_LIMIT) {
                $errors->add('limit', 'Deve ser um número inteiro entre 1 e ' . self::MAX_LIMIT . '.');
            } else {
                $limit = (int) $raw;
            }
        }
        $errors->throwIfAny();
        if (array_key_exists('cursor', $query)) {
            $after = Cursor::decode(is_string($query['cursor']) ? $query['cursor'] : '');
            $where[] = '(a.criado_em < ? OR (a.criado_em = ? AND a.id < ?))';
            $types .= 'ssi';
            array_push($params, $after[0], $after[0], $after[1]);
        }
        $types .= 'i';
        $params[] = $limit + 1;

        $rows = $this->db->fetchAll(
            'SELECT a.id, a.acao, a.recurso, a.recurso_id, a.criado_em, u.uuid AS ator_uuid
               FROM auditoria_eventos a LEFT JOIN usuarios u ON u.id = a.ator_id
              WHERE ' . implode(' AND ', $where) . ' ORDER BY a.criado_em DESC, a.id DESC LIMIT ?',
            $types,
            ...$params,
        );
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $last = $rows === [] ? null : $rows[count($rows) - 1];

        return [
            'items' => array_map(static fn (array $r): array => [
                'id' => (string) $r['id'],
                'ator_id' => $r['ator_uuid'],
                'acao' => $r['acao'],
                'recurso' => $r['recurso'],
                'recurso_id' => $r['recurso_id'],
                'criado_em' => Dates::fromDb($r['criado_em']),
            ], $rows),
            'limit' => $limit,
            'next' => $hasMore && $last !== null ? Cursor::encode([(string) $last['criado_em'], (int) $last['id']]) : null,
        ];
    }
}
