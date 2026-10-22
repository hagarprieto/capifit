<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Validation\FieldErrors;

/**
 * Dados da própria conta (`PATCH /me`) e perfil de treino (`/me/perfil-treinamento`) — E01-04.
 * `restricoes` é dado sensível (saúde): só o próprio usuário o lê aqui, nunca vai para log, e a validação
 * não ecoa o conteúdo nas mensagens de erro.
 */
final class ProfileService
{
    private const LEVELS = ['iniciante', 'intermediario', 'avancado'];
    private const GOALS = ['hipertrofia', 'forca', 'condicionamento', 'outro'];
    private const AREAS = ['ombro', 'cotovelo', 'punho', 'coluna_cervical', 'lombar', 'quadril', 'joelho', 'tornozelo'];
    private const MAX_JSON_BYTES = 4096;

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, mixed> */
    public function account(AuthenticatedUser $user): array
    {
        $row = $this->db->fetchOne(
            'SELECT uuid, nome, email, fuso_horario, unidade_peso, idioma, email_verificado_em FROM usuarios WHERE id = ?',
            'i',
            $user->id,
        );
        if ($row === null) {
            throw new ApiException(ErrorCode::Unauthenticated);
        }

        return [
            'id' => $row['uuid'],
            'nome' => $row['nome'],
            'email' => $row['email'],
            'papeis' => $user->roles,
            'fuso_horario' => $row['fuso_horario'],
            'unidade_peso' => $row['unidade_peso'],
            'idioma' => $row['idioma'],
            'email_verificado' => $row['email_verificado_em'] !== null,
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateAccount(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['nome', 'fuso_horario', 'unidade_peso', 'idioma']);
        if ($input === []) {
            $errors->add('corpo', 'Informe ao menos um campo.');
        }
        $changes = [];
        if (array_key_exists('nome', $input)) {
            $name = is_string($input['nome']) ? trim($input['nome']) : null;
            if ($name === null || mb_strlen($name) < 1 || mb_strlen($name) > 160) {
                $errors->add('nome', 'Deve ter entre 1 e 160 caracteres.');
            } else {
                $changes['nome'] = $name;
            }
        }
        if (array_key_exists('fuso_horario', $input)) {
            $zone = $input['fuso_horario'];
            if (!is_string($zone) || !in_array($zone, \DateTimeZone::listIdentifiers(), true)) {
                $errors->add('fuso_horario', 'Informe um fuso horário IANA válido (ex.: America/Sao_Paulo).');
            } else {
                $changes['fuso_horario'] = $zone;
            }
        }
        if (array_key_exists('unidade_peso', $input)) {
            $unit = $input['unidade_peso'];
            if (!is_string($unit) || !in_array($unit, ['kg', 'lb'], true)) {
                $errors->add('unidade_peso', 'Use kg ou lb.');
            } else {
                $changes['unidade_peso'] = $unit;
            }
        }
        if (array_key_exists('idioma', $input)) {
            $lang = $input['idioma'];
            if (!is_string($lang) || preg_match('/^[a-z]{2,3}(-[A-Z]{2})?$/', $lang) !== 1) {
                $errors->add('idioma', 'Use um código como pt-BR.');
            } else {
                $changes['idioma'] = $lang;
            }
        }
        $errors->throwIfAny();

        // Nomes de coluna vêm do código (chaves acima), nunca do cliente.
        $sets = implode(', ', array_map(static fn (string $c): string => "$c = ?", array_keys($changes)));
        $this->db->execute("UPDATE usuarios SET $sets WHERE id = ?", str_repeat('s', count($changes)) . 'i', ...array_values($changes), ...[$user->id]);

        return $this->account($user);
    }

    /** @return array<string, mixed> */
    public function trainingProfile(AuthenticatedUser $user): array
    {
        $row = $this->db->fetchOne('SELECT nivel, objetivo, dias_semana, minutos_sessao, preferencias_json, restricoes_json FROM perfis_treinamento WHERE usuario_id = ?', 'i', $user->id);
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return [
            'nivel' => $row['nivel'],
            'objetivo' => $row['objetivo'],
            'dias_semana' => $row['dias_semana'] === null ? null : (int) $row['dias_semana'],
            'minutos_sessao' => $row['minutos_sessao'] === null ? null : (int) $row['minutos_sessao'],
            'preferencias' => $this->decode($row['preferencias_json']),
            'restricoes' => $this->decode($row['restricoes_json']),
        ];
    }

    /**
     * Substitui o perfil inteiro: campos ausentes viram nulos.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function replaceTrainingProfile(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['nivel', 'objetivo', 'dias_semana', 'minutos_sessao', 'preferencias', 'restricoes']);
        $level = $this->enum($input, 'nivel', self::LEVELS, $errors);
        $goal = $this->enum($input, 'objetivo', self::GOALS, $errors);
        $days = $this->intOrNull($input, 'dias_semana', 1, 7, $errors);
        $minutes = $this->intOrNull($input, 'minutos_sessao', 10, 300, $errors);
        $preferences = $this->jsonObject($input, 'preferencias', $errors);
        $restrictions = $this->jsonObject($input, 'restricoes', $errors);
        if (is_array($restrictions)) {
            $this->checkRestrictions($restrictions, $errors);
        }
        $errors->throwIfAny();

        $this->db->execute(
            'INSERT INTO perfis_treinamento(usuario_id, nivel, objetivo, dias_semana, minutos_sessao, preferencias_json, restricoes_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nivel = VALUES(nivel), objetivo = VALUES(objetivo), dias_semana = VALUES(dias_semana),
                                     minutos_sessao = VALUES(minutos_sessao), preferencias_json = VALUES(preferencias_json), restricoes_json = VALUES(restricoes_json)',
            'issiiss',
            $user->id,
            $level,
            $goal,
            $days,
            $minutes,
            $preferences === null ? null : json_encode($preferences, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $restrictions === null ? null : json_encode($restrictions, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
        );

        return $this->trainingProfile($user);
    }

    /**
     * @param array<string, mixed> $input
     * @param list<string> $allowed
     */
    private function enum(array $input, string $field, array $allowed, FieldErrors $errors): ?string
    {
        $value = $input[$field] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            $errors->add($field, 'Valor não permitido. Use: ' . implode(', ', $allowed) . '.');

            return null;
        }

        return $value;
    }

