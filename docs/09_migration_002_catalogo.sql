-- CapiFit | Documento 09 | Migration 002 — estrutura do catálogo para o motor de sugestões e a busca
-- Pré-requisitos: 04_schema_inicial_mysql8.sql e 06_migration_001_reconciliacao.sql já aplicados.
-- Alvo: MySQL 8.0.16+ (sintaxe também validada em MariaDB 10.4).
USE capifit;

-- Padrão de movimento, classificação e convenção de carga por exercício.
ALTER TABLE exercicios
 ADD COLUMN padrao_movimento ENUM('empurrar_horizontal','empurrar_vertical','puxar_horizontal','puxar_vertical','agachar','dobradica_quadril','avanco','ponte_quadril','isolamento_superior','isolamento_inferior','core','panturrilha') NULL AFTER modalidade,
 ADD COLUMN composto BOOLEAN NOT NULL DEFAULT FALSE AFTER padrao_movimento,
 ADD COLUMN convencao_carga ENUM('total','por_halter','por_lado','selecao_maquina','adicional_corporal','assistencia') NULL
   COMMENT 'Como o usuário registra carga_kg neste exercício; NULL para modalidade tempo' AFTER composto,
 ADD COLUMN prioridade_motor SMALLINT UNSIGNED NOT NULL DEFAULT 100
   COMMENT 'Ordem determinística de escolha pelo motor (menor = preferido)' AFTER convencao_carga,
 ADD COLUMN onda_midia TINYINT UNSIGNED NULL COMMENT 'Onda de produção de mídia (1 = primeira)' AFTER prioridade_motor;

-- Áreas de cuidado: o motor exclui exercícios com cuidado em área que o usuário declarou como restrição.
CREATE TABLE exercicios_cuidados (
 exercicio_id BIGINT UNSIGNED NOT NULL,
 area ENUM('ombro','cotovelo','punho','coluna_cervical','lombar','quadril','joelho','tornozelo') NOT NULL,
 PRIMARY KEY(exercicio_id,area),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id)
) ENGINE=InnoDB;

-- Sinônimos para busca (ex.: "pulldown" → "Puxada na frente"). termo_normalizado: minúsculas, sem acentos.
CREATE TABLE exercicios_sinonimos (
 exercicio_id BIGINT UNSIGNED NOT NULL,
 termo_normalizado VARCHAR(120) NOT NULL,
 PRIMARY KEY(exercicio_id,termo_normalizado),
 KEY ix_sinonimo_termo(termo_normalizado),
 FOREIGN KEY(exercicio_id) REFERENCES exercicios(id)
) ENGINE=InnoDB;

-- Os modelos de sugestão aprovados passam a ser imutáveis (RG-024), como as versões de programa.
DELIMITER $$
CREATE TRIGGER tg_modelos_bu BEFORE UPDATE ON modelos_sugestao FOR EACH ROW
BEGIN
 IF OLD.status = 'aprovado' AND (NEW.estrutura_json <> OLD.estrutura_json OR NEW.codigo <> OLD.codigo OR NEW.versao <> OLD.versao
     OR NEW.objetivo <> OLD.objetivo OR NEW.nivel <> OLD.nivel OR NEW.dias_semana <> OLD.dias_semana) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MODEL_IMMUTABLE: modelo aprovado nao e editado; crie nova versao';
 END IF;
END$$
CREATE TRIGGER tg_modelos_bd BEFORE DELETE ON modelos_sugestao FOR EACH ROW
BEGIN
 IF OLD.status = 'aprovado' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MODEL_IMMUTABLE: modelo aprovado nao pode ser apagado';
 END IF;
END$$
DELIMITER ;
