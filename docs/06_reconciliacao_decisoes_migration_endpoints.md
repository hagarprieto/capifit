# CapiFit — Documento 06
## Reconciliação dos Documentos 01–05: Decisões, Migration 001, Ciclo de Aceite, Sync Revisado e Matriz TEL→API

**Versão:** 1.0 — revisão de consistência  
**Data:** 21/10/2026  
**Status:** Proposta para validação (decisões marcadas **[AJUSTÁVEL]** podem ser trocadas sem refazer o restante)  
**Artefato complementar:** `06_migration_001_reconciliacao.sql`  
**Dependências:** Documentos 01–05 e `04_schema_inicial_mysql8.sql`

---

## 1. Objetivo e precedência

Este documento fecha contradições e lacunas encontradas na avaliação dos Documentos 01–05, registra as decisões adotadas e entrega o que faltava para iniciar o desenvolvimento: migration complementar, ciclo de aceite de prescrição, protocolo de sync offline corrigido, endpoints ausentes e matriz de rastreabilidade `TEL-*` → API.

**Regra de precedência:** onde este documento divergir dos Documentos 01–05, **o Documento 06 prevalece**. Os documentos anteriores foram anotados nos pontos afetados (ver §3), mas não reescritos.

## 2. Decisões adotadas

| ID | Decisão | Motivo | Estado |
|---|---|---|---|
| D-01 | **Banco: MySQL 8.0.16+ em desenvolvimento e produção.** O XAMPP local traz **MariaDB 10.4**, que não é equivalente (`JSON` é alias de `LONGTEXT`, collations e otimizador diferem). Instalar MySQL 8 em paralelo (porta 3307) ou usar contêiner. | Evitar divergência entre ambientes | Confirmada em 21/10/2026 |
| D-02 | **Coach entra no MVP como Fase 3, ponta a ponta** (vínculo → prescrição → aceite → execução → acompanhamento). O **modelo de dados e a API já nascem prontos** na Fase 1; apenas a interface é entregue depois. | Doc 02 §15 proíbe lançar coach pela metade; Doc 01 §10.3 prioriza sugestões antes do coach | Confirmada em 21/10/2026 |
| D-03 | **Offline no MVP cobre a execução de treino** (sessão, séries, conclusão). Edição estrutural de programa exige conexão; sem conexão, o editor guarda **rascunho local não sincronizado**. | `PUT .../estrutura` com `expected_revision` não suporta edição offline | Fechada |
| D-04 | **Concorrência:** séries usam *última-escrita-vence* (relógio do dispositivo + sequência), com conflito explícito só se outro dispositivo alterou o mesmo registro. **`revision` otimista fica restrito a versões de programa** (dois autores possíveis). | Série tem um único autor; revisão por série complica o cliente sem ganho | Fechada |
| D-05 | **Treino avulso** (sessão sem ficha) entra na Fase 1. Exercícios são adicionados à sessão pelo catálogo. | Caso de uso frequente na academia; custo baixo com o schema novo | Confirmada em 21/10/2026 |
| D-06 | **Exercício personalizado do usuário** fica na Fase 2 (sem colunas agora). | Exige moderação, compartilhamento e política de catálogo | Fechada |
| D-07 | **IDs públicos: UUID em toda entidade sincronizável** (exercício, ficha, exercício da ficha, série prescrita, sessão, exercício da sessão, série, aluno/coach). Inteiros internos nunca aparecem na API. | Doc 05 §3 dizia "UUID quando existir", mas exemplos usavam `"218"` | Fechada |
| D-08 | Editar versão publicada retorna **`409 VERSION_IMMUTABLE`** (não 422). | API-07 estava ambíguo | Fechada |
| D-09 | **Maioridade:** MVP exige declaração de **18+ anos** no cadastro (`usuarios.maioridade_declarada_em`). Menores ficam fora até haver fluxo de consentimento parental (LGPD art. 14). | Evitar tratamento de dado de criança sem base legal | [AJUSTÁVEL] |
| D-10 | **Autoria de programa do app:** `autor_id` = próprio aluno, `origem='app'`, com `sugestoes_treino` e `modelos_sugestao` como trilha (confirma Doc 04 §17.6). | Evita conta fictícia de sistema | Fechada |
| D-11 | **Tokens:** access token JWT de 15 min (stateless; papel e vínculo **sempre** reconferidos no banco em rotas protegidas); refresh opaco com hash no servidor, rotação e detecção de reuso por família. **Painel web:** cookie `HttpOnly; Secure; SameSite=Strict` + token CSRF, mesma tabela `sessoes_autenticacao`. | Cumpre BR-11 (revogação imediata) sem depender da expiração do JWT | Fechada |
| D-12 | **Sync pull incremental fica na Fase 2.** MVP usa snapshot (`GET /me/programa-ativo`, `GET /me/sessoes`) após o push. | Doc 05 §10.2 já previa; sem `change_log` não há delta | Fechada |
| D-13 | **Aceitar prescrição ≠ ativar programa.** Aceite torna a versão elegível; ativar é ação separada do aluno. | Doc 02 FL-03: "passa a ser selecionável" | Fechada |
| D-14 | **Executor:** campos de carga/reps vêm **pré-preenchidos e editáveis** (meta prescrita ou último registro); um toque em *concluir* confirma. O valor só vira registro após esse toque. | Concilia "uma ação por série" (Doc 03 §2) com "referência não é registro" (§5.4) | Fechada |

