# CapiFit — Documento 07
## OpenAPI 3.1 e Estratégia de Testes de Contrato

**Versão:** 1.0 — baseline de contrato  
**Data:** 21/10/2026  
**Status:** Proposta para validação  
**Artefatos complementares:** `07_openapi.yaml` (contrato) e `tools/contract/` (validador)  
**Dependências:** Documentos 05 (API) e 06 (reconciliação, decisões D-01…D-14)

---

## 1. Objetivo e precedência

Transformar os contratos narrativos dos Documentos 05 e 06 em uma especificação **OpenAPI 3.1 executável** e definir como o contrato é verificado automaticamente, para impedir divergência entre documentação, backend PHP e aplicativo.

**Precedência:**

| Assunto | Fonte de verdade |
|---|---|
| Formato de requisição/resposta, códigos HTTP, papéis por rota, fase | `07_openapi.yaml` |
| Regras de negócio, transações, sync, autorização semântica | Documentos 05 e 06 |
| Schema do banco | Documento 04 + Migration 001 (Documento 06) |

Se OpenAPI e Documento 05/06 divergirem em **formato**, vale o OpenAPI; em **regra de negócio**, valem os documentos — e a divergência deve ser corrigida por revisão versionada (governança do Doc 05).

## 2. O que foi entregue

| Item | Conteúdo |
|---|---|
| `docs/07_openapi.yaml` | 95 operações em 82 caminhos, 87 schemas, 8 respostas de erro reutilizáveis, parâmetros comuns (`limit`, `cursor`, `Idempotency-Key`) e esquema `bearerAuth` |
| `tools/contract/validate-openapi.js` | Lint (Redocly, regras *recommended*) + invariantes de contrato (§5.1) |
| `tools/contract/package.json` | Dependências do validador |

**Operações por grupo:** Auth 8 · Conta 7 · Privacidade 6 · Catálogo 6 · Programas 12 · Sessões 12 · Progresso 4 · Sync 2 · Coach 18 · Sugestões 5 · Admin 15.  
**Por fase (`x-fase`):** Fase 1 = 65 · Fase 2 = 11 · Fase 3 = 19 (ver Documento 06 §4).

**Estado de validação:** o arquivo passa no lint sem erros nem avisos e em todas as invariantes do §5.1 (executado nesta revisão com Redocly OpenAPI Core). Ainda **não** há backend; os testes dos níveis L1–L6 abaixo são especificados aqui e serão implementados junto com a API.

## 3. Convenções do contrato

### 3.1 Extensões

| Extensão | Valores | Uso |
|---|---|---|
| `x-papeis` | `aluno`, `coach`, `admin`, `publico` | Papéis autorizados; `publico` = `security: []`. Alimenta a geração dos testes de autorização (L3) |
| `x-fase` | `1`, `2`, `3` | Fase de entrega. Rotas de fases futuras existem no contrato; o backend responde `501 NOT_IMPLEMENTED` até a fase correspondente |

`x-papeis` indica **elegibilidade por papel**. A autorização completa (titularidade, vínculo ativo, escopo, aceite) continua sendo verificada pelo servidor (Doc 05 §5) e coberta pelos testes L3.

### 3.2 Envelope e erros

Toda resposta 2xx com corpo usa `{ "data": ..., "meta": ... }`; listas usam `{ "data": [...], "pagination": {...}, "meta": ... }`. Toda resposta de erro usa `Error` com `code` do enum `ErrorCode` (19 códigos, incluindo os do Documento 06 §8.6). Cada operação declara, no mínimo, `400` e `429`; rotas protegidas declaram também `401`.

### 3.3 Identificadores

UUID em toda entidade sincronizável e em usuários (D-07). **Exceções documentadas** (não sincronizáveis, ids string opacos): taxonomias (`grupos-musculares`, `equipamentos`), mídias, sugestões, convites e consentimentos. Parâmetros de path inteiros só existem para `{numero}` (número de versão).

### 3.4 Corpos estritos

Todos os schemas de entrada usam `additionalProperties: false`: campo desconhecido gera `422` (Doc 05 §3.2). Schemas compostos com `allOf` usam `unevaluatedProperties: false`.

## 4. Decisões de contrato tomadas ao consolidar

