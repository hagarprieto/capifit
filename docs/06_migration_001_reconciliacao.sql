-- CapiFit | Documento 06 | Migration 001 — reconciliação do baseline (Documento 04)
-- Pré-requisito: 04_schema_inicial_mysql8.sql já aplicado em banco NOVO e vazio de produção.
-- Alvo: MySQL 8.0.16+ (sintaxe também validada em MariaDB 10.4). Executar com o cliente `mysql` (usa DELIMITER).
-- Cada bloco indica a lacuna que resolve (ver Documento 06, §5).
USE capifit;

-- ============================================================
-- 1. Preferências e maioridade do usuário (RG-014, RN-11, LGPD)
-- ============================================================
ALTER TABLE usuarios
 ADD COLUMN fuso_horario VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo' AFTER estado,
 ADD COLUMN unidade_peso ENUM('kg','lb') NOT NULL DEFAULT 'kg' AFTER fuso_horario,
 ADD COLUMN idioma VARCHAR(10) NOT NULL DEFAULT 'pt-BR' AFTER unidade_peso,
 ADD COLUMN maioridade_declarada_em DATETIME(6) NULL AFTER idioma;

-- ============================================================
-- 2. Consentimentos e direitos do titular (RN-07, TEL-042, CA-04-18)
-- ============================================================
CREATE TABLE consentimentos_privacidade (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 usuario_id BIGINT UNSIGNED NOT NULL,
 tipo ENUM('termos_uso','politica_privacidade','dados_saude','compartilhamento_coach') NOT NULL,
 versao_documento VARCHAR(30) NOT NULL,
 vinculo_id BIGINT UNSIGNED NULL,
 concedido_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 revogado_em DATETIME(6) NULL,
 KEY ix_consent_usuario_tipo(usuario_id,tipo,revogado_em),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(vinculo_id) REFERENCES vinculos_coach_aluno(id)
) ENGINE=InnoDB;