## 3. Correções aplicadas nos documentos anteriores

| Doc | Seção | Correção |
|---|---|---|
| 01 | Cabeçalho, §10.1, §10.3, §13, §17 | Nota de revisão; coach como Fase 3 ponta a ponta; fases de entrega (§10.4); nomes de entidades remetem ao Doc 04; lista de próximos documentos renumerada |
| 02 | FL-02, FL-03, FL-05, §11.2, §15 | Edição offline limitada a rascunho local; aceite explícito de prescrição referenciando §6 deste documento; substituição/pausa no executor; priorização alinhada às fases |
| 03 | §3.3, §5.4, §18 | CTA de treino avulso; regra de pré-preenchimento; numeração dos próximos documentos |
| 04 | Cabeçalho, §4.4, §12, §15.2, §17, §18 | Referência à Migration 001; RG-013 agora imposta pelo banco; vínculo com histórico; aceite com tabela própria; lista de lacunas marcada como resolvida |
| 05 | Cabeçalho, §3, §7.5, §9, §10, §15, §17–§20 | IDs públicos por UUID; `{aluno_uuid}`/`{coach_uuid}` nas rotas; 409 para versão imutável; concorrência de séries; payload de criação de sessão com snapshot; lacunas do §17 apontadas para a migration; nova sequência de implementação |

## 4. Fases de entrega

| Fase | Conteúdo | Observações |
|---|---|---|
| **1 — Núcleo individual** | Cadastro/login e consentimentos, perfil, catálogo piloto (≈40–60 exercícios) com mídia revisada, programa manual com versões, execução (incl. avulso, substituição, pausa, descanso), persistência local da sessão em andamento e `sync/push` idempotente, histórico e resumo, exclusão/exportação de conta, painel admin de catálogo e mídia | Capi presente como identidade e nas demonstrações disponíveis; vídeo humano/diagrama complementar quando a animação não estiver aprovada |
| **2 — Sugestões e conforto** | Motor de sugestão com `modelos_sugestao` aprovados, exercício personalizado, `sync/pull` incremental, evolução por exercício (`TEL-032`), notificações opt-in | Depende de **profissional habilitado** para aprovar modelos |
| **3 — Coach ponta a ponta** | Verificação de profissional, convites, prescrição, aceite, acompanhamento autorizado, portal web do coach | Schema e endpoints já existem desde a Fase 1; só UI/portal e política de verificação são entregues aqui |

**Dependências externas sem dono definido (precisam de responsável):** profissional revisor (conselho de Educação Física), produção da Capi 3D, verificação de marca (INPI/domínio/lojas) e política de coach habilitado.

## 5. Migration 001 — o que muda no schema

Arquivo: `06_migration_001_reconciliacao.sql`. Aplicar sobre banco criado pelo `04_schema_inicial_mysql8.sql`. Total após a migration: **24 + 10 = 34 tabelas** (10 novas: `consentimentos_privacidade`, `solicitacoes_titular`, `sessoes_autenticacao`, `tokens_acao`, `requisicoes_idempotentes`, `limites_requisicao`, `profissionais`, `aceites_programa`, `sessoes_pausas`, `modelos_sugestao`).