Estes pontos não estavam fechados nos Documentos 05/06 e foram definidos no OpenAPI. Todos são ajustáveis antes da implementação.

| ID | Decisão | Motivo |
|---|---|---|
| C-01 | `GET /me/dispositivos` incluído (lacuna apontada no Doc 06 §9) | Necessário para a tela TEL-040 e para revogação |
| C-02 | `POST /me/convites/{id}/aceitar` recebe no corpo o **escopo inicial** (`compartilha_historico`, `compartilha_restricoes`) | O aceite do vínculo e o consentimento de compartilhamento ocorrem no mesmo ato (Doc 06 §6) |
| C-03 | `GET /me/programa-ativo` retorna `ProgramaAtivoDetalhe` (programa + versão completa) | O app precisa do conteúdo da ficha para operar offline; evita segunda chamada |
| C-04 | `POST /programas/{uuid}/ativar` retorna `ProgramaAtivo` enxuto (`programa_id`, `versao_numero`, `ativado_em`), como no Doc 05 §7.4 | Mantém o contrato original |
| C-05 | Série prescrita e sessão-série em respostas incluem `id` UUID; `SessaoSerie.revision` é exposta somente leitura | Auditoria; o cliente **não** a envia (D-04) |
| C-06 | Mídia na API pública só tem `status: aprovado` | RG-016/BR-09 |
| C-07 | `Sugestao.aviso_profissional` preenchido quando houver restrição declarada ou dados insuficientes | Segurança da sugestão (Doc 01 §4.3) |
| C-08 | `GET /sync/pull` e `GET /me/progresso/exercicios/{uuid}` existem no contrato com `x-fase: 2` e resposta `501` | Reserva o espaço sem prometer funcionalidade (Doc 05 §10.2) |
| C-09 | `POST /admin/exercicios/{uuid}/midias` recebe `storage_key` (objeto já carregado), nunca binário ou URL livre | Doc 05 §6 e item 6 do §17 (upload controlado) |
| C-10 | `POST /auth/register` exige `aceita_termos: true` e `maior_de_18: true` (constantes no schema) | D-09; rejeição por schema, depois reforçada por `UNDERAGE_NOT_ALLOWED` |
| C-11 | Rotas `/me/prescricoes/*` e de vínculo aparecem com `x-fase: 3` mesmo existindo desde a Fase 1 no schema | O backend pode implementá-las cedo, mas só são consumidas na Fase 3 |

## 5. Estratégia de testes de contrato

### 5.1 L0 — Validação estática do contrato (implementado)

`tools/contract/validate-openapi.js` roda em todo *pull request* que altere `docs/07_openapi.yaml`:

1. Lint Redocly (regras *recommended*): referências resolvidas, `operationId` único, tipos válidos.
2. Toda operação tem `operationId`, `x-papeis`, `x-fase` válido, `400` e `429`.
3. Rota protegida declara `401`; rota pública declara `security: []`.
4. Operações da lista de idempotentes exigem o header `Idempotency-Key` — e nenhuma outra o exige.
5. Todo `2xx` com corpo está no envelope `data`.
6. Nenhum parâmetro de path inteiro além de `{numero}`.
7. Rotas `/coach/*` e `/admin/*` não aceitam `aluno` como papel.
8. Códigos de erro do Documento 06 existem em `ErrorCode`.
9. Rotas exigidas pela matriz TEL→API (Doc 06 §9) não podem desaparecer.

```bash
cd tools/contract && npm install && npm run validate
```

### 5.2 Níveis seguintes (a implementar com o backend)

| Nível | Objetivo | Ferramenta sugerida | Quando roda |
|---|---|---|---|
| **L1** Conformidade de resposta | Toda resposta real da API (2xx e erros) valida contra o schema do OpenAPI | `league/openapi-psr7-validator` (PHP) em middleware de teste | Testes de integração |
| **L2** Conformidade de requisição | Corpos inválidos retornam 400/422 conforme o schema; campos extras rejeitados | Mesma biblioteca + casos negativos gerados | Integração |
| **L3** Matriz de autorização | Para cada operação × papel, resposta esperada | Gerador de testes lendo `x-papeis` | Integração |
| **L4** Idempotência e concorrência | Repetição de chave, corrida de duas conexões | Testes dedicados (§6) | Integração com MySQL 8 |
| **L5** Cenários de sync | Fila offline, conflitos e reaplicação | Testes dedicados (§6) | Integração |
| **L6** Compatibilidade de versão | Bloqueia mudança incompatível em `/v1` | `oasdiff breaking` ou `redocly diff` contra a *tag* da última release | CI de PR |
| **L7** Consumidores | Tipos TypeScript do app gerados do contrato e servidor *mock* para o front antes do backend existir | `openapi-typescript`; Prism | Desenvolvimento do app |

