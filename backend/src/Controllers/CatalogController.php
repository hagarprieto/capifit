<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Config;
use CapiFit\Http\ApiException;
use CapiFit\Http\ApiResponse;
use CapiFit\Http\ErrorCode;
use CapiFit\Presenters\ExercisePresenter;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Support\Cursor;
use CapiFit\Support\MediaUrlSigner;
use CapiFit\Support\Text;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Catálogo de exercícios (contrato: docs/07_openapi.yaml, tag Catalogo). Somente leitura. */
final class CatalogController
{
    private const DEFAULT_LIMIT = 20;
    private const MAX_LIMIT = 100;

    public function __construct(private readonly CatalogRepository $catalog, private readonly Config $config)
    {
    }

    public function list(ServerRequestInterface $request): ResponseInterface
    {
        $query = $request->getQueryParams();
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['q', 'grupo_id', 'equipamento_id', 'limit', 'cursor']);

        $q = $query['q'] ?? '';
        if (!is_string($q) || mb_strlen($q) > 100) {
            $errors->add('q', 'Deve ser um texto de até 100 caracteres.');
            $q = '';
        }
        $groupId = $this->optionalId($query, 'grupo_id', $errors);
        $equipmentId = $this->optionalId($query, 'equipamento_id', $errors);

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

        $after = null;
        if (array_key_exists('cursor', $query)) {
            $after = Cursor::decode(is_string($query['cursor']) ? $query['cursor'] : '');
        }

        $rows = $this->catalog->search(Text::normalize((string) $q), $groupId, $equipmentId, $after, $limit);
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);

        $groups = $this->catalog->primaryGroups(array_map(static fn (array $r): int => (int) $r['id'], $rows));
        $items = array_map(fn (array $r): array => ExercisePresenter::summary($r, $groups[(int) $r['id']] ?? []), $rows);
        $next = $hasMore && $rows !== [] ? Cursor::encode([(string) end($rows)['nome_normalizado'], (int) end($rows)['id']]) : null;

        return ApiResponse::list($request, $items, $limit, $next);
    }

    public function show(ServerRequestInterface $request): ResponseInterface
    {
        $row = $this->findOr404($request);
        $exerciseId = (int) $row['id'];

        return ApiResponse::data($request, [
            'id' => $row['uuid'],
            'nome' => $row['nome'],
            'equipamento' => ExercisePresenter::equipment($row),
            'musculos' => $this->catalog->muscles($exerciseId),
            'unilateral' => (bool) $row['unilateral'],
            'modalidade' => $row['modalidade'],
            'dificuldade' => $row['dificuldade'],
            'instrucoes' => $row['instrucoes'],
            'observacoes_seguranca' => $row['observacoes_seguranca'],
            'midias' => $this->mediaFor($exerciseId),
        ]);
    }

    public function alternatives(ServerRequestInterface $request): ResponseInterface
    {
        $row = $this->findOr404($request);
        $rows = $this->catalog->alternatives((int) $row['id']);
        $groups = $this->catalog->primaryGroups(array_map(static fn (array $r): int => (int) $r['id'], $rows));

        return ApiResponse::data($request, array_map(fn (array $r): array => ExercisePresenter::summary($r, $groups[(int) $r['id']] ?? []), $rows));
    }

    public function mediaList(ServerRequestInterface $request): ResponseInterface
    {
        $row = $this->findOr404($request);

        return ApiResponse::data($request, $this->mediaFor((int) $row['id']));
    }

    /** @return list<array<string, string>> */
    private function mediaFor(int $exerciseId): array
    {
        // Sem base e segredo configurados não há como montar URLs seguras: omite as mídias em vez de devolver caminhos
        // internos ou públicos. As URLs são temporárias e assinadas (E03-06).
        $signer = new MediaUrlSigner($this->config->mediaBaseUrl, $this->config->mediaSigningSecret, $this->config->mediaUrlTtlSeconds);
        if (!$signer->enabled()) {
            return [];
        }
        $media = [];
        foreach ($this->catalog->approvedMedia($exerciseId) as $m) {
            $url = $signer->sign((string) $m['url_storage']);
            if ($url !== null) {
                $media[] = ['id' => (string) $m['id'], 'tipo' => (string) $m['tipo'], 'versao' => (string) $m['versao'], 'status' => 'aprovado', 'url' => $url];
            }
        }

        return $media;
    }

    public function muscleGroups(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->catalog->taxonomy('grupos_musculares'));
    }

    public function equipmentList(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->catalog->taxonomy('equipamentos'));
    }

    /** @return array<string, mixed> */
    private function findOr404(ServerRequestInterface $request): array
    {
        $params = $request->getAttribute('route_params');
        $uuid = is_array($params) ? ($params['uuid'] ?? null) : null;
        // UUID malformado e exercício inexistente/não publicado respondem igual: 404 (sem vazamento).
        $row = Uuid::isValid($uuid) ? $this->catalog->findPublished((string) $uuid) : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /** @param array<string, mixed> $query */
    private function optionalId(array $query, string $field, FieldErrors $errors): ?int
    {
        if (!array_key_exists($field, $query)) {
            return null;
        }
        $value = $query[$field];
        if (!is_string($value) || preg_match('/^\d{1,9}$/', $value) !== 1) {
            $errors->add($field, 'Deve ser um identificador numérico.');

            return null;
        }

        return (int) $value;
    }
}
