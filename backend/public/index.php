<?php

declare(strict_types=1);

use CapiFit\Config;
use CapiFit\Http\ApiException;
use CapiFit\Http\ApiResponse;
use CapiFit\Http\Emitter;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Logger\LoggerFactory;
use CapiFit\Kernel;
use Dotenv\Dotenv;
use Nyholm\Psr7\Factory\Psr17Factory;
use Nyholm\Psr7Server\ServerRequestCreator;

require __DIR__ . '/../vendor/autoload.php';

// Nada de detalhes de erro no navegador; falhas vão para o log estruturado.
ini_set('display_errors', '0');
error_reporting(E_ALL);

try {
    Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
    $config = Config::fromArray($_ENV + $_SERVER);

    $factory = new Psr17Factory();
    $request = (new ServerRequestCreator($factory, $factory, $factory, $factory))->fromGlobals();

    Emitter::emit((new Kernel($config, LoggerFactory::create()))->handle($request));
} catch (Throwable $e) {
    // Falha antes de a aplicação compor a resposta (ex.: .env inválido). Sem detalhes ao cliente.
    error_log('Falha de inicialização: ' . $e::class);
    Emitter::emit(ApiResponse::error(
        (new Nyholm\Psr7\ServerRequest('GET', '/')),
        new ApiException(ErrorCode::InternalError),
    ));
}
