<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Auth\PasswordHasher;
use CapiFit\Auth\TokenService;
use CapiFit\Config;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;
use Psr\Log\LoggerInterface;

/**
 * Cadastro, login, renovação e encerramento de sessões (Doc 05 §4; Doc 06 D-09, D-11).
 *
 * Refresh token: opaco, guardado só como hash, com rotação a cada uso. Reuso de um token já rotacionado
 * indica roubo: a família inteira é revogada — exceto dentro de uma janela curta de tolerância
 * (REFRESH_REUSE_GRACE, padrão 10 s), em que a segunda chamada apenas recebe 401 (duas renovações
 * simultâneas do mesmo cliente não derrubam a sessão).
 */
final class AuthService
{
    private const PAPEL_ALUNO = 1;

    public function __construct(
        private readonly Connection $db,
        private readonly Config $config,
        private readonly TokenService $tokens,
        private readonly PasswordHasher $hasher,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function register(array $input): array
    {
        // Menor de idade declarado: nada é gravado (CT-04, D-09).
        $adult = $input['maior_de_18'] ?? null;
        if ($adult === false) {
            throw new ApiException(ErrorCode::UnderageNotAllowed);
        }

        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['nome', 'email', 'senha', 'aceita_termos', 'versao_termos', 'versao_privacidade', 'maior_de_18', 'dispositivo_uuid']);

        $nome = $this->trimmed($input, 'nome');
        $nome = $errors->requireString(['nome' => $nome], 'nome', 1, 160);
        $email = $this->validEmail($input, $errors);
        $senha = $errors->requireString($input, 'senha', 10, 200);
        if ($senha !== null && $email !== null && strcasecmp($senha, $email) === 0) {
            $errors->add('senha', 'A senha não pode ser igual ao e-mail.');
        }
        if (($input['aceita_termos'] ?? null) !== true) {
            $errors->add('aceita_termos', 'É necessário aceitar os termos de uso e a política de privacidade.');
        }
        if ($adult !== true) {
            $errors->add('maior_de_18', 'Informe que você é maior de 18 anos.');
        }
        $versaoTermos = $errors->requireString($input, 'versao_termos', 1, 30);
        $versaoPrivacidade = $errors->requireString($input, 'versao_privacidade', 1, 30);
        $device = $this->optionalUuid($input, 'dispositivo_uuid', $errors);
        $errors->throwIfAny();

        /** @var string $nome @var string $email @var string $senha @var string $versaoTermos @var string $versaoPrivacidade */
        $uuid = Uuid::v4();
        $hash = $this->hasher->hash($senha);

        try {
            return $this->db->transaction(function () use ($uuid, $nome, $email, $hash, $versaoTermos, $versaoPrivacidade, $device): array {
                $this->db->execute(
                    "INSERT INTO usuarios(uuid, nome, email, senha_hash, estado, maioridade_declarada_em) VALUES (?, ?, ?, ?, 'ativo', NOW(6))",
                    'ssss',
                    $uuid,
                    $nome,
                    $email,
                    $hash,
                );
                $userId = $this->db->lastInsertId();
                $this->db->execute('INSERT INTO usuarios_papeis(usuario_id, papel_id) VALUES (?, ?)', 'ii', $userId, self::PAPEL_ALUNO);
                $this->db->execute("INSERT INTO consentimentos_privacidade(usuario_id, tipo, versao_documento) VALUES (?, 'termos_uso', ?)", 'is', $userId, $versaoTermos);
                $this->db->execute("INSERT INTO consentimentos_privacidade(usuario_id, tipo, versao_documento) VALUES (?, 'politica_privacidade', ?)", 'is', $userId, $versaoPrivacidade);

                return $this->openSession($userId, $uuid, $nome, ['aluno'], Uuid::v4(), $device);
            });
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && str_contains($e->getMessage(), 'uq_usuarios_email')) {
                throw new ApiException(ErrorCode::EmailAlreadyRegistered, null, [], [], $e);
            }
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function login(array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['email', 'senha', 'dispositivo_uuid']);
        $email = $this->validEmail($input, $errors);
        $senha = $errors->requireString($input, 'senha', 1, 200);
        $device = $this->optionalUuid($input, 'dispositivo_uuid', $errors);
        $errors->throwIfAny();
        /** @var string $email @var string $senha */

        $user = $this->db->fetchOne('SELECT id, uuid, nome, senha_hash, estado FROM usuarios WHERE email = ?', 's', $email);
        // O hash é verificado mesmo quando o e-mail não existe (mesmo custo de tempo).
        $passwordOk = $this->hasher->verify($senha, $user === null ? null : (is_string($user['senha_hash']) ? $user['senha_hash'] : null));
        if ($user === null || !$passwordOk || $user['estado'] !== 'ativo') {
            throw new ApiException(ErrorCode::Unauthenticated, 'E-mail ou senha incorretos.');
        }

        $userId = (int) $user['id'];
        if (is_string($user['senha_hash']) && $this->hasher->needsRehash($user['senha_hash'])) {
            $this->db->execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', 'si', $this->hasher->hash($senha), $userId);
        }

        return $this->db->transaction(fn (): array => $this->openSession($userId, (string) $user['uuid'], (string) $user['nome'], $this->rolesOf($userId), Uuid::v4(), $device));
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function refresh(array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['refresh_token', 'dispositivo_uuid']);
        $token = $errors->requireString($input, 'refresh_token', 20, 200);
        $device = $this->optionalUuid($input, 'dispositivo_uuid', $errors);
        $errors->throwIfAny();
        /** @var string $token */

        $hash = $this->tokens->hashRefreshToken($token);
        $grace = $this->config->refreshReuseGraceSeconds;

        $outcome = $this->db->transaction(function () use ($hash, $grace, $device): array {
            $row = $this->db->fetchOne(
                'SELECT id, usuario_id, familia_uuid, usado_em, revogado_em, (expira_em <= NOW(6)) AS expirada,
                        TIMESTAMPDIFF(SECOND, usado_em, NOW(6)) AS segundos_desde_uso
                   FROM sessoes_autenticacao WHERE refresh_hash = ? FOR UPDATE',
                's',
                $hash,
            );
            if ($row === null || $row['revogado_em'] !== null || (int) $row['expirada'] === 1) {
                return ['status' => 'invalid'];
            }
            $family = (string) $row['familia_uuid'];
            if ($row['usado_em'] !== null) {
                if ((int) $row['segundos_desde_uso'] <= $grace) {
                    return ['status' => 'reuse_within_grace'];
                }
                $this->revokeFamily($family);

                return ['status' => 'reuse_revoked', 'family' => $family];
            }

            $user = $this->db->fetchOne('SELECT id, uuid, nome, estado FROM usuarios WHERE id = ?', 'i', $row['usuario_id']);
            if ($user === null || $user['estado'] !== 'ativo') {
                return ['status' => 'invalid'];
            }
            $this->db->execute('UPDATE sessoes_autenticacao SET usado_em = NOW(6) WHERE id = ?', 'i', $row['id']);
            $userId = (int) $user['id'];

            return ['status' => 'ok', 'tokens' => $this->openSession($userId, (string) $user['uuid'], (string) $user['nome'], $this->rolesOf($userId), $family, $device)];
        });

        if ($outcome['status'] === 'ok') {
            return $outcome['tokens'];
        }
        if ($outcome['status'] === 'reuse_revoked') {
            // Sem dado pessoal: só o identificador opaco da família.
            $this->logger->warning('Reuso de refresh token: família revogada', ['event' => 'auth.refresh_reuse', 'family' => $outcome['family']]);
        }
        throw new ApiException(ErrorCode::Unauthenticated, 'Sessão expirada. Entre novamente.');
    }

