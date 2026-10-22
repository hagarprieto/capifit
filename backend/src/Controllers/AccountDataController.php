<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\ConsentService;
use CapiFit\Services\DeviceService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Consentimentos (tag Privacidade) e dispositivos de sincronização (tag Conta) do próprio usuário. */
final class AccountDataController
{
    public function __construct(
        private readonly ConsentService $consents,
        private readonly DeviceService $devices,
        private readonly Connection $db,
    ) {
    }

    public function listConsents(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->consents->list($this->user($request)));
    }

    public function grantConsent(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->consents->grant($user, $this->body($request))), 201);
    }

    public function revokeConsent(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->consents->revoke($user, $this->param($request, 'id'))));
    }

    public function listDevices(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->devices->list($this->user($request)));
    }

    public function registerDevice(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->devices->register($user, $this->body($request))), 201);
    }

    public function revokeDevice(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        $this->db->transaction(fn (): null => $this->devices->revoke($user, $this->param($request, 'uuid')));

        return ApiResponse::noContent();
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
