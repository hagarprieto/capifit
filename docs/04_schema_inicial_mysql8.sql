-- CapiFit | Documento 04 | Schema inicial MySQL 8.0.16+
-- Criação em banco novo. Não execute diretamente sobre produção.
-- Após este baseline, aplicar 06_migration_001_reconciliacao.sql (schema oficial = baseline + Migration 001).
-- Charset padrão: utf8mb4_general_ci. Datas de eventos em UTC na API.
CREATE DATABASE IF NOT EXISTS capifit CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE capifit;

CREATE TABLE usuarios (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 nome VARCHAR(160) NOT NULL,
 email VARCHAR(190) NOT NULL,
 senha_hash VARCHAR(255) NULL,
 estado ENUM('pendente','ativo','suspenso','excluido') NOT NULL DEFAULT 'pendente',
 email_verificado_em DATETIME(6) NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 excluido_em DATETIME(6) NULL,
 UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

CREATE TABLE papeis (id TINYINT UNSIGNED PRIMARY KEY, codigo VARCHAR(30) NOT NULL UNIQUE);
INSERT INTO papeis(id,codigo) VALUES (1,'aluno'),(2,'coach'),(3,'admin');
CREATE TABLE usuarios_papeis (
 usuario_id BIGINT UNSIGNED NOT NULL,
 papel_id TINYINT UNSIGNED NOT NULL,
 concedido_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(usuario_id,papel_id),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(papel_id) REFERENCES papeis(id)
) ENGINE=InnoDB;

CREATE TABLE perfis_treinamento (
 usuario_id BIGINT UNSIGNED PRIMARY KEY,
 nivel ENUM('iniciante','intermediario','avancado') NULL,
 objetivo ENUM('hipertrofia','forca','condicionamento','outro') NULL,
 dias_semana TINYINT UNSIGNED NULL,
 minutos_sessao SMALLINT UNSIGNED NULL,
 preferencias_json JSON NULL,
 restricoes_json JSON NULL COMMENT 'Dado sensível: minimizar acesso e aplicar criptografia na aplicação quando cabível',
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 CONSTRAINT ck_perfil_dias CHECK (dias_semana IS NULL OR dias_semana BETWEEN 1 AND 7),
 CONSTRAINT ck_perfil_minutos CHECK (minutos_sessao IS NULL OR minutos_sessao BETWEEN 10 AND 300)
) ENGINE=InnoDB;

CREATE TABLE vinculos_coach_aluno (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 coach_id BIGINT UNSIGNED NOT NULL,
 aluno_id BIGINT UNSIGNED NOT NULL,
 status ENUM('pendente','ativo','revogado','encerrado') NOT NULL DEFAULT 'pendente',
 convidado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 aceito_em DATETIME(6) NULL,
 encerrado_em DATETIME(6) NULL,
 UNIQUE KEY uq_vinculo_par (coach_id,aluno_id),
 KEY ix_vinculo_aluno_status(aluno_id,status),
 FOREIGN KEY(coach_id) REFERENCES usuarios(id),
 FOREIGN KEY(aluno_id) REFERENCES usuarios(id),
 CONSTRAINT ck_vinculo_distintos CHECK(coach_id <> aluno_id)
) ENGINE=InnoDB;

CREATE TABLE grupos_musculares (
 id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(90) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE equipamentos (
 id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE exercicios (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 nome VARCHAR(180) NOT NULL,
 nome_normalizado VARCHAR(180) NOT NULL,
 equipamento_id SMALLINT UNSIGNED NULL,
 instrucoes TEXT NULL,
 observacoes_seguranca TEXT NULL,
 unilateral BOOLEAN NOT NULL DEFAULT FALSE,
 status ENUM('rascunho','em_revisao','publicado','arquivado') NOT NULL DEFAULT 'rascunho',
 criado_por BIGINT UNSIGNED NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 KEY ix_exercicios_busca(nome_normalizado,status),
 FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
 FOREIGN KEY(criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE exercicios_musculos (
 exercicio_id BIGINT UNSIGNED NOT NULL,
 grupo_id SMALLINT UNSIGNED NOT NULL,
 papel ENUM('primario','secundario') NOT NULL,
 PRIMARY KEY(exercicio_id,grupo_id),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id),
 FOREIGN KEY(grupo_id) REFERENCES grupos_musculares(id)
) ENGINE=InnoDB;
CREATE TABLE exercicios_alternativas (
 exercicio_id BIGINT UNSIGNED NOT NULL,
 alternativa_id BIGINT UNSIGNED NOT NULL,
 notas VARCHAR(255) NULL,
 PRIMARY KEY(exercicio_id,alternativa_id),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id),
 FOREIGN KEY(alternativa_id) REFERENCES exercicios(id),
 CHECK(exercicio_id <> alternativa_id)
) ENGINE=InnoDB;

CREATE TABLE midias_exercicio (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 exercicio_id BIGINT UNSIGNED NOT NULL,
 tipo ENUM('video_capi','video_humano','imagem','animacao_3d') NOT NULL,
 url_storage VARCHAR(700) NOT NULL,
 versao VARCHAR(30) NOT NULL DEFAULT '1',
 status ENUM('rascunho','em_revisao','aprovado','rejeitado') NOT NULL DEFAULT 'rascunho',
 revisado_por BIGINT UNSIGNED NULL,
 revisado_em DATETIME(6) NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_midias_exercicio_status(exercicio_id,status),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id),
 FOREIGN KEY(revisado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE programas_treino (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 aluno_id BIGINT UNSIGNED NOT NULL,
 autor_id BIGINT UNSIGNED NOT NULL,
 origem ENUM('usuario','coach','app') NOT NULL,
 titulo VARCHAR(180) NOT NULL,
 objetivo VARCHAR(100) NULL,
 status ENUM('rascunho','publicado','arquivado') NOT NULL DEFAULT 'rascunho',
 versao_atual_id BIGINT UNSIGNED NULL COMMENT 'FK adicionada após criar versoes_programa',
 derivado_de_programa_id BIGINT UNSIGNED NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 KEY ix_programas_aluno_status(aluno_id,status),
 FOREIGN KEY(aluno_id) REFERENCES usuarios(id),
 FOREIGN KEY(autor_id) REFERENCES usuarios(id),
 FOREIGN KEY(derivado_de_programa_id) REFERENCES programas_treino(id)
) ENGINE=InnoDB;

CREATE TABLE versoes_programa (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 programa_id BIGINT UNSIGNED NOT NULL,
 numero INT UNSIGNED NOT NULL,
 estado ENUM('rascunho','publicado','substituido') NOT NULL DEFAULT 'rascunho',
 notas TEXT NULL,
 gerador_versao VARCHAR(60) NULL,
 gerador_parametros_json JSON NULL,
 publicado_por BIGINT UNSIGNED NULL,
 publicado_em DATETIME(6) NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_versao_programa(programa_id,numero),
 UNIQUE KEY uq_versao_programa_id (programa_id,id),
 FOREIGN KEY(programa_id) REFERENCES programas_treino(id),
 FOREIGN KEY(publicado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;
ALTER TABLE programas_treino
 ADD CONSTRAINT fk_programa_versao_atual
 FOREIGN KEY (id,versao_atual_id) REFERENCES versoes_programa(programa_id,id);

CREATE TABLE fichas_treino (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 versao_id BIGINT UNSIGNED NOT NULL,
 codigo VARCHAR(25) NOT NULL,
 titulo VARCHAR(160) NOT NULL,
 ordem SMALLINT UNSIGNED NOT NULL,
 UNIQUE KEY uq_ficha_codigo(versao_id,codigo),
 UNIQUE KEY uq_ficha_ordem(versao_id,ordem),
 FOREIGN KEY(versao_id) REFERENCES versoes_programa(id)
) ENGINE=InnoDB;
CREATE TABLE ficha_exercicios (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ficha_id BIGINT UNSIGNED NOT NULL,
 exercicio_id BIGINT UNSIGNED NOT NULL,
 ordem SMALLINT UNSIGNED NOT NULL,
 grupo_superset VARCHAR(30) NULL,
 descanso_segundos SMALLINT UNSIGNED NULL,
 instrucoes TEXT NULL,
 UNIQUE KEY uq_ficha_ex_ordem(ficha_id,ordem),
 FOREIGN KEY(ficha_id) REFERENCES fichas_treino(id),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id),
 CHECK (descanso_segundos IS NULL OR descanso_segundos <= 3600)
) ENGINE=InnoDB;
CREATE TABLE series_prescritas (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ficha_exercicio_id BIGINT UNSIGNED NOT NULL,
 ordem SMALLINT UNSIGNED NOT NULL,
 tipo ENUM('aquecimento','normal','preparatoria','dropset') NOT NULL DEFAULT 'normal',
 reps_min SMALLINT UNSIGNED NULL,
 reps_max SMALLINT UNSIGNED NULL,
 carga_alvo_kg DECIMAL(7,2) NULL,
 rir_alvo TINYINT UNSIGNED NULL,
 duracao_alvo_segundos SMALLINT UNSIGNED NULL,
 UNIQUE KEY uq_serie_prescrita(ficha_exercicio_id,ordem),
 FOREIGN KEY(ficha_exercicio_id) REFERENCES ficha_exercicios(id),
 CHECK(reps_min IS NULL OR reps_min > 0),
 CHECK(reps_max IS NULL OR reps_max > 0),
 CHECK(reps_min IS NULL OR reps_max IS NULL OR reps_min <= reps_max),
 CHECK(carga_alvo_kg IS NULL OR carga_alvo_kg >= 0),
 CHECK(rir_alvo IS NULL OR rir_alvo <= 10)
) ENGINE=InnoDB;

CREATE TABLE programas_ativos (
 aluno_id BIGINT UNSIGNED PRIMARY KEY,
 programa_id BIGINT UNSIGNED NOT NULL,
 versao_id BIGINT UNSIGNED NOT NULL,
 ativado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(aluno_id) REFERENCES usuarios(id),
 FOREIGN KEY(programa_id,versao_id) REFERENCES versoes_programa(programa_id,id)
) ENGINE=InnoDB;

CREATE TABLE sessoes_treino (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 aluno_id BIGINT UNSIGNED NOT NULL,
 programa_versao_id BIGINT UNSIGNED NOT NULL,
 ficha_id BIGINT UNSIGNED NOT NULL,
 status ENUM('em_andamento','concluida','cancelada') NOT NULL DEFAULT 'em_andamento',
 iniciada_em DATETIME(6) NOT NULL,
 encerrada_em DATETIME(6) NULL,
 observacoes TEXT NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_sessoes_aluno_data(aluno_id,iniciada_em),
 FOREIGN KEY(aluno_id) REFERENCES usuarios(id),
 FOREIGN KEY(programa_versao_id) REFERENCES versoes_programa(id),
 FOREIGN KEY(ficha_id) REFERENCES fichas_treino(id),
 CHECK(encerrada_em IS NULL OR encerrada_em >= iniciada_em)
) ENGINE=InnoDB;
CREATE TABLE sessoes_exercicios (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 sessao_id BIGINT UNSIGNED NOT NULL,
 ficha_exercicio_id BIGINT UNSIGNED NULL,
 exercicio_id BIGINT UNSIGNED NOT NULL,
 ordem SMALLINT UNSIGNED NOT NULL,
 UNIQUE KEY uq_sessao_ex_ordem(sessao_id,ordem),
 FOREIGN KEY(sessao_id) REFERENCES sessoes_treino(id),
 FOREIGN KEY(ficha_exercicio_id) REFERENCES ficha_exercicios(id),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id)
) ENGINE=InnoDB;
CREATE TABLE sessoes_series (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 sessao_exercicio_id BIGINT UNSIGNED NOT NULL,
 serie_prescrita_id BIGINT UNSIGNED NULL,
 ordem SMALLINT UNSIGNED NOT NULL,
 carga_kg DECIMAL(7,2) NULL,
 repeticoes SMALLINT UNSIGNED NULL,
 rir_real TINYINT UNSIGNED NULL,
 status ENUM('pendente','realizada','ignorada') NOT NULL DEFAULT 'pendente',
 concluida_em DATETIME(6) NULL,
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_serie_ordem(sessao_exercicio_id,ordem),
 FOREIGN KEY(sessao_exercicio_id) REFERENCES sessoes_exercicios(id),
 FOREIGN KEY(serie_prescrita_id) REFERENCES series_prescritas(id),
 CHECK(carga_kg IS NULL OR carga_kg >= 0),
 CHECK(repeticoes IS NULL OR repeticoes <= 1000),
 CHECK(rir_real IS NULL OR rir_real <= 10)
) ENGINE=InnoDB;

CREATE TABLE sugestoes_treino (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 aluno_id BIGINT UNSIGNED NOT NULL,
 programa_id BIGINT UNSIGNED NULL,
 motor_versao VARCHAR(60) NOT NULL,
 entradas_json JSON NOT NULL,
 justificativas_json JSON NULL,
 estado ENUM('gerada','aceita','editada','descartada') NOT NULL DEFAULT 'gerada',
 gerada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(aluno_id) REFERENCES usuarios(id),
 FOREIGN KEY(programa_id) REFERENCES programas_treino(id)
) ENGINE=InnoDB;

CREATE TABLE dispositivos_sync (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 usuario_id BIGINT UNSIGNED NOT NULL,
 dispositivo_uuid CHAR(36) NOT NULL,
 ultima_sync_em DATETIME(6) NULL,
 revogado_em DATETIME(6) NULL,
 UNIQUE KEY uq_dispositivo_usuario(usuario_id,dispositivo_uuid),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE operacoes_sync (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 usuario_id BIGINT UNSIGNED NOT NULL,
 dispositivo_id BIGINT UNSIGNED NOT NULL,
 operacao_uuid CHAR(36) NOT NULL,
 entidade VARCHAR(60) NOT NULL,
 entidade_uuid CHAR(36) NOT NULL,
 tipo ENUM('criar','atualizar','concluir') NOT NULL,
 recebido_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 resultado ENUM('aplicada','conflito','rejeitada') NOT NULL,
 resposta_json JSON NULL,
 UNIQUE KEY uq_sync_idempotencia(usuario_id,operacao_uuid),
 KEY ix_sync_usuario_data(usuario_id,recebido_em),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(dispositivo_id) REFERENCES dispositivos_sync(id)
) ENGINE=InnoDB;

CREATE TABLE auditoria_eventos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ator_id BIGINT UNSIGNED NULL,
 acao VARCHAR(90) NOT NULL,
 recurso VARCHAR(70) NOT NULL,
 recurso_id VARCHAR(80) NOT NULL,
 metadados_json JSON NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_auditoria_recurso(recurso,recurso_id,criado_em),
 FOREIGN KEY(ator_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