CREATE TABLE solicitacoes_titular (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 usuario_id BIGINT UNSIGNED NOT NULL,
 tipo ENUM('exportacao','exclusao') NOT NULL,
 estado ENUM('solicitada','em_processamento','concluida','recusada') NOT NULL DEFAULT 'solicitada',
 solicitada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 concluida_em DATETIME(6) NULL,
 arquivo_url VARCHAR(700) NULL COMMENT 'Exportação: URL temporária; nunca pública',
 KEY ix_solic_usuario(usuario_id,tipo,estado),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ============================================================
-- 3. Autenticação, idempotência HTTP e rate limit (Doc 05 §4 e §17.1/§17.3)
-- ============================================================
CREATE TABLE sessoes_autenticacao (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 usuario_id BIGINT UNSIGNED NOT NULL,
 dispositivo_uuid CHAR(36) NULL,
 familia_uuid CHAR(36) NOT NULL COMMENT 'Família de rotação: reuso de refresh antigo revoga a família',
 refresh_hash CHAR(64) NOT NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 expira_em DATETIME(6) NOT NULL,
 usado_em DATETIME(6) NULL COMMENT 'Preenchido quando o refresh foi rotacionado',
 revogado_em DATETIME(6) NULL,
 UNIQUE KEY uq_sessaoauth_hash(refresh_hash),
 KEY ix_sessaoauth_usuario(usuario_id,revogado_em),
 KEY ix_sessaoauth_familia(familia_uuid),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE tokens_acao (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 usuario_id BIGINT UNSIGNED NOT NULL,
 tipo ENUM('recuperacao_senha','verificacao_email') NOT NULL,
 token_hash CHAR(64) NOT NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 expira_em DATETIME(6) NOT NULL,
 usado_em DATETIME(6) NULL,
 UNIQUE KEY uq_token_hash(token_hash),
 KEY ix_token_usuario(usuario_id,tipo),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE requisicoes_idempotentes (
 usuario_id BIGINT UNSIGNED NOT NULL,
 chave CHAR(36) NOT NULL,
 metodo VARCHAR(10) NOT NULL,
 rota VARCHAR(190) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 status_http SMALLINT UNSIGNED NULL,
 resposta_json JSON NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(usuario_id,chave),
 KEY ix_idem_criado(criado_em),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE limites_requisicao (
 chave_hash CHAR(64) NOT NULL COMMENT 'hash de escopo+identificador (IP/conta); sem dado pessoal em claro',
 janela_inicio DATETIME NOT NULL,
 contagem INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(chave_hash,janela_inicio)
) ENGINE=InnoDB;

-- ============================================================
-- 4. Profissionais e vínculos (RG-008, CA-10, histórico de vínculos)
-- ============================================================
CREATE TABLE profissionais (
 usuario_id BIGINT UNSIGNED PRIMARY KEY,
 conselho VARCHAR(20) NULL,
 registro VARCHAR(40) NULL,
 status_verificacao ENUM('nao_verificado','em_analise','verificado','rejeitado') NOT NULL DEFAULT 'nao_verificado',
 verificado_por BIGINT UNSIGNED NULL,
 verificado_em DATETIME(6) NULL,
 atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(verificado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

ALTER TABLE vinculos_coach_aluno
 MODIFY status ENUM('pendente','ativo','recusado','expirado','revogado','encerrado') NOT NULL DEFAULT 'pendente',
 ADD COLUMN expira_em DATETIME(6) NULL,
 ADD COLUMN compartilha_historico BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN compartilha_restricoes BOOLEAN NOT NULL DEFAULT FALSE;
-- Unicidade apenas para vínculo VIGENTE (pendente/ativo); períodos antigos ficam como histórico.
ALTER TABLE vinculos_coach_aluno
 ADD COLUMN vigente_chave TINYINT GENERATED ALWAYS AS (IF(status IN ('pendente','ativo'),1,NULL)) VIRTUAL;
ALTER TABLE vinculos_coach_aluno
 ADD UNIQUE KEY uq_vinculo_vigente(coach_id,aluno_id,vigente_chave);
ALTER TABLE vinculos_coach_aluno DROP INDEX uq_vinculo_par;

-- ============================================================
-- 5. Programas: titularidade composta, concorrência e aceite de prescrição
-- ============================================================
ALTER TABLE versoes_programa
 ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1,
 ADD COLUMN atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);

ALTER TABLE programas_treino ADD UNIQUE KEY uq_programa_aluno(id,aluno_id);
ALTER TABLE programas_ativos
 ADD CONSTRAINT fk_ativo_titular FOREIGN KEY(programa_id,aluno_id) REFERENCES programas_treino(id,aluno_id);

CREATE TABLE aceites_programa (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 programa_id BIGINT UNSIGNED NOT NULL,
 versao_id BIGINT UNSIGNED NOT NULL,
 aluno_id BIGINT UNSIGNED NOT NULL,
 estado ENUM('pendente','aceito','recusado','substituido','retirado') NOT NULL DEFAULT 'pendente',
 enviado_por BIGINT UNSIGNED NOT NULL,
 enviado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 decidido_em DATETIME(6) NULL,
 motivo_recusa VARCHAR(255) NULL,
 UNIQUE KEY uq_aceite_versao(versao_id),
 KEY ix_aceite_aluno_estado(aluno_id,estado),
 FOREIGN KEY(programa_id,versao_id) REFERENCES versoes_programa(programa_id,id),
 FOREIGN KEY(programa_id,aluno_id) REFERENCES programas_treino(id,aluno_id),
 FOREIGN KEY(enviado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ============================================================
-- 6. UUID público em todas as entidades sincronizáveis + FK composta ficha/versão
-- ============================================================
ALTER TABLE fichas_treino ADD COLUMN uuid CHAR(36) NULL, ADD UNIQUE KEY uq_ficha_versao_id(versao_id,id);
UPDATE fichas_treino SET uuid=UUID() WHERE uuid IS NULL;
ALTER TABLE fichas_treino MODIFY uuid CHAR(36) NOT NULL, ADD UNIQUE KEY uq_ficha_uuid(uuid);

ALTER TABLE ficha_exercicios ADD COLUMN uuid CHAR(36) NULL;
UPDATE ficha_exercicios SET uuid=UUID() WHERE uuid IS NULL;
ALTER TABLE ficha_exercicios MODIFY uuid CHAR(36) NOT NULL, ADD UNIQUE KEY uq_ficha_ex_uuid(uuid);

ALTER TABLE series_prescritas ADD COLUMN uuid CHAR(36) NULL;
UPDATE series_prescritas SET uuid=UUID() WHERE uuid IS NULL;
ALTER TABLE series_prescritas MODIFY uuid CHAR(36) NOT NULL, ADD UNIQUE KEY uq_serie_prescrita_uuid(uuid);

ALTER TABLE sessoes_exercicios ADD COLUMN uuid CHAR(36) NULL;
UPDATE sessoes_exercicios SET uuid=UUID() WHERE uuid IS NULL;
ALTER TABLE sessoes_exercicios MODIFY uuid CHAR(36) NOT NULL, ADD UNIQUE KEY uq_sessao_ex_uuid(uuid);

-- ============================================================
-- 7. Sessões: treino avulso, uma sessão aberta por aluno, pausas, substituição
-- ============================================================
ALTER TABLE sessoes_treino
 MODIFY programa_versao_id BIGINT UNSIGNED NULL,
 MODIFY ficha_id BIGINT UNSIGNED NULL,
 ADD COLUMN tipo ENUM('programado','avulso') NOT NULL DEFAULT 'programado' AFTER aluno_id,
 ADD COLUMN titulo_avulso VARCHAR(160) NULL,
 ADD COLUMN duracao_ativa_segundos INT UNSIGNED NULL COMMENT 'Duração sem pausas, calculada ao concluir';
ALTER TABLE sessoes_treino
 ADD CONSTRAINT ck_sessao_tipo CHECK (tipo='avulso' OR (programa_versao_id IS NOT NULL AND ficha_id IS NOT NULL)),
 ADD CONSTRAINT fk_sessao_ficha_versao FOREIGN KEY(programa_versao_id,ficha_id) REFERENCES fichas_treino(versao_id,id);
-- RG-013: no máximo uma sessão em andamento por aluno.
ALTER TABLE sessoes_treino
 ADD COLUMN em_andamento_chave BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status='em_andamento',aluno_id,NULL)) VIRTUAL;
ALTER TABLE sessoes_treino ADD UNIQUE KEY uq_sessao_em_andamento(em_andamento_chave);

CREATE TABLE sessoes_pausas (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 uuid CHAR(36) NOT NULL UNIQUE,
 sessao_id BIGINT UNSIGNED NOT NULL,
 iniciada_em DATETIME(6) NOT NULL,
 encerrada_em DATETIME(6) NULL,
 KEY ix_pausa_sessao(sessao_id),
 FOREIGN KEY(sessao_id) REFERENCES sessoes_treino(id),
 CHECK(encerrada_em IS NULL OR encerrada_em >= iniciada_em)
) ENGINE=InnoDB;

ALTER TABLE sessoes_exercicios
 ADD COLUMN tipo_item ENUM('prescrito','substituido','adicionado') NOT NULL DEFAULT 'prescrito',
 ADD COLUMN exercicio_prescrito_id BIGINT UNSIGNED NULL COMMENT 'Exercício original quando houve substituição',
 ADD CONSTRAINT fk_sessao_ex_prescrito FOREIGN KEY(exercicio_prescrito_id) REFERENCES exercicios(id);

ALTER TABLE sessoes_series
 ADD COLUMN tipo ENUM('aquecimento','normal','preparatoria','dropset') NOT NULL DEFAULT 'normal',
 ADD COLUMN duracao_segundos SMALLINT UNSIGNED NULL,
 ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1,
 ADD COLUMN atualizado_cliente_em DATETIME(6) NULL COMMENT 'Relógio do dispositivo; critério de última-escrita-vence',
 ADD COLUMN dispositivo_id BIGINT UNSIGNED NULL,
 ADD CONSTRAINT fk_serie_dispositivo FOREIGN KEY(dispositivo_id) REFERENCES dispositivos_sync(id);

-- ============================================================
-- 8. Catálogo: modalidade de registro e revisão
-- ============================================================
ALTER TABLE exercicios
 ADD COLUMN modalidade ENUM('reps_carga','reps_peso_corporal','reps_assistido','tempo') NOT NULL DEFAULT 'reps_carga' AFTER unilateral,
 ADD COLUMN dificuldade ENUM('iniciante','intermediario','avancado') NULL,
 ADD COLUMN revisado_por BIGINT UNSIGNED NULL,
 ADD COLUMN revisado_em DATETIME(6) NULL,
 ADD CONSTRAINT fk_exercicio_revisor FOREIGN KEY(revisado_por) REFERENCES usuarios(id);

-- ============================================================
-- 9. Motor de sugestões: modelos curados
-- ============================================================
CREATE TABLE modelos_sugestao (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 codigo VARCHAR(60) NOT NULL,
 versao SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 objetivo ENUM('hipertrofia','forca','condicionamento','outro') NOT NULL,
 nivel ENUM('iniciante','intermediario','avancado') NOT NULL,
 dias_semana TINYINT UNSIGNED NOT NULL,
 minutos_min SMALLINT UNSIGNED NOT NULL,
 minutos_max SMALLINT UNSIGNED NOT NULL,
 estrutura_json JSON NOT NULL COMMENT 'Fichas, grupos musculares por ficha, volume e faixas de reps; exercícios resolvidos por regra',
 status ENUM('rascunho','em_revisao','aprovado','arquivado') NOT NULL DEFAULT 'rascunho',
 revisado_por BIGINT UNSIGNED NULL,
 revisado_em DATETIME(6) NULL,
 criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_modelo_codigo_versao(codigo,versao),
 KEY ix_modelo_selecao(status,objetivo,nivel,dias_semana),
 FOREIGN KEY(revisado_por) REFERENCES usuarios(id),
 CHECK(dias_semana BETWEEN 1 AND 7),
 CHECK(minutos_min <= minutos_max)
) ENGINE=InnoDB;

ALTER TABLE sugestoes_treino
 MODIFY estado ENUM('gerada','aceita','editada','descartada','bloqueada') NOT NULL DEFAULT 'gerada',
 ADD COLUMN modelo_id BIGINT UNSIGNED NULL,
 ADD CONSTRAINT fk_sugestao_modelo FOREIGN KEY(modelo_id) REFERENCES modelos_sugestao(id);

-- ============================================================
-- 10. Sincronização: prova de payload idêntico
-- ============================================================
ALTER TABLE operacoes_sync
 ADD COLUMN payload_hash CHAR(64) NOT NULL,
 ADD COLUMN sequencia_cliente BIGINT UNSIGNED NULL COMMENT 'Contador monotônico por dispositivo, para ordenar a fila';

-- ============================================================
-- 11. Imutabilidade por triggers (RG-007, BR-03, RG-009, BR-07)
-- ============================================================
DELIMITER $$

CREATE TRIGGER tg_versoes_bu BEFORE UPDATE ON versoes_programa FOR EACH ROW
BEGIN
 IF OLD.estado <> 'rascunho' AND NEW.estado = 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: versao publicada nao volta a rascunho';
 END IF;
 IF OLD.estado = 'substituido' AND NEW.estado <> 'substituido' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: versao substituida e terminal';
 END IF;
END$$

CREATE TRIGGER tg_versoes_bd BEFORE DELETE ON versoes_programa FOR EACH ROW
BEGIN
 IF OLD.estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: versao publicada nao pode ser apagada';
 END IF;
END$$

CREATE TRIGGER tg_fichas_bi BEFORE INSERT ON fichas_treino FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT estado INTO v_estado FROM versoes_programa WHERE id = NEW.versao_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: ficha em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_fichas_bu BEFORE UPDATE ON fichas_treino FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT estado INTO v_estado FROM versoes_programa WHERE id = OLD.versao_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: ficha em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_fichas_bd BEFORE DELETE ON fichas_treino FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT estado INTO v_estado FROM versoes_programa WHERE id = OLD.versao_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: ficha em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_ficha_ex_bi BEFORE INSERT ON ficha_exercicios FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM fichas_treino f JOIN versoes_programa v ON v.id = f.versao_id WHERE f.id = NEW.ficha_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: exercicio em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_ficha_ex_bu BEFORE UPDATE ON ficha_exercicios FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM fichas_treino f JOIN versoes_programa v ON v.id = f.versao_id WHERE f.id = OLD.ficha_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: exercicio em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_ficha_ex_bd BEFORE DELETE ON ficha_exercicios FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM fichas_treino f JOIN versoes_programa v ON v.id = f.versao_id WHERE f.id = OLD.ficha_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: exercicio em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_serie_presc_bi BEFORE INSERT ON series_prescritas FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM ficha_exercicios fe
  JOIN fichas_treino f ON f.id = fe.ficha_id JOIN versoes_programa v ON v.id = f.versao_id
  WHERE fe.id = NEW.ficha_exercicio_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: serie em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_serie_presc_bu BEFORE UPDATE ON series_prescritas FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM ficha_exercicios fe
  JOIN fichas_treino f ON f.id = fe.ficha_id JOIN versoes_programa v ON v.id = f.versao_id
  WHERE fe.id = OLD.ficha_exercicio_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: serie em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_serie_presc_bd BEFORE DELETE ON series_prescritas FOR EACH ROW
BEGIN
 DECLARE v_estado VARCHAR(20);
 SELECT v.estado INTO v_estado FROM ficha_exercicios fe
  JOIN fichas_treino f ON f.id = fe.ficha_id JOIN versoes_programa v ON v.id = f.versao_id
  WHERE fe.id = OLD.ficha_exercicio_id;
 IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VERSION_IMMUTABLE: serie em versao publicada';
 END IF;
END$$

CREATE TRIGGER tg_sessao_bu BEFORE UPDATE ON sessoes_treino FOR EACH ROW
BEGIN
 IF OLD.status <> 'em_andamento' AND NEW.status <> OLD.status THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SESSION_CLOSED: estado da sessao e terminal';
 END IF;
END$$

CREATE TRIGGER tg_sessao_serie_bi BEFORE INSERT ON sessoes_series FOR EACH ROW
BEGIN
 DECLARE v_status VARCHAR(20);
 SELECT s.status INTO v_status FROM sessoes_exercicios se JOIN sessoes_treino s ON s.id = se.sessao_id WHERE se.id = NEW.sessao_exercicio_id;
 IF v_status IS NOT NULL AND v_status <> 'em_andamento' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SESSION_CLOSED: sessao encerrada';
 END IF;
END$$

CREATE TRIGGER tg_sessao_serie_bu BEFORE UPDATE ON sessoes_series FOR EACH ROW
BEGIN
 DECLARE v_status VARCHAR(20);
 SELECT s.status INTO v_status FROM sessoes_exercicios se JOIN sessoes_treino s ON s.id = se.sessao_id WHERE se.id = OLD.sessao_exercicio_id;
 IF v_status IS NOT NULL AND v_status <> 'em_andamento' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SESSION_CLOSED: sessao encerrada';
 END IF;
END$$

DELIMITER ;