| Bloco | Mudança | Lacuna resolvida |
|---|---|---|
| 1 | `usuarios`: `fuso_horario`, `unidade_peso`, `idioma`, `maioridade_declarada_em` | RG-014, RN-11, D-09 |
| 2 | Novas: `consentimentos_privacidade`, `solicitacoes_titular` | RN-07, TEL-042, CA-04-18 |
| 3 | Novas: `sessoes_autenticacao`, `tokens_acao`, `requisicoes_idempotentes`, `limites_requisicao` | Doc 05 §4, §17.1, §17.3, rate limit |
| 4 | Nova `profissionais`; `vinculos_coach_aluno`: novos estados (`recusado`, `expirado`), `expira_em`, escopo (`compartilha_historico`, `compartilha_restricoes`), unicidade **só para vínculo vigente** (histórico preservado) | RG-008, CA-10, Doc 04 §12 |
| 5 | `versoes_programa.revision`/`atualizado_em`; FK composta `programas_ativos(programa_id, aluno_id)`; nova `aceites_programa` | Concorrência de programa, RG-006, CA-06, AC-04, AC-11 |
| 6 | `uuid` em `fichas_treino`, `ficha_exercicios`, `series_prescritas`, `sessoes_exercicios`; FK composta ficha↔versão | D-07, sync offline |
| 7 | `sessoes_treino`: `tipo` (programado/avulso), `titulo_avulso`, `duracao_ativa_segundos`, **uma sessão `em_andamento` por aluno** (RG-013), FK composta versão↔ficha; nova `sessoes_pausas`; `sessoes_exercicios.tipo_item`/`exercicio_prescrito_id`; `sessoes_series`: `tipo`, `duracao_segundos`, `revision`, `atualizado_cliente_em`, `dispositivo_id` | D-04, D-05, RG-012, exercícios por tempo |
| 8 | `exercicios`: `modalidade` (`reps_carga`, `reps_peso_corporal`, `reps_assistido`, `tempo`), `dificuldade`, `revisado_por/em` | Prancha/peso corporal; fluxo de revisão |
| 9 | Nova `modelos_sugestao`; `sugestoes_treino.modelo_id` e estado `bloqueada` | Motor curado (Doc 01 §8.1) |
| 10 | `operacoes_sync.payload_hash`, `sequencia_cliente` | Doc 05 §10 (idempotência com payload divergente) |
| 11 | **Triggers**: versão publicada/substituída é imutável (versão, fichas, exercícios, séries prescritas); estado de sessão é terminal; série de sessão encerrada não muda | RG-007, BR-03, RG-009, BR-07 |

**Convenções de modalidade:** `reps_assistido` registra em `carga_kg` o **auxílio** (assistência), não a carga levantada; `tempo` usa `duracao_segundos` e `repeticoes` nulo; `reps_peso_corporal` aceita `carga_kg` como carga adicional (0 ou nula = só o corpo). O cálculo de volume (RG-015) considera apenas `reps_carga` e `reps_peso_corporal` com carga adicional.

**Validação executada nesta revisão:** `04_schema_inicial_mysql8.sql` seguido da migration foi aplicado em uma instância MariaDB 10.4 temporária (sem erros) e quatro cenários foram verificados: inserir ficha em versão publicada (`VERSION_IMMUTABLE`), segunda sessão em andamento do mesmo aluno (rejeitada), sessão programada sem ficha (rejeitada pelo `CHECK`) e segundo vínculo vigente para o mesmo par (rejeitado, com novo vínculo aceito após revogação). **Ainda não executado em MySQL 8 real** — fazer antes de congelar o schema (ponto de atenção: `MODIFY ... NULL` em colunas com FK e índices únicos sobre colunas geradas virtuais).

**Regras que continuam na aplicação** (não dá para impor só com SQL): versão ativa pertence ao titular **e** está publicada; para origem `coach`, aceite `aceito` antes de ativar; série prescrita pertence ao exercício da sessão; mídia aprovada por curador; elegibilidade de publicação do exercício.

**Permissões do usuário do banco:** a aplicação não deve ter `DROP TRIGGER`/`ALTER`/`SUPER`; migrations rodam com outro usuário.

## 6. Ciclo de aceite da prescrição do coach (novo)

### 6.1 Estados (`aceites_programa.estado`)

`pendente` → `aceito` | `recusado` | `retirado` (coach cancela antes da decisão) | `substituido` (nova versão enviada ou aceita).

### 6.2 Regras

1. **Visibilidade (RG-019):** o aluno só enxerga um programa `origem='coach'` se existir ao menos um registro em `aceites_programa` para ele. **Rascunhos do coach nunca aparecem** para o aluno; `GET /me/programas` filtra por essa regra.
2. **Envio:** publicar uma versão de programa `origem='coach'` cria, na mesma transação, um `aceites_programa` `pendente` e marca como `substituido` qualquer `pendente` anterior do mesmo programa.
3. **Aceitar** registra data e libera a versão para ativação; **não ativa**. Se já havia versão anterior ativa do mesmo programa, a UI oferece "Ativar a nova versão"; a sessão em andamento continua na versão em que começou.
4. **Recusar** não apaga nem desativa nada existente (AC-11); `motivo_recusa` é opcional.
5. **Ativar** programa de coach exige `aceito` e vínculo `ativo` no momento da ativação.
6. **Vínculo revogado:** aceites `pendente` passam a `retirado`; programas já aceitos continuam do aluno (RG-003).
7. **Edição pelo aluno:** só via cópia (`POST /programas/{id}/copiar`) — `origem='usuario'`, `derivado_de_programa_id` preenchido.
8. **Auditoria:** envio, aceite, recusa e retirada geram `auditoria_eventos`.