    public function logout(AuthenticatedUser $user): void
    {
        $this->revokeFamily($user->familyUuid);
    }

    public function logoutAll(AuthenticatedUser $user): void
    {
        $this->db->execute('UPDATE sessoes_autenticacao SET revogado_em = NOW(6) WHERE usuario_id = ? AND revogado_em IS NULL', 'i', $user->id);
    }

    private function revokeFamily(string $family): void
    {
        $this->db->execute('UPDATE sessoes_autenticacao SET revogado_em = NOW(6) WHERE familia_uuid = ? AND revogado_em IS NULL', 's', $family);
    }

    /**
     * Cria a linha de sessão (refresh token hasheado) e emite o par de tokens.
     *
     * @param list<string> $roles
     * @return array<string, mixed>
     */
    private function openSession(int $userId, string $userUuid, string $name, array $roles, string $family, ?string $device): array
    {
        $sessionUuid = Uuid::v4();
        $refresh = $this->tokens->newRefreshToken();
        $this->db->execute(
            'INSERT INTO sessoes_autenticacao(uuid, usuario_id, dispositivo_uuid, familia_uuid, refresh_hash, expira_em)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(6), INTERVAL ? SECOND))',
            'sisssi',
            $sessionUuid,
            $userId,
            $device,
            $family,
            $this->tokens->hashRefreshToken($refresh),
            $this->config->refreshTtlSeconds,
        );
        $access = $this->tokens->issueAccessToken($userUuid, $sessionUuid);

        return [
            'access_token' => $access['token'],
            'expires_in' => $access['expires_in'],
            'refresh_token' => $refresh,
            'token_type' => 'Bearer',
            'usuario' => ['id' => $userUuid, 'nome' => $name, 'papeis' => $roles],
        ];
    }

    /** @return list<string> */
    private function rolesOf(int $userId): array
    {
        return array_map(
            static fn (array $r): string => (string) $r['codigo'],
            $this->db->fetchAll('SELECT p.codigo FROM usuarios_papeis up JOIN papeis p ON p.id = up.papel_id WHERE up.usuario_id = ? ORDER BY p.id', 'i', $userId),
        );
    }

    /** @param array<string, mixed> $input */
    private function trimmed(array $input, string $field): mixed
    {
        $value = $input[$field] ?? null;

        return is_string($value) ? trim($value) : $value;
    }

    /** @param array<string, mixed> $input */
    private function validEmail(array $input, FieldErrors $errors): ?string
    {
        $value = $this->trimmed($input, 'email');
        if (!is_string($value) || $value === '') {
            $errors->add('email', 'Informe o e-mail.');

            return null;
        }
        $value = mb_strtolower($value);
        if (mb_strlen($value) > 190 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            $errors->add('email', 'E-mail inválido.');

            return null;
        }

        return $value;
    }

    /** @param array<string, mixed> $input */
    private function optionalUuid(array $input, string $field, FieldErrors $errors): ?string
    {
        if (!array_key_exists($field, $input) || $input[$field] === null) {
            return null;
        }
        if (!Uuid::isValid($input[$field])) {
            $errors->add($field, 'Deve ser um UUID válido.');

            return null;
        }

        return (string) $input[$field];
    }
}