**Pipeline de CI sugerido (ordem):** L0 → L6 → testes unitários → L1/L2/L3 → L4/L5 (MySQL 8) → build do app com tipos gerados (L7).

### 5.3 L3 — Geração da matriz de autorização

Para cada operação, o gerador cria casos a partir de `x-papeis` e dos fixtures abaixo.

| Ator | Esperado em rota que ele **não** pode usar |
|---|---|
| Sem token | `401 UNAUTHENTICATED` |
| Papel fora de `x-papeis` | `403 FORBIDDEN` |
| Aluno A acessando recurso do aluno B | `404 RESOURCE_NOT_FOUND` (sem vazamento) |
| Coach sem vínculo `ativo` | `403` ou `404` |
| Coach com vínculo, sem `compartilha_historico` | `403` em `/coach/alunos/{uuid}/sessoes` |
| Coach não `verificado` (fora de piloto) | `403 COACH_NOT_VERIFIED` ao publicar |
| Admin em dados de aluno | Apenas dados mínimos e evento em auditoria |

**Fixtures mínimos:** 2 alunos, 1 coach verificado e 1 não verificado, 1 admin, vínculo ativo com escopo variável, programa publicado de cada origem, sessão aberta e uma encerrada, exercício publicado e um em revisão.

### 5.4 Limites do OpenAPI (cobertos por testes, não pelo schema)

O contrato **não** expressa — e por isso exige teste — o seguinte:

| Regra | Caso |
|---|---|
| `reps_min <= reps_max` | 422 com `details.fields` |
| `justificativa` obrigatória ao rejeitar revisão | 422 |
| Ordens únicas dentro de ficha/exercício | 422 |
| Exercício referenciado precisa estar `publicado` | 422 |
| `senha` obrigatória em solicitação de exclusão | 422 |
| Conteúdo de `payload` em `/sync/push` conforme `entidade` + `tipo` | Rejeição por item |
| Máximo de 1 MB por lote de sync | 413 ou 400 |
| Cursor inválido | 400 |

## 6. Catálogo de testes de contrato

Os IDs `CT-*` referenciam os critérios `API-*` (Doc 05 §15), `CA-04-*` (Doc 04 §16) e `CA-06-*` (Doc 06 §12).

### 6.1 Autenticação e conta

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-01 | Login válido; senha errada; conta inexistente | 200; 401; 401 idêntico ao da senha errada | API-01 |
| CT-02 | `forgot` com e-mail existente e inexistente | Mesma resposta e latência similar (sem enumeração) | TEL-004 |
| CT-03 | Refresh reutilizado após rotação | 401 e toda a família de tokens revogada | Doc 06 D-11 |
| CT-04 | Registro sem `maior_de_18` ou com `false` | 422 `UNDERAGE_NOT_ALLOWED`; nada gravado | CA-06-13 |
| CT-05 | Registro com e-mail já cadastrado | Resposta compatível com política anti-enumeração definida na implementação | Doc 05 §4 |
| CT-06 | `PATCH /me` com campo não documentado | 422 | §3.4 |
| CT-07 | Exclusão sem `senha` / com senha errada | 422 / 401; acesso mantido | RG-021 |
| CT-08 | Exclusão válida | 201; tokens revogados; próximo request 401 | CA-06-14 |