### 6.3 Endpoints

| Verbo | Rota | Regra |
|---|---|---|
| GET | `/me/prescricoes?estado=pendente` | Lista aceites do aluno |
| GET | `/me/prescricoes/{aceite_uuid}` | Prévia: autor, versão, data, fichas |
| POST | `/me/prescricoes/{aceite_uuid}/aceitar` | `pendente` → `aceito`; 409 se já decidido ou substituído |
| POST | `/me/prescricoes/{aceite_uuid}/recusar` | Corpo opcional `{"motivo":"..."}` |
| POST | `/coach/prescricoes/{aceite_uuid}/retirar` | Somente o coach autor, enquanto `pendente` |
| GET | `/me/coaches` | Vínculos (vigentes e históricos) com escopo |
| PATCH | `/me/coaches/{coach_uuid}/escopo` | `{"compartilha_historico":true,"compartilha_restricoes":false}`; grava consentimento |

## 7. Sincronização offline — protocolo revisado

### 7.1 Problema corrigido

No Doc 05 §10, `criar sessao_treino` enviava só `ficha_id`; o servidor gerava os UUIDs das séries e as operações seguintes (que usavam os UUIDs criados offline) apontavam para registros inexistentes.

### 7.2 Regra nova (RG-020)

O cliente é a **fonte dos UUIDs** de tudo que cria offline. A operação `criar` de uma sessão carrega o **snapshot completo**; o servidor valida contra a prescrição e grava **com os UUIDs do cliente**.

```json
{
  "operacao_uuid": "f77532d2-89a1-462c-ae0f-a93bebef89cb",
  "sequencia_cliente": 41,
  "entidade": "sessao_treino",
  "entidade_uuid": "6503a733-703b-4214-bb21-36e83d3fb12b",
  "tipo": "criar",
  "payload": {
    "tipo": "programado",
    "ficha_uuid": "9d0d2c0e-5d4b-4a1e-8d57-0f2b5d9f7a11",
    "iniciada_em": "2026-10-21T14:30:00Z",
    "exercicios": [
      {
        "uuid": "a1111111-1111-4111-8111-111111111111",
        "ficha_exercicio_uuid": "b2222222-2222-4222-8222-222222222222",
        "exercicio_uuid": "c3333333-3333-4333-8333-333333333333",
        "tipo_item": "prescrito",
        "ordem": 1,
        "series": [
          {"uuid": "d4444444-4444-4444-8444-444444444444", "serie_prescrita_uuid": "e5555555-5555-4555-8555-555555555555", "ordem": 1, "tipo": "normal"}
        ]
      }
    ]
  }
}
```

Para `tipo: "avulso"`, `ficha_uuid` é omitido e `ficha_exercicio_uuid`/`serie_prescrita_uuid` são `null`.

**Validações do servidor:** `ficha_uuid` pertence a versão publicada do aluno (ou a versão aceita/ativa, no caso de coach); `ficha_exercicio_uuid` e `serie_prescrita_uuid` pertencem à ficha; `exercicio_uuid` está `publicado`; UUIDs do cliente são válidos v4 e ainda não existem; substituição exige `exercicio_prescrito_uuid`. Qualquer falha rejeita a operação inteira com `VALIDATION_ERROR` e `details.fields`.

### 7.3 Operações permitidas em `/sync/push`

| `entidade` | `tipo` | Efeito |
|---|---|---|
| `sessao_treino` | `criar` | Cria sessão + exercícios + séries (snapshot) |
| `sessao_treino` | `atualizar` | Observação do treino |
| `sessao_treino` | `concluir` / `cancelar` | Encerra; `duracao_ativa_segundos` calculada descontando `sessoes_pausas` |
| `sessao_pausa` | `criar` / `atualizar` | Início e fim de pausa |
| `sessao_exercicio` | `criar` | Exercício adicionado ou substituto durante a sessão |
| `sessao_serie` | `criar` | Série extra |
| `sessao_serie` | `atualizar` | Registro de carga, reps, duração, RIR, status |

