<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\IdempotencyService;
use CapiFit\Services\SessionService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Rotas /me/sessoes (contrato: docs/07_openapi.yaml, tag Sessoes). Toda escrita roda em uma transação
 * (os `SELECT ... FOR UPDATE` do serviço só travam dentro de uma). Criar e concluir exigem `Idempotency-Key`.
 */
final class SessionController
{
    public function __construct(
        private readonly SessionService $sessions,
        private readonly IdempotencyService $idempotency,
        private readonly Connection $db,
    ) {
    }

    public function create(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotency->run($user, $request, function () use ($user, $request): array {
            $result = $this->sessions->create($user, $this->body($request));

            return ['status' => $result['status'], 'body' => ['data' => $result['data'], 'meta' => ApiResponse::meta($request)]];
        });
    }

    public function list(ServerRequestInterface $request): ResponseInterface
    {
        $result = $this->sessions->list($this->user($request), $request->getQueryParams());

        return ApiResponse::list($request, $result['items'], $result['limit'], $result['next']);
    }

    public function show(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->sessions->get($this->user($request), $this->param($request, 'uuid')));
    }

    public function update(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->sessions->updateNotes($user, $this->param($request, 'uuid'), $this->body($request))));
    }

    public function updateSeries(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(
            fn (): array => $this->sessions->updateSeries($user, $this->param($request, 'uuid'), $this->param($request, 'serie_uuid'), $this->body($request)),
        ));
    }

    public function removeSeries(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        $uuid = $this->param($request, 'uuid');
        $seriesUuid = $this->param($request, 'serie_uuid');
        $this->db->transaction(function () use ($user, $uuid, $seriesUuid): bool {
            $this->sessions->removeSeries($user, $uuid, $seriesUuid);

            return true;
        });

        return ApiResponse::noContent();
    }

    public function addSeries(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        $result = $this->db->transaction(fn (): array => $this->sessions->addSeries($user, $this->param($request, 'uuid'), $this->body($request)));

        return ApiResponse::data($request, $result['data'], $result['status']);
    }

    public function addExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        $result = $this->db->transaction(fn (): array => $this->sessions->addExercise($user, $this->param($request, 'uuid'), $this->body($request)));

        return ApiResponse::data($request, $result['data'], $result['status']);
    }

    public function replaceExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        $result = $this->db->transaction(fn (): array => $this->sessions->replaceExercise($user, $this->param($request, 'uuid'), $this->param($request, 'ex_uuid'), $this->body($request)));

        return ApiResponse::data($request, $result['data'], $result['status']);
    }

    public function pause(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->sessions->pause($user, $this->param($request, 'uuid'))));
    }

    public function resume(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->sessions->resume($user, $this->param($request, 'uuid'))));
    }

    public function complete(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotency->run($user, $request, fn (): array => [
            'status' => 200,
            'body' => ['data' => $this->sessions->complete($user, $this->param($request, 'uuid'), $this->body($request)), 'meta' => ApiResponse::meta($request)],
        ]);
    }

    public function cancel(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->sessions->cancel($user, $this->param($request, 'uuid'), $this->body($request))));
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $json = $request->getAttribute('json');

        return is_array($json) ? $json : [];
    }

    private function param(ServerRequestInterface $request, string $name): string
    {
        $params = $request->getAttribute('route_params');

        return is_array($params) && is_string($params[$name] ?? null) ? $params[$name] : '';
    }

    private function user(ServerRequestInterface $request): AuthenticatedUser
    {
        $user = $request->getAttribute('auth');
        if (!$user instanceof AuthenticatedUser) {
            throw new \LogicException('Rota protegida chamada sem usuário autenticado.');
        }

        return $user;
    }
}