### 6.2 Programas, versões e aceite

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-10 | Aluno lê programa de outro aluno | 404 | API-02 |
| CT-11 | `PUT estrutura` com `reps_min > reps_max` | 422 com campo | API-05 |
| CT-12 | `PUT estrutura` em versão publicada | 409 `VERSION_IMMUTABLE`; sem mutação | API-07 |
| CT-13 | `PUT estrutura` com `expected_revision` antigo | 409 `REVISION_CONFLICT` | Doc 05 §7.3 |
| CT-14 | Publicar versão válida | 200; versão `publicado`; atual atualizado | API-06 |
| CT-15 | SQL direto alterando série de versão publicada | Rejeitado por trigger (teste de banco) | CA-06-02 |
| CT-16 | Ativar versão inexistente / de outro programa | 404 / 422 | API-08 |
| CT-17 | Duas ativações concorrentes para o mesmo aluno | Um único registro em `programas_ativos` | API-19 |
| CT-18 | Coach publica versão | Aceite `pendente`; rascunhos invisíveis ao aluno em `/me/programas` | CA-06-03 |
| CT-19 | Aluno aceita prescrição | Estado `aceito`; programa **não** ativado | CA-06-05 |
| CT-20 | Aceitar prescrição já decidida ou substituída | 409 `PRESCRIPTION_NOT_PENDING` | Doc 06 §6 |
| CT-21 | Ativar programa de coach sem aceite | 409/422 | Doc 06 §6.2 |
| CT-22 | Aluno edita via cópia | Original intocado; `derivado_de` preenchido | API-16 |
| CT-23 | Vínculo revogado com aceite pendente | Aceite `retirado`; coach perde acesso imediatamente | CA-06-06 |

### 6.3 Sessões e execução

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-30 | Iniciar duas sessões simultâneas | 409 `SESSION_ALREADY_OPEN` com `details.sessao_uuid` | CA-06-01 |
| CT-31 | Iniciar sessão e publicar nova ficha | Sessão preserva a versão original | API-09 |
| CT-32 | Falha ao criar séries da sessão | Rollback; nenhuma sessão órfã | API-20 |
| CT-33 | Treino avulso + adicionar exercício | Sessão `avulso` sem versão/ficha; aparece no histórico | CA-06-12 |
| CT-34 | Substituir exercício durante a sessão | `tipo_item=substituido`, prescrito preservado | CA-06-10 |
| CT-35 | `PATCH` de série com carga negativa / RIR 11 | 422 | CA-04-08 |
| CT-36 | `PATCH` de série em sessão concluída | 409 `SESSION_CLOSED`; trigger também protege | BR-07 |
| CT-37 | Pausa de 10 min em sessão de 60 min | `duracao_ativa_segundos` ≈ 3000 | CA-06-11 |
| CT-38 | Concluir a mesma sessão duas vezes (mesma chave) | Mesmo resultado; uma conclusão | API-11 |
| CT-39 | `ultimos-registros` com 51 ids / id inválido | 422 | Doc 06 §8.1 |
| CT-40 | Exercício `tempo` sem repetições | Aceito; fora do volume | CA-06-16 |
| CT-41 | Resumo de progresso com sessão às 23:30 em `America/Sao_Paulo` | Contada no dia local correto | Doc 06 §13 |

### 6.4 Idempotência HTTP e sync

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-50 | Mesmo `Idempotency-Key` e corpo, duas vezes | Segunda resposta idêntica; um recurso | Doc 05 §3 |
| CT-51 | Mesmo `Idempotency-Key`, corpo diferente | 409 `IDEMPOTENCY_KEY_REUSED` | API-13 |
| CT-52 | Corrida: duas requisições simultâneas com a mesma chave | Uma executa; a outra devolve o resultado | — |
| CT-53 | Push de `criar sessao_treino` com snapshot e UUIDs do cliente | Séries criadas com os mesmos UUIDs | CA-06-07 |
| CT-54 | Push repetido do mesmo lote | Nenhum duplicado; resultados idênticos | API-12 |
| CT-55 | Mesmo `operacao_uuid` com payload diferente | `rejeitada`/409 por `payload_hash` | CA-06-08 |
| CT-56 | Lote com uma operação em conflito | HTTP 200; demais aplicadas; item com `conflito` + `estado_servidor` | Doc 05 §10.1 |
| CT-57 | Série alterada por dois dispositivos com valores distintos | `conflito`, sem sobrescrita silenciosa | CA-06-09 |
| CT-58 | Série alterada pelo mesmo dispositivo, duas vezes fora de ordem | Vence `atualizado_cliente_em` maior | D-04 |
| CT-59 | Operação dependente chega antes da sessão | `rejeitada` com motivo estável | Doc 05 §10.1 |
| CT-60 | Lote com 51 operações | Rejeitado inteiro com 422 | Doc 05 §10.1 |
| CT-61 | Push após vínculo revogado (operação de coach atrasada) | Negada | API-04 |
| CT-62 | `clock_skew` > 24 h | Servidor usa horário de recebimento e sinaliza | Doc 06 §7.4 |