Ordem obrigatória de dependência: sessão → exercícios → séries → pausas → conclusão. `sequencia_cliente` é monotônica por dispositivo e ordena a fila.

### 7.4 Concorrência e conflitos (D-04)

- **Série:** aplica-se *última-escrita-vence* por `atualizado_cliente_em`; empate resolve por `sequencia_cliente`. Se o `dispositivo_id` gravado for diferente do remetente **e** os valores divergirem, retorna `conflito` com `estado_servidor` e o cliente pede escolha ao usuário. `revision` é incrementada a cada escrita (auditoria), mas **não é enviada pelo cliente**.
- **Sessão encerrada:** qualquer escrita em série posterior à conclusão retorna `conflito` (`SESSION_CLOSED`); o trigger impede a gravação mesmo se a aplicação falhar.
- **Relógio do dispositivo muito divergente** (|`atualizado_cliente_em` − `server_time`| > 24 h): servidor usa o horário de recebimento e sinaliza `clock_skew` na resposta.
- **Mesmo `operacao_uuid`, mesmo `payload_hash`:** devolve resultado armazenado. **Payload diferente:** `409 IDEMPOTENCY_KEY_REUSED`.
- **Programas e versões:** continuam com `expected_revision` (`PUT .../estrutura` e publicação).

### 7.5 Cache local necessário para o treino do dia

O app precisa baixar, ao abrir ou ao ativar um programa: ficha(s) com exercícios e séries (com UUIDs), dados mínimos dos exercícios (nome, modalidade, instruções textuais, mídia aprovada leve) e **último registro por exercício** (`GET /me/exercicios/ultimos-registros`). Mídia é cache opcional com limite de tamanho; o executor nunca depende dela.

## 8. Endpoints novos ou alterados

Padrões do Doc 05 §3 continuam valendo (envelope, erros, `Idempotency-Key` em POST de criação, paginação por cursor).

### 8.1 Executor e sessão

| Verbo | Rota | Descrição |
|---|---|---|
| POST | `/me/sessoes` | **Alterado:** `ficha_uuid` opcional (omitido = treino avulso, com `titulo_avulso` opcional). Aceita `exercicios` (snapshot) quando criada offline. Retorna 409 `SESSION_ALREADY_OPEN` se houver outra `em_andamento` (traz `sessao_uuid` para retomada) |
| POST | `/me/sessoes/{uuid}/exercicios` | Adiciona exercício do catálogo (`exercicio_uuid`, `ordem`, `uuid` opcional do cliente); `tipo_item=adicionado` |
| POST | `/me/sessoes/{uuid}/exercicios/{ex_uuid}/substituir` | `{"exercicio_uuid": "...", "uuid": "..."}`; cria item `substituido`, preservando `exercicio_prescrito_id`; séries pendentes migram para o novo item |
| POST | `/me/sessoes/{uuid}/pausar` / `/retomar` | Cria/encerra registro em `sessoes_pausas`; idempotentes |
| GET | `/me/exercicios/{exercicio_uuid}/ultimo-registro` | Última sessão **concluída** com séries `realizadas` desse exercício |
| GET | `/me/exercicios/ultimos-registros?ids=uuid1,uuid2` | Versão em lote (máx. 50) para pré-carga |
| PATCH | `/me/sessoes/{uuid}/series/{serie_uuid}` | **Alterado:** sem `expected_revision`; aceita `atualizado_cliente_em`; campos `duracao_segundos` e `tipo` |

### 8.2 Evolução

| Verbo | Rota | Descrição |
|---|---|---|
| GET | `/me/progresso/resumo?de=&ate=` | Sessões concluídas, séries realizadas, tempo ativo, volume (conforme §5 modalidades) e frequência semanal. Datas interpretadas no `fuso_horario` do usuário |
| GET | `/me/progresso/exercicios/{exercicio_uuid}` | **Fase 2** (`TEL-032`) |

### 8.3 Conta, privacidade e consentimentos

| Verbo | Rota | Descrição |
|---|---|---|
| GET/POST | `/me/consentimentos` | Lista e registra aceite (`tipo`, `versao_documento`) |
| POST | `/me/consentimentos/{id}/revogar` | Revoga; `compartilhamento_coach` revogado encerra o escopo correspondente |
| POST | `/me/solicitacoes` | `{"tipo":"exportacao"}` ou `{"tipo":"exclusao","senha":"..."}` (reautenticação obrigatória na exclusão) |
| GET | `/me/solicitacoes` e `/me/solicitacoes/{uuid}` | Acompanhar estado; exportação devolve URL temporária |