    /** @param array<string, mixed> $input */
    private function intOrNull(array $input, string $field, int $min, int $max, FieldErrors $errors): ?int
    {
        $value = $input[$field] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_int($value) || $value < $min || $value > $max) {
            $errors->add($field, "Deve ser um inteiro entre $min e $max.");

            return null;
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<mixed>|null
     */
    private function jsonObject(array $input, string $field, FieldErrors $errors): ?array
    {
        $value = $input[$field] ?? null;
        if ($value === null) {
            return null;
        }
        // Objeto JSON (não lista), de tamanho limitado. O conteúdo nunca é repetido na mensagem de erro.
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            $errors->add($field, 'Deve ser um objeto.');

            return null;
        }
        if (strlen(json_encode($value, JSON_THROW_ON_ERROR)) > self::MAX_JSON_BYTES) {
            $errors->add($field, 'Muito grande (máximo de ' . self::MAX_JSON_BYTES . ' bytes).');

            return null;
        }

        return $value;
    }

    /**
     * Formato esperado pelo motor de sugestão (Doc 09 §7.4); chaves adicionais são aceitas.
     *
     * @param array<mixed> $restrictions
     */
    private function checkRestrictions(array $restrictions, FieldErrors $errors): void
    {
        if (array_key_exists('areas', $restrictions)) {
            $areas = $restrictions['areas'];
            if (!is_array($areas) || !array_is_list($areas) || count($areas) > 8 || array_diff($areas, self::AREAS) !== []) {
                $errors->add('restricoes', 'O campo "areas" aceita uma lista com: ' . implode(', ', self::AREAS) . '.');
            }
        }
        if (array_key_exists('condicoes', $restrictions)) {
            $conditions = $restrictions['condicoes'];
            $valid = is_array($conditions) && array_is_list($conditions) && count($conditions) <= 10;
            foreach ($valid ? $conditions : [] as $c) {
                $valid = $valid && is_string($c) && $c !== '' && mb_strlen($c) <= 50;
            }
            if (!$valid) {
                $errors->add('restricoes', 'O campo "condicoes" aceita até 10 textos de até 50 caracteres.');
            }
        }
        foreach (['dor_atual', 'lesao_recente'] as $flag) {
            if (array_key_exists($flag, $restrictions) && !is_bool($restrictions[$flag])) {
                $errors->add('restricoes', "O campo \"$flag\" deve ser verdadeiro ou falso.");
            }
        }
    }

    /** @return array<mixed>|null */
    private function decode(mixed $json): ?array
    {
        if (!is_string($json) || $json === '') {
            return null;
        }
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : null;
    }
}
