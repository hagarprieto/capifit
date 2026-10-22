<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Services\AuthService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Rotas /auth/* (contrato: docs/07_openapi.yaml, tag Auth). */
final class AuthController
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public function register(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->auth->register($this->body($request)), 201);
    }

    public function login(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->auth->login($this->body($request)));
    }

    public function refresh(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->auth->refresh($this->body($request)));
    }

    public function logout(ServerRequestInterface $request): ResponseInterface
    {
        $this->auth->logout($this->user($request));

        return ApiResponse::noContent();
    }

    public function logoutAll(ServerRequestInterface $request): ResponseInterface
    {
        $this->auth->logoutAll($this->user($request));

        return ApiResponse::noContent();
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $json = $request->getAttribute('json');

        return is_array($json) ? $json : [];
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