**Exclusão de conta (RG-021):** a solicitação é registrada, o acesso é revogado imediatamente (`usuarios.estado='suspenso'`, sessões revogadas) e a eliminação/anonimização segue política de retenção documentada. A **tela de exclusão dentro do app é obrigatória** para publicação nas lojas.

**Cadastro:** `POST /auth/register` exige `aceita_termos`, `versao_termos`, `versao_privacidade` e `maior_de_18: true`; grava `consentimentos_privacidade` e `maioridade_declarada_em` na mesma transação.

### 8.4 Coach, profissional e vínculos (Fase 3 em UI; contrato fixo desde já)

| Verbo | Rota | Alteração |
|---|---|---|
| POST | `/me/profissional` | Solicita habilitação (`conselho`, `registro`); estado `em_analise` |
| GET | `/coach/alunos/{aluno_uuid}/...` | **Rotas do Doc 05 §7.5 passam a usar `{aluno_uuid}`** |
| DELETE | `/me/coaches/{coach_uuid}` | Idem (UUID) |
| — | Rotas de aceite | §6.3 |

**Regra (RG-022):** para prescrever, o coach precisa de papel `coach` **e** `profissionais.status_verificacao='verificado'`, exceto em piloto fechado configurado pelo administrador (flag de ambiente, registrada em auditoria).

**Acesso a dados do aluno:** histórico exige `vinculos.status='ativo'` **e** `compartilha_historico=1`; `restricoes_json` exige `compartilha_restricoes=1`; ambos reconferidos no banco a cada requisição.

### 8.5 Administração

| Verbo | Rota | Descrição |
|---|---|---|
| POST | `/admin/exercicios/{uuid}/enviar-revisao` | `rascunho` → `em_revisao` |
| POST | `/admin/exercicios/{uuid}/revisar` | `{"decisao":"aprovar\|rejeitar","justificativa":"..."}` (rejeição exige justificativa); preenche `revisado_por/em` |
| POST | `/admin/exercicios/{uuid}/publicar` | **Alterado:** exige revisão aprovada e ao menos instrução textual |
| GET/PUT | `/admin/usuarios`, `/admin/usuarios/{uuid}/papeis` | Gestão de papéis (menor privilégio; auditado) |
| POST | `/admin/profissionais/{uuid}/verificar` | Define `status_verificacao` |
| GET/POST/PATCH | `/admin/modelos-sugestao` | CRUD de rascunho (Fase 2) |
| POST | `/admin/modelos-sugestao/{id}/aprovar` | Exige revisor habilitado; modelo `aprovado` é imutável (nova versão = nova linha) |

### 8.6 Alterações de contrato no Doc 05

- IDs: toda resposta usa UUID (D-07). `exercicio_id`, `ficha_id` e similares nos payloads viram `exercicio_uuid`, `ficha_uuid`, etc.
- `409 VERSION_IMMUTABLE` para PUT/PATCH em versão publicada (D-08).
- Códigos novos: `SESSION_ALREADY_OPEN`, `SESSION_CLOSED`, `IDEMPOTENCY_KEY_REUSED`, `PRESCRIPTION_NOT_PENDING`, `COACH_NOT_VERIFIED`, `CONSENT_REQUIRED`, `UNDERAGE_NOT_ALLOWED`.
- Triggers do banco que sinalizam `VERSION_IMMUTABLE` ou `SESSION_CLOSED` (SQLSTATE `45000`) são traduzidos pela camada de serviço para o código HTTP correspondente; nunca expor a mensagem do banco.

## 9. Matriz de rastreabilidade TEL → API

