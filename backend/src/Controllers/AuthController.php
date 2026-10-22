<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Services\AuthService;
use CapiFit\Services\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Rotas /auth/* (contrato: docs/07_openapi.yaml, tag Auth). */
final class AuthController
{
    public function __construct(private readonly AuthService $auth, private readonly RateLimiter $limiter)
    {
    }

    public function register(ServerRequestInterface $request): ResponseInterface
    {
        $this->limiter->enforce($request, 'register');

        return ApiResponse::data($request, $this->auth->register($this->body($request)), 201);
    }

    public function login(ServerRequestInterface $request): ResponseInterface
    {
        $body = $this->body($request);
        $this->limiter->enforce($request, 'login', $this->emailOf($body));

        return ApiResponse::data($request, $this->auth->login($body));
    }

    public function refresh(ServerRequestInterface $request): ResponseInterface
    {
        $this->limiter->enforce($request, 'refresh');

        return ApiResponse::data($request, $this->auth->refresh($this->body($request)));
    }

    public function forgotPassword(ServerRequestInterface $request): ResponseInterface
    {
        $body = $this->body($request);
        $this->limiter->enforce($request, 'forgot', $this->emailOf($body));
        $this->auth->requestPasswordReset($body);

        return ApiResponse::noContent();
    }

    public function resetPassword(ServerRequestInterface $request): ResponseInterface
    {
        $this->limiter->enforce($request, 'reset');
        $this->auth->resetPassword($this->body($request));

        return ApiResponse::noContent();
    }

    public function verifyEmail(ServerRequestInterface $request): ResponseInterface
    {
        $this->limiter->enforce($request, 'verify');
        $this->auth->verifyEmail($this->body($request));

        return ApiResponse::noContent();
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

    /** @param array<string, mixed> $body */
    private function emailOf(array $body): ?string
    {
        $email = $body['email'] ?? null;

        return is_string($email) && $email !== '' ? mb_strtolower(trim($email)) : null;
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
