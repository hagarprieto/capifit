<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Dates;

/**
 * Monta o pacote de dados do titular (E02-02; LGPD art. 18): tudo o que o CapiFit guarda sobre a pessoa, em JSON legível.
 * NÃO inclui segredos nem dados técnicos de segurança (hash de senha, tokens, hashes de refresh, IPs, chaves de limite).
 * Os dados de saúde (restrições) entram porque são do próprio titular.
 */
final class DataExportBuilder
{
    public const SCHEMA = 'capifit-exportacao/1';

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, mixed> */
    public function build(int $userId): array
    {
        $account = $this->db->fetchOne(
            'SELECT uuid, nome, email, estado, fuso_horario, unidade_peso, idioma, email_verificado_em, maioridade_declarada_em, criado_em FROM usuarios WHERE id = ?',
            'i',
            $userId,
        ) ?? [];
        $profile = $this->db->fetchOne('SELECT nivel, objetivo, dias_semana, minutos_sessao, preferencias_json, restricoes_json FROM perfis_treinamento WHERE usuario_id = ?', 'i', $userId);

        return [
            'schema' => self::SCHEMA,
            'gerado_em' => Dates::fromDb(Dates::toDb(Dates::nowUtc())),
            'conta' => [
                'id' => $account['uuid'] ?? null,
                'nome' => $account['nome'] ?? null,
                'email' => $account['email'] ?? null,
                'estado' => $account['estado'] ?? null,
                'fuso_horario' => $account['fuso_horario'] ?? null,
                'unidade_peso' => $account['unidade_peso'] ?? null,
                'idioma' => $account['idioma'] ?? null,
                'email_verificado_em' => Dates::fromDb($account['email_verificado_em'] ?? null),
                'maioridade_declarada_em' => Dates::fromDb($account['maioridade_declarada_em'] ?? null),
                'criado_em' => Dates::fromDb($account['criado_em'] ?? null),
            ],
            'perfil_treinamento' => $profile === null ? null : [
                'nivel' => $profile['nivel'],
                'objetivo' => $profile['objetivo'],
                'dias_semana' => $profile['dias_semana'] === null ? null : (int) $profile['dias_semana'],
                'minutos_sessao' => $profile['minutos_sessao'] === null ? null : (int) $profile['minutos_sessao'],
                'preferencias' => $this->json($profile['preferencias_json']),
                'restricoes' => $this->json($profile['restricoes_json']),
            ],
            'consentimentos' => array_map(static fn (array $r): array => [
                'tipo' => $r['tipo'], 'versao_documento' => $r['versao_documento'], 'concedido_em' => Dates::fromDb($r['concedido_em']), 'revogado_em' => Dates::fromDb($r['revogado_em']),
            ], $this->db->fetchAll('SELECT tipo, versao_documento, concedido_em, revogado_em FROM consentimentos_privacidade WHERE usuario_id = ? ORDER BY id', 'i', $userId)),
            'dispositivos' => array_map(static fn (array $r): array => [
                'dispositivo_uuid' => $r['dispositivo_uuid'], 'ultima_sync_em' => Dates::fromDb($r['ultima_sync_em']), 'revogado_em' => Dates::fromDb($r['revogado_em']),
            ], $this->db->fetchAll('SELECT dispositivo_uuid, ultima_sync_em, revogado_em FROM dispositivos_sync WHERE usuario_id = ? ORDER BY id', 'i', $userId)),
            'programas' => $this->programs($userId),
            'sessoes' => $this->sessions($userId),
            'solicitacoes' => array_map(static fn (array $r): array => [
                'id' => $r['uuid'], 'tipo' => $r['tipo'], 'estado' => $r['estado'], 'solicitada_em' => Dates::fromDb($r['solicitada_em']), 'concluida_em' => Dates::fromDb($r['concluida_em']),
            ], $this->db->fetchAll('SELECT uuid, tipo, estado, solicitada_em, concluida_em FROM solicitacoes_titular WHERE usuario_id = ? ORDER BY id', 'i', $userId)),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function programs(int $userId): array
    {
        $out = [];
        $programs = $this->db->fetchAll(
            "SELECT p.id, p.uuid, p.titulo, p.objetivo, p.origem, p.status, p.criado_em FROM programas_treino p
              WHERE p.aluno_id = ? AND (p.origem <> 'coach' OR EXISTS (SELECT 1 FROM aceites_programa a WHERE a.programa_id = p.id)) ORDER BY p.id",
            'i',
            $userId,
        );
        foreach ($programs as $p) {
            $versions = [];
            foreach ($this->db->fetchAll('SELECT id, numero, estado, publicado_em FROM versoes_programa WHERE programa_id = ? ORDER BY numero', 'i', (int) $p['id']) as $v) {
                $fichas = [];
                foreach ($this->db->fetchAll('SELECT id, codigo, titulo, ordem FROM fichas_treino WHERE versao_id = ? ORDER BY ordem', 'i', (int) $v['id']) as $f) {
                    $items = [];
                    $rows = $this->db->fetchAll(
                        'SELECT fe.id, e.nome, fe.ordem, fe.descanso_segundos, fe.instrucoes FROM ficha_exercicios fe JOIN exercicios e ON e.id = fe.exercicio_id WHERE fe.ficha_id = ? ORDER BY fe.ordem',
                        'i',
                        (int) $f['id'],
                    );
                    foreach ($rows as $item) {
                        $series = $this->db->fetchAll('SELECT ordem, tipo, reps_min, reps_max, carga_alvo_kg, rir_alvo, duracao_alvo_segundos FROM series_prescritas WHERE ficha_exercicio_id = ? ORDER BY ordem', 'i', (int) $item['id']);
                        $items[] = ['exercicio' => $item['nome'], 'ordem' => (int) $item['ordem'], 'descanso_segundos' => $item['descanso_segundos'], 'instrucoes' => $item['instrucoes'], 'series' => $series];
                    }
                    $fichas[] = ['codigo' => $f['codigo'], 'titulo' => $f['titulo'], 'ordem' => (int) $f['ordem'], 'exercicios' => $items];
                }
                $versions[] = ['numero' => (int) $v['numero'], 'estado' => $v['estado'], 'publicado_em' => Dates::fromDb($v['publicado_em']), 'fichas' => $fichas];
            }
            $out[] = [
                'id' => $p['uuid'], 'titulo' => $p['titulo'], 'objetivo' => $p['objetivo'], 'origem' => $p['origem'], 'status' => $p['status'],
                'criado_em' => Dates::fromDb($p['criado_em']), 'versoes' => $versions,
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function sessions(int $userId): array
    {
        $out = [];
        $sessions = $this->db->fetchAll(
            'SELECT id, uuid, tipo, titulo_avulso, status, iniciada_em, encerrada_em, duracao_ativa_segundos, observacoes FROM sessoes_treino WHERE aluno_id = ? ORDER BY iniciada_em, id',
            'i',
            $userId,
        );
        foreach ($sessions as $s) {
            $exercises = [];
            $items = $this->db->fetchAll('SELECT se.id, se.ordem, se.tipo_item, e.nome FROM sessoes_exercicios se JOIN exercicios e ON e.id = se.exercicio_id WHERE se.sessao_id = ? ORDER BY se.ordem', 'i', (int) $s['id']);
            foreach ($items as $item) {
                $series = $this->db->fetchAll(
                    'SELECT ordem, tipo, carga_kg, repeticoes, duracao_segundos, rir_real, status, concluida_em FROM sessoes_series WHERE sessao_exercicio_id = ? ORDER BY ordem',
                    'i',
                    (int) $item['id'],
                );
                $exercises[] = [
                    'exercicio' => $item['nome'], 'ordem' => (int) $item['ordem'], 'tipo_item' => $item['tipo_item'],
                    'series' => array_map(static fn (array $r): array => [
                        'ordem' => (int) $r['ordem'], 'tipo' => $r['tipo'], 'carga_kg' => $r['carga_kg'] === null ? null : (float) $r['carga_kg'],
                        'repeticoes' => $r['repeticoes'] === null ? null : (int) $r['repeticoes'], 'duracao_segundos' => $r['duracao_segundos'] === null ? null : (int) $r['duracao_segundos'],
                        'rir_real' => $r['rir_real'] === null ? null : (int) $r['rir_real'], 'status' => $r['status'], 'concluida_em' => Dates::fromDb($r['concluida_em']),
                    ], $series),
                ];
            }
            $out[] = [
                'id' => $s['uuid'], 'tipo' => $s['tipo'], 'titulo' => $s['titulo_avulso'], 'status' => $s['status'],
                'iniciada_em' => Dates::fromDb($s['iniciada_em']), 'encerrada_em' => Dates::fromDb($s['encerrada_em']),
                'duracao_ativa_segundos' => $s['duracao_ativa_segundos'] === null ? null : (int) $s['duracao_ativa_segundos'],
                'observacoes' => $s['observacoes'], 'exercicios' => $exercises,
                'pausas' => array_map(static fn (array $r): array => ['iniciada_em' => Dates::fromDb($r['iniciada_em']), 'encerrada_em' => Dates::fromDb($r['encerrada_em'])],
                    $this->db->fetchAll('SELECT iniciada_em, encerrada_em FROM sessoes_pausas WHERE sessao_id = ? ORDER BY iniciada_em', 'i', (int) $s['id'])),
            ];
        }

        return $out;
    }

    private function json(mixed $value): mixed
    {
        if (!is_string($value) || $value === '') {
            return null;
        }

        return json_decode($value, true);
    }
}