| Tela | Endpoints principais | Fase |
|---|---|---|
| TEL-001 Inicialização | `POST /auth/refresh`, `GET /me`, `GET /me/programa-ativo`, `GET /me/sessoes?status=em_andamento` | 1 |
| TEL-003 Login/cadastro | `POST /auth/register`, `/auth/login`, `/me/consentimentos` | 1 |
| TEL-004 Recuperação | `POST /auth/password/forgot`, `/auth/password/reset` | 1 |
| TEL-005/006 Perfil e preferências | `GET/PUT /me/perfil-treinamento`, `PATCH /me` | 1 |
| TEL-007 Escolher origem | `GET /me/prescricoes?estado=pendente`, `POST /me/sugestoes` | 1 (manual) / 2 (app) / 3 (coach) |
| TEL-010 Início | `GET /me/programa-ativo`, `GET /me/sessoes?limit=1`, `GET /me/prescricoes?estado=pendente` | 1 |
| TEL-011 Detalhe da ficha | `GET /programas/{id}/versoes/{n}` | 1 |
| TEL-012 Execução | `POST /me/sessoes`, `PATCH .../series/{uuid}`, `POST .../series`, `POST .../exercicios`, `.../substituir`, `.../pausar`, `.../retomar`, `GET /me/exercicios/ultimos-registros`, `POST /sync/push` | 1 |
| TEL-013 Descanso | (local; sem API) | 1 |
| TEL-014 Resumo | `POST /me/sessoes/{uuid}/concluir`, `GET /me/sessoes/{uuid}` | 1 |
| TEL-020 Meus treinos | `GET /me/programas`, `POST /programas/{id}/ativar`, `/arquivar` | 1 |
| TEL-021/022/023 Editor | `POST /me/programas`, `POST .../versoes`, `PUT .../estrutura`, `POST .../publicar`, `POST /programas/{id}/copiar` | 1 |
| TEL-024 Biblioteca | `GET /exercicios`, `/grupos-musculares`, `/equipamentos` | 1 |
| TEL-025 Detalhe do exercício | `GET /exercicios/{uuid}`, `/alternativas`, `/midias` | 1 |
| TEL-026/027 Sugestão | `POST /me/sugestoes`, `GET /me/sugestoes/{id}`, `POST .../aceitar`, `.../descartar` | 2 |
| TEL-028 Prescrição recebida | `GET /me/prescricoes/{uuid}`, `POST .../aceitar`, `.../recusar` | 3 |
| TEL-030 Evolução | `GET /me/progresso/resumo` | 1 |
| TEL-031 Histórico | `GET /me/sessoes`, `GET /me/sessoes/{uuid}` | 1 |
| TEL-032 Evolução por exercício | `GET /me/progresso/exercicios/{uuid}` | 2 |
| TEL-040 Perfil | `GET/PATCH /me`, `GET /me/dispositivos`, `POST /auth/logout`, `/auth/logout-all` | 1 |
| TEL-041 Vínculos | `GET /me/convites`, `POST .../aceitar`, `.../recusar`, `GET /me/coaches`, `PATCH .../escopo`, `DELETE /me/coaches/{uuid}` | 3 |
| TEL-042 Privacidade | `GET /me/consentimentos`, `POST /me/solicitacoes`, `GET /me/solicitacoes` | 1 |
| TEL-050 Offline/erros | `POST /sync/push`, `POST /me/dispositivos` | 1 |
| COA-010…031 (portal coach) | `GET /coach/alunos`, `POST /coach/convites`, `POST /coach/alunos/{uuid}/programas`, rotas de programa/versão, `GET /coach/alunos/{uuid}/sessoes` | 3 |
| ADM-020…060 (admin) | `/admin/exercicios`, `/admin/midias`, `/admin/usuarios`, `/admin/auditoria` | 1 (catálogo/mídia/auditoria) |

**Lacuna resolvida no Documento 07:** `GET /me/dispositivos` foi incluído no OpenAPI (decisão C-01); antes só `POST` e `DELETE` estavam no Doc 05 §10.1.

## 10. Regras de integridade adicionadas

**RG-019** Programas de coach só são visíveis ao aluno com `aceites_programa`.  
**RG-020** UUIDs de entidades criadas offline são do cliente; o servidor valida e grava.  
**RG-021** Exclusão de conta suspende acesso imediatamente e elimina/anonimiza conforme política de retenção.  
**RG-022** Prescrição por coach exige `verificado`, salvo piloto fechado auditado.  
**RG-023** Vínculo coach–aluno preserva histórico: um registro por período; no máximo um vigente (`pendente` ou `ativo`) por par.  
**RG-024** Versões de programa publicadas ou substituídas, e modelos de sugestão aprovados, não são editados nem apagados.  
**RG-025** Sessão `avulsa` não referencia versão nem ficha; sessão `programada` sempre referencia ambas, coerentes entre si (FK composta).

## 11. Conformidade: lojas, LGPD e segurança (checklist de pré-lançamento)

- [ ] Exclusão de conta acessível dentro do app (exigência da Apple App Store).
- [ ] Declaração de coleta de dados de saúde/condicionamento nas lojas (App Store privacy labels, Google Play Data safety).
- [ ] Política de privacidade e termos publicados com versão; `versao_documento` gravada no aceite.
- [ ] Declaração de 18+ no cadastro (D-09).
- [ ] Texto visível em sugestões e na Capi: informação geral, não substitui avaliação profissional.
- [ ] Verificação do profissional **antes** de qualquer prescrição comercial (RG-022).
- [ ] Logs, analytics e relatórios de falha sem `restricoes_json`, senha ou tokens.
- [ ] Pesquisa de marca CapiFit (INPI), domínio e nome nas lojas.
- [ ] Licenças da fonte, ícones, sons e mídia.
- [ ] Backup e teste de restauração do banco e do storage.