### 6.5 Catálogo, mídia e admin

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-70 | Exercício `rascunho` / `em_revisao` em `/exercicios` | Não aparece | CA-04-11 |
| CT-71 | Mídia não aprovada em `/exercicios/{uuid}/midias` | Não aparece | API-14 |
| CT-72 | Publicar exercício sem revisão aprovada | 409/422 | Doc 06 §8.5 |
| CT-73 | Rejeitar revisão sem justificativa | 422 | §5.4 |
| CT-74 | Aluno chama `/admin/*` | 403 | API-18 |
| CT-75 | Admin lista usuários | Sem e-mail completo além do necessário; evento em auditoria | API-18 |
| CT-76 | Paginação `limit=101` / cursor inválido | `limit` limitado ou 422 / 400 | API-17 |

### 6.6 Privacidade

| ID | Cenário | Esperado | Ref. |
|---|---|---|---|
| CT-80 | Logs e respostas de erro | Nunca contêm senha, tokens, `restricoes` ou SQL | Doc 05 §12 |
| CT-81 | Coach lê histórico com `compartilha_historico=0` | 403 | CA-06-15 |
| CT-82 | Coach lê `restricoes` sem `compartilha_restricoes` | Campo ausente/403 | Doc 06 §8.4 |
| CT-83 | Revogar consentimento `compartilhamento_coach` | Escopo zerado; próximo acesso do coach negado | Doc 06 §8.3 |
| CT-84 | Exportação concluída | `download_url` temporária expira | Doc 06 §8.3 |

## 7. Evolução do contrato

1. **`/v1` é estável:** após a primeira release, só mudanças **compatíveis** (campo opcional novo, rota nova, valor novo de enum **em respostas** documentado como extensível).
2. **Mudança incompatível** (remover/renomear campo ou rota, estreitar enum de resposta, tornar campo de requisição obrigatório, alterar semântica de status) exige `/v2` ou período de depreciação com `Deprecation`/`Sunset` e entrada no changelog. O teste L6 bloqueia o merge.
3. Todo PR que mude `07_openapi.yaml` deve: passar L0, atualizar a matriz TEL→API do Documento 06 se criar/remover rota, e referenciar o teste `CT-*` afetado.
4. O OpenAPI é editado à mão (`07_openapi.yaml`); o script de geração usado nesta revisão não faz parte do repositório.
5. **Fases futuras:** rota `x-fase` 2 ou 3 responde `501 NOT_IMPLEMENTED` até ser liberada; remover esse comportamento não é mudança incompatível.

## 8. Pendências

1. Tipar o `payload` de `/sync/push` por combinação `entidade` + `tipo` (hoje é objeto livre). Sugestão: `oneOf` com discriminador sintético, mantendo o validador L5 como fonte de verdade enquanto isso.
2. Definir a política anti-enumeração do cadastro com e-mail já existente (CT-05): resposta idêntica com e-mail de aviso, ou erro explícito.
3. Escolher a biblioteca de validação em PHP (L1/L2) e confirmar compatibilidade com OpenAPI 3.1 (`type` com `null`, `const`, `unevaluatedProperties`); se houver lacuna, gerar uma versão 3.0 derivada para os testes.
4. Fixar o formato de `cursor` (opaco e assinado) e o limite de tamanho de lote em bytes (resposta 413).
5. Definir cabeçalhos de `Deprecation`/`Sunset` e canal de comunicação com o app.
6. Validar o contrato em MySQL 8 junto com a Migration 001 (Documento 06 §14).

## 9. Próximos documentos

- **Documento 08, 09 e 10 — produzidos** (design system, catálogo e prescrição, backlog/roadmap/plano de testes). O Documento 10 consome os `CT-*`, `CA-*` e `x-fase`; o Documento 09 §10 lista os ajustes pendentes no OpenAPI (`padrao_movimento`, `convencao_carga`, sinônimos na busca).

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 21/10/2026 | OpenAPI 3.1 (95 operações), validador L0, decisões C-01…C-11, catálogo de testes CT-01…CT-84, regras de evolução |