## 12. Critérios de aceite adicionais

| ID | Dado / Quando | Esperado |
|---|---|---|
| CA-06-01 | Duas sessões iniciadas pelo mesmo aluno | A segunda recebe `409 SESSION_ALREADY_OPEN`; banco também rejeita |
| CA-06-02 | `INSERT`/`UPDATE`/`DELETE` em ficha, exercício ou série de versão publicada (mesmo via SQL direto) | Rejeitado por trigger |
| CA-06-03 | Coach publica versão para aluno | Cria aceite `pendente`; rascunhos anteriores continuam invisíveis ao aluno |
| CA-06-04 | Aluno recusa prescrição | Programas e ativação atuais intactos |
| CA-06-05 | Aluno aceita prescrição | Versão elegível; programa **não** ativado automaticamente |
| CA-06-06 | Vínculo revogado com aceite `pendente` | Aceite passa a `retirado` |
| CA-06-07 | Sessão criada offline com séries de UUID do cliente | Após `sync/push`, séries existem com os mesmos UUIDs, sem duplicação |
| CA-06-08 | Mesmo `operacao_uuid` com payload diferente | `409 IDEMPOTENCY_KEY_REUSED` |
| CA-06-09 | Série alterada em dois dispositivos com valores distintos | `conflito` com `estado_servidor`; sem sobrescrita silenciosa |
| CA-06-10 | Substituição de exercício durante a sessão | `exercicio_prescrito_id` preservado; histórico mostra o executado |
| CA-06-11 | Pausa de 10 min em sessão de 60 min | `duracao_ativa_segundos` ≈ 50 min |
| CA-06-12 | Treino avulso concluído | Aparece no histórico e na evolução, sem versão/ficha |
| CA-06-13 | Cadastro sem `maior_de_18` | `422 UNDERAGE_NOT_ALLOWED`; nada gravado |
| CA-06-14 | Solicitação de exclusão | Acesso revogado imediatamente; solicitação rastreável |
| CA-06-15 | Coach com `compartilha_historico=0` consulta sessões do aluno | `403` |
| CA-06-16 | Exercício `tempo` registrado sem repetições | Aceito; fora do cálculo de volume |

## 13. Estratégia de testes complementar

Suíte de integração em **MySQL 8 real** (não MariaDB) com: aplicação do 04 + migration 001 em banco vazio; testes dos triggers por SQL direto (CA-06-02); concorrência com duas conexões para `uq_sessao_em_andamento` e `uq_vinculo_vigente`; teste de reaplicação idempotente de `sync/push` com falha entre operações; e teste de fuso horário (usuário em `America/Sao_Paulo`, sessão que cruza a meia-noite UTC).

## 14. Pendências residuais

1. Confirmar D-01 (MySQL 8 vs ajustar tudo para MariaDB) e executar a migration em MySQL 8.
2. Confirmar D-02 (coach na Fase 3) e D-05 (avulso na Fase 1).
3. Escolher responsável e critérios do **profissional revisor** e do **conjunto piloto de exercícios**.
4. Definir retenção de `operacoes_sync`, `requisicoes_idempotentes` e `limites_requisicao` (jobs de limpeza).
5. Definir política de exclusão: anonimizar vs eliminar sessões, e prazo de retenção de auditoria.
6. ~~Convenção de carga em exercícios unilaterais~~ — **resolvida no Documento 09 §6** (coluna `convencao_carga`).
7. Ordem de produção das mídias da Capi para o catálogo piloto.

## 15. Próximos documentos (numeração atualizada)

- **Documento 07 — OpenAPI 3.1 e testes de contrato** — **produzido** (`07_openapi.yaml`, `07_openapi_testes_contrato.md`).
- **Documento 08 — Design System e Character Bible da Capi** — **produzido** (`08_design_system_character_bible_capi.md`, `08_design_tokens.json`).
- **Documento 09 — Catálogo de exercícios e padrões de prescrição** — **produzido** (`09_catalogo_exercicios_padroes_prescricao.md`, migration e seed).
- **Documento 10 — Backlog, roadmap por fase e plano de testes** — **produzido** (`10_backlog_roadmap_plano_testes.md`, `10_backlog.csv`).

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 21/10/2026 | Decisões D-01…D-14, Migration 001, ciclo de aceite, sync revisado, endpoints novos, matriz TEL→API, checklist de conformidade |
