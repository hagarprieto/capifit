# CapiFit — Documento 10
## Backlog, Roadmap por Fase e Plano de Testes

**Versão:** 1.0 — baseline de planejamento  
**Data:** 21/10/2026  
**Status:** Proposta para validação  
**Artefato complementar:** `10_backlog.csv` (128 histórias, importável em planilha ou ferramenta de gestão)  
**Dependências:** Documentos 01–09 (principalmente 06 §4 fases, 07 testes de contrato, 08 critérios DS, 09 critérios CAT)

---

## 1. Objetivo e limites

Transformar os Documentos 01–09 em um **plano executável**: backlog priorizado e rastreável, roadmap por marcos com critérios de saída verificáveis e plano de testes ligado aos critérios de aceite já definidos (`CA-*`, `AC-*`, `UX-*`, `CT-*`, `CAT-*`, `DS-*`).

**O que este documento não faz:** não atribui datas, equipe nem custo. Esses dados não existem nos documentos anteriores e **não foram inventados**. Em vez disso, o plano entrega tamanhos relativos, dependências, caminhos críticos e uma fórmula de previsão (§5.2) para ser calibrada com a velocidade real da equipe.

## 2. Premissas e escala

- **Decisões vigentes:** MySQL 8, coach na Fase 3, treino avulso na Fase 1, maioridade 18+ (Doc 06 §2).
- **Pontos** (escala 1, 2, 3, 5, 8, 13): esforço relativo de uma história pronta e testada. **Histórias de 13 pontos são candidatas a divisão** ao entrar no planejamento do ciclo (há 9 no backlog).
- **Papéis:** `API` (PHP), `App` (React Native/Expo), `Web` (painéis admin e coach), `Design` (UI, Capi, vídeo), `Conteúdo` (textos técnicos e revisão profissional), `QA`, `DevOps`, `Jurídico`.
- **Estado** inicial de todas as histórias: "a fazer". O CSV traz a coluna `estado` para acompanhamento.
- **Rastreabilidade:** toda história cita telas (`TEL-*`), fluxos (`FL-*`), testes (`CT-*`, `API-*`, `CA-*`) ou decisões (`D-*`, `RG-*`).

## 3. Roadmap por fase e marcos

### 3.1 Resumo por fase

| Fase | Histórias | Pontos |
|---|---|---|
| 1 | 99 | 529 |
| 2 | 18 | 136 |
| 3 | 11 | 81 |

- **Fase 1 — Núcleo individual** (marcos M0–M5): conta, catálogo piloto, programa manual, execução (incl. avulso), offline com sync idempotente, histórico, privacidade e lançamento.
- **Fase 2 — Sugestões e conforto** (M6–M7): motor por regras com modelos aprovados, exercício personalizado, sync incremental, evolução por exercício, notificações.
- **Fase 3 — Coach ponta a ponta** (M8–M9): verificação, vínculo, prescrição, aceite, portal e piloto fechado.

### 3.2 Marcos

| Marco | Objetivo | Histórias | Pontos | Pontos acumulados |
|---|---|---|---|---|
| M0 | Fundações e dependências externas iniciadas | 9 | 44 | 44 |
| M1 | Fatia vertical (login → catálogo → treino avulso online com série registrada) | 14 | 81 | 125 |
| M2 | Núcleo online completo (programas, executor, histórico) | 33 | 174 | 299 |
| M3 | Offline e sincronização completos | 25 | 126 | 425 |
| M4 | Beta fechado da Fase 1 | 15 | 91 | 516 |
| M5 | Lançamento da Fase 1 | 3 | 13 | 529 |
| M6 | Sugestões por regras (Fase 2a) | 9 | 68 | 597 |
| M7 | Conforto e evolução avançada (Fase 2b) | 9 | 68 | 665 |
| M8 | Coach: API, app e portal (Fase 3a) | 9 | 68 | 733 |
| M9 | Piloto fechado com coaches (Fase 3b) | 2 | 13 | 746 |

### 3.3 Critérios de saída por marco (portões)

| Marco | O que precisa estar verdadeiro | Evidência |
|---|---|---|
| **M0** | Pipeline de CI verde (lint, testes, `validate-openapi`, `check-contrast`); banco MySQL 8 com migrations 04 → 06 → 09 aplicadas; revisor técnico, responsável pela Capi e jurídico **nomeados** (dependências externas iniciadas) | CI; Doc 06 §5 validado em MySQL 8; registro de responsáveis |
| **M1** | Fatia vertical funcionando em staging: login → catálogo → treino avulso → série registrada → conclusão; tipos TS gerados do OpenAPI | Demo; CT-01, CT-30, CT-35, CT-38 |
| **M2** | Fluxos online completos: programa manual (criar/editar/publicar/ativar), executor, resumo, histórico; painel admin publica exercícios revisados | CA-01, CA-02, CA-03, CA-05, CA-09 (Doc 01); CT-10…CT-17, CT-22, CT-31…CT-41; E2E F1, F2, F5, F6 |
| **M3** | Offline e sync completos; recuperação de sessão; mídia da onda 1 em revisão | CA-07; AC-06, AC-08; UX-02, UX-03, UX-04; CT-50…CT-62; testes de caos (E08-08) sem perda ou duplicação |
| **M4** | Beta fechado: todas as funções da Fase 1; acessibilidade, segurança e privacidade auditadas; mídia da onda 1 aprovada | §8 (portão de beta); CA-11, CA-12; DS-01…DS-11; CT-70…CT-76, CT-80…CT-84; CAT-01…CAT-03, CAT-09…CAT-11 (para o subconjunto publicado) |
| **M5** | Lançamento: beta concluído sem defeito S1; lojas aprovadas; runbook e métricas ativos | §8 (portão de lançamento) |
| **M6** | Motor `rules-1.0` com modelos aprovados e triagem de segurança revisada; assistente no app | CAT-04…CAT-08; CA-04 (Doc 01); UX-07; E2E F9, F10 |
| **M7** | Evolução por exercício, sync incremental, exercício personalizado, notificações, onda 2 de mídia | TEL-032; CT de pull incremental (a criar com E13-03); moderação de personalizados |
| **M8** | Coach: verificação, vínculo, prescrição, aceite, portal e revogação | CA-06, CA-10 (Doc 01); CT-18…CT-23, CT-61, CT-81…CT-83; UX-14, UX-15; E2E F11, F12 |
| **M9** | Piloto fechado com coaches verificados e acompanhamento mínimo | Revisão jurídica concluída; métricas do piloto; sem defeito S1 |

## 4. Backlog

### 4.1 Épicos

| Épico | Nome | Fase | Histórias | Pontos |
|---|---|---|---|---|
| E00 | Fundações e DevOps | 1 | 10 | 41 |
| E01 | Autenticação e conta | 1 | 8 | 37 |
| E02 | Privacidade e LGPD | 1 | 6 | 24 |
| E03 | Catálogo e painel admin | 1 | 11 | 61 |
| E04 | Design system e app shell | 1 | 7 | 30 |
| E05 | Onboarding e início | 1 | 4 | 18 |
| E06 | Programas manuais | 1 | 9 | 50 |
| E07 | Execução de treino | 1 | 12 | 60 |
| E08 | Offline e sincronização | 1 | 9 | 56 |
| E09 | Histórico e evolução | 1 | 4 | 18 |
| E10 | Capi e mídia de exercícios | 1 | 10 | 82 |
| E11 | Qualidade e lançamento Fase 1 | 1 | 9 | 52 |
| E12 | Sugestões por regras | 2 | 11 | 84 |
| E13 | Conforto e evolução avançada | 2 | 7 | 52 |
| E14 | Coach ponta a ponta | 3 | 11 | 81 |
| **Total** | | | **128** | **746** |

### 4.2 Carga por papel (pontos)

| Papel | Pontos Fase 1 | Fase 2 | Fase 3 |
|---|---|---|---|
| DevOps | 23 | 0 | 5 |
| API | 143 | 44 | 34 |
| App | 198 | 31 | 8 |
| Jurídico | 5 | 0 | 5 |
| Web | 18 | 5 | 29 |
| Conteúdo | 24 | 24 | 0 |
| Design | 76 | 27 | 0 |
| QA | 42 | 5 | 0 |

A carga de `App` na Fase 1 é a maior; `Design` e `Conteúdo` formam trilhas paralelas que **podem atrasar o lançamento mesmo com o código pronto** (§5.1).

### 4.3 Histórias

Marcos e dependências validados automaticamente: nenhuma história depende de outra em marco posterior e não há ciclos. Os mesmos dados estão em `10_backlog.csv`.

#### E00 — Fundações e DevOps (Fase 1, 41 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E00-01 | Repositório, convenções de branch/commit e modelo de PR | M0 | 2 | DevOps | — | Protocolo GitHub da equipe |
| E00-02 | Ambientes local, CI e staging com MySQL 8 e PHP 8.2 (contêiner) | M0 | 5 | DevOps | — | Doc06 D-01 |
| E00-03 | Runner de migrations (04 → 06 → 09) e banco de teste descartável | M0 | 3 | API | E00-02 | Doc06 §5; Doc09 §2 |
| E00-04 | Esqueleto da API: front controller, router, middlewares, envelope e erros | M0 | 8 | API | E00-02 | Doc05 §14; Doc07 §3 |
| E00-05 | Pipeline de CI: lint, testes, validate-openapi (L0), check-contrast, diff de contrato (L6) | M0 | 5 | DevOps | E00-02 | Doc07 §5; Doc08 DS-01 |
| E00-06 | Observabilidade: logs estruturados sem PII, métricas por endpoint, alertas | M0 | 5 | DevOps | E00-04 | Doc05 §16; CT-80 |
| E00-07 | Segredos, backups e teste de restauração | M0 | 3 | DevOps | E00-02 | Doc06 §11 |
| E00-08 | Esqueleto do app Expo: rotas, tema por tokens, i18n pt-BR, lint de hex literal | M0 | 5 | App | E00-02 | Doc03 §13; Doc08 DS-02 |
| E00-09 | Tipos TypeScript gerados do OpenAPI e servidor mock (L7) | M1 | 3 | App | E00-05 | Doc07 §5.2 |
| E00-10 | Jobs de limpeza: idempotência, rate limit, tokens expirados | M3 | 2 | API | E00-04 | Doc06 §14.4 |

#### E01 — Autenticação e conta (Fase 1, 37 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E01-01 | API: registro com consentimentos e declaração de 18+ | M1 | 5 | API | E00-04 | CT-04; CA-06-13 |
| E01-02 | API: login, refresh com rotação e detecção de reuso, logout | M1 | 8 | API | E01-01 | CT-01; CT-03; API-01 |
| E01-03 | API: recuperação de senha e verificação de e-mail | M2 | 5 | API | E01-02 | TEL-004; CT-02 |
| E01-04 | API: /me e perfil de treinamento | M1 | 3 | API | E01-02 | TEL-005; CT-06 |
| E01-05 | Rate limit e anti-enumeração nas rotas de autenticação | M2 | 3 | API | E01-02 | Doc05 §12; CT-05 |
| E01-06 | App: TEL-002/003/004 e armazenamento seguro de tokens | M1 | 8 | App | E01-02, E00-08 | FL-01; AC-01 |
| E01-07 | App: TEL-001 inicialização e restauração de sessão | M1 | 3 | App | E01-06 | TEL-001 |
| E01-08 | API: dispositivos (registrar, listar, revogar) | M3 | 2 | API | E01-02 | TEL-040; C-01 |

#### E02 — Privacidade e LGPD (Fase 1, 24 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E02-01 | API: consentimentos (listar, registrar, revogar) | M2 | 3 | API | E01-02 | Doc06 §8.3 |
| E02-02 | API e workflow interno: solicitações de exportação e exclusão | M4 | 8 | API | E02-01 | CT-07; CT-08; CT-84; RG-021 |
| E02-03 | App: TEL-042 privacidade, exportação e exclusão com reautenticação | M4 | 5 | App | E02-02 | TEL-042; UX-16 |
| E02-04 | Termos de uso e política de privacidade versionados; política de retenção | M3 | 3 | Jurídico | — | Doc06 §11 |
| E02-05 | Revisão do fluxo de dados e dos logs (sem PII/restrições) | M4 | 3 | API | E00-06 | CT-80; RN-10 |
| E02-06 | Declarações das lojas (privacy labels e data safety) | M4 | 2 | Jurídico | E02-04 | Doc06 §11 |

#### E03 — Catálogo e painel admin (Fase 1, 61 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E03-01 | API: leitura do catálogo (busca por nome e sinônimo, grupos, equipamentos, alternativas, mídias) | M1 | 8 | API | E00-04, E03-02 | CT-70; CT-71; CAT-03 |
| E03-02 | Aplicar seed do catálogo piloto com importador idempotente | M1 | 3 | API | E00-03 | Doc09 §5; CAT-09 |
| E03-03 | Painel admin: login e controle de acesso por papel | M2 | 5 | Web | E01-02 | ADM-050 |
| E03-04 | Painel admin: exercícios, taxonomia, cuidados, sinônimos e alternativas | M2 | 8 | Web | E03-03 | ADM-020 |
| E03-05 | Fluxo de revisão e publicação de exercícios | M2 | 5 | API | E03-04 | ADM-040; CT-72; CT-73 |
| E03-06 | Mídias: vínculo por chave de storage, aprovação e URLs temporárias | M3 | 8 | API | E03-05 | ADM-030; CT-71; DS-10 |
| E03-07 | Auditoria: eventos e consulta | M3 | 3 | API | E03-03 | ADM-060; CT-75 |
| E03-08 | Usuários e papéis (menor privilégio) | M3 | 3 | Web | E03-03 | ADM-050; CT-74 |
| E03-09 | Dashboard operacional do admin | M4 | 2 | Web | E03-06 | ADM-010 |
| E03-10 | Redigir instruções, cuidados e alternativas dos 20 exercícios da onda 1 | M2 | 8 | Conteúdo | — | Doc09 §4.2; §8 |
| E03-11 | Revisão técnica por profissional habilitado do conteúdo da onda 1 | M3 | 8 | Conteúdo | E03-10 | Doc09 §3.3; RG-017 |

#### E04 — Design system e app shell (Fase 1, 30 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E04-01 | Tema claro/escuro por tokens, fonte Inter e tipografia escalável | M1 | 3 | App | E00-08 | Doc08 §4–5 |
| E04-02 | Componentes base: botões, campos, estado vazio, diálogo, aviso | M1 | 8 | App | E04-01 | Doc08 §8 |
| E04-03 | BottomTabs e AppShell com retorno ao treino em andamento | M1 | 3 | App | E04-01 | UX-01; UX-02 |
| E04-04 | OriginBadge, SyncStatus, WorkoutCard, WeekStrip e StatTile | M2 | 5 | App | E04-02 | UX-06; DS-08 |
| E04-05 | Preferências de acessibilidade e da Capi (ocultar, reduzir animação, sons) | M3 | 3 | App | E04-02 | RN-11; DS-07 |
| E04-06 | Biblioteca de estados padrão: carregando, vazio, erro, offline, sem permissão | M2 | 3 | App | E04-02 | Doc03 §9.1 |
| E04-07 | Protótipo navegável e teste de usabilidade rodada 1 | M1 | 5 | Design | — | Doc02 §16 |

#### E05 — Onboarding e início (Fase 1, 18 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E05-01 | App: TEL-005/006 perfil e preferências | M2 | 5 | App | E01-04, E04-02 | FL-01; AC-01 |
| E05-02 | App: TEL-007 escolha da origem (coach e sugestão indicados como "em breve") | M2 | 3 | App | E05-01 | TEL-007; D8-01 |
| E05-03 | App: TEL-010 Início com estados (sem programa, ativo, sessão aberta, offline) | M2 | 8 | App | E04-04, E06-01 | TEL-010; UX-01 |
| E05-04 | App: retomada de onboarding interrompido | M3 | 2 | App | E05-01 | FL-01 |

#### E06 — Programas manuais (Fase 1, 50 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E06-01 | API: programas, versões, estrutura, publicar, ativar, arquivar, copiar, programa ativo | M2 | 13 | API | E03-01, E00-03 | API-06…API-08; CT-10…CT-17; CT-22 |
| E06-02 | API: concorrência por revisão e testes de conflito | M2 | 3 | API | E06-01 | CT-13; Doc05 §7.3 |
| E06-03 | App: TEL-020 Meus treinos | M2 | 5 | App | E06-01, E04-04 | TEL-020; FL-07 |
| E06-04 | App: TEL-021/022 editor de programa e ficha | M2 | 8 | App | E06-03 | FL-02; AC-02; UX-17 |
| E06-05 | App: TEL-023 configurar exercício e séries | M2 | 5 | App | E06-04 | TEL-023; CT-11 |
| E06-06 | App: TEL-024/025 biblioteca e detalhe com fallback textual | M2 | 8 | App | E03-01, E04-02 | UX-10; AC-10 |
| E06-07 | App: rascunho local e aviso de alterações não salvas | M3 | 3 | App | E06-04 | UX-17; D-03 |
| E06-08 | App: ativação, troca de programa e arquivamento | M2 | 3 | App | E06-03 | FL-07; AC-07 |
| E06-09 | App: cópia de programa | M3 | 2 | App | E06-03 | RG-005; CT-22 |

#### E07 — Execução de treino (Fase 1, 60 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E07-01 | API: sessões avulsas (criar, consultar, observação, séries, concluir, cancelar) com sessão única em andamento | M1 | 8 | API | E03-01 | CT-30; CT-33; CT-35; CT-36; CT-38; CA-06-01 |
| E07-02 | API: adicionar e substituir exercício; pausar e retomar | M2 | 5 | API | E07-01 | CT-33; CT-34; CT-37 |
| E07-12 | API: sessões programadas a partir de ficha publicada (versão e ficha coerentes) | M2 | 5 | API | E06-01, E07-01 | CT-31; CT-32; API-09; API-20 |
| E07-03 | API: último registro por exercício (unitário e em lote) | M2 | 3 | API | E07-01 | CT-39; Doc06 §8.1 |
| E07-04 | App: TEL-011 detalhe da ficha e iniciar/continuar | M2 | 3 | App | E06-01, E07-12 | TEL-011 |
| E07-05 | App: TEL-012 executor com pré-preenchimento, concluir série e navegação | M1 | 13 | App | E07-01, E04-02 | FL-05; AC-05; D-14; UX-12 |
| E07-06 | App: TEL-013 timer de descanso por instante final e notificação local | M2 | 5 | App | E07-05 | UX-09; Doc08 §9 |
| E07-07 | App: treino avulso e adição/substituição de exercício | M2 | 5 | App | E07-02, E07-05 | CA-06-10; CA-06-12 |
| E07-08 | App: pausar, retomar, abandono e finalização parcial | M2 | 3 | App | E07-02, E07-05 | FL-05 |
| E07-09 | App: TEL-014 resumo da sessão | M2 | 3 | App | E07-05 | TEL-014; AC-05 |
| E07-10 | App: rótulos de carga por convenção e unilaterais | M2 | 2 | App | E07-05 | Doc09 §6; CAT-10 |
| E07-11 | App: recuperação da sessão após fechamento inesperado | M3 | 5 | App | E08-01 | RN-04; AC-06; UX-02 |

#### E08 — Offline e sincronização (Fase 1, 56 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E08-01 | App: SQLite local — esquema, repositórios e migração | M3 | 8 | App | E00-08 | Doc04 §10 |
| E08-02 | App: cache do treino do dia (programa, exercícios, últimos registros) | M3 | 5 | App | E08-01, E07-03 | Doc06 §7.5 |
| E08-03 | App: fila de operações, sequência do cliente e UUIDs gerados no app | M3 | 5 | App | E08-01 | RG-020 |
| E08-04 | API: /sync/push com snapshot, payload_hash e resultados por item | M3 | 13 | API | E07-02 | CT-53…CT-62; CA-06-07; CA-06-08 |
| E08-05 | App: resolução de conflitos (TEL-050) e regras de última-escrita | M3 | 8 | App | E08-03, E08-04 | CT-57; CT-58; D-04 |
| E08-06 | App: reconciliação por snapshot após o envio | M3 | 3 | App | E08-04 | Doc05 §10.2 |
| E08-07 | App: SyncStatus global e avisos de modo offline | M3 | 3 | App | E08-03, E04-04 | UX-04; AC-13 |
| E08-08 | Testes de caos de rede: duplicidade, perda e reordenação (L5) | M3 | 8 | QA | E08-04, E08-03 | API-12; AC-08; CA-07 |
| E08-09 | App: logout e troca de conta com dados pendentes | M3 | 3 | App | E08-03 | Doc03 §9.2 |

#### E09 — Histórico e evolução (Fase 1, 18 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E09-01 | API: histórico de sessões e detalhe | M2 | 3 | API | E07-01 | TEL-031; CT-12 (API-09) |
| E09-02 | API: resumo de progresso com fuso horário do usuário | M2 | 5 | API | E09-01 | CT-41; CT-40 |
| E09-03 | App: TEL-030/031 evolução e histórico | M2 | 8 | App | E09-01, E09-02, E04-04 | FL-06; CA-02; CA-09 |
| E09-04 | App: estados vazios e explicação do cálculo de volume | M3 | 2 | App | E09-03 | Doc03 §5.6 |

#### E10 — Capi e mídia de exercícios (Fase 1, 82 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E10-01 | Character Bible v1: model sheet, paleta e expressões | M0 | 8 | Design | — | Doc08 §10 |
| E10-02 | Rig 3D com limites articulares e rig técnico | M2 | 13 | Design | E10-01 | Doc08 §10.6 |
| E10-03 | Kit de UI da Capi: poses do MVP em WebP | M2 | 5 | Design | E10-01 | Doc08 §10.4 |
| E10-04 | Mídias da onda 1 — lote 1 (5 exercícios) | M3 | 8 | Design | E10-02, E03-10 | Doc09 §8 |
| E10-05 | Mídias da onda 1 — lote 2 (5 exercícios) | M3 | 8 | Design | E10-04 | Doc09 §8 |
| E10-06 | Mídias da onda 1 — lote 3 (5 exercícios) | M4 | 8 | Design | E10-05 | Doc09 §8 |
| E10-07 | Mídias da onda 1 — lote 4 (5 exercícios) | M4 | 8 | Design | E10-06 | Doc09 §8 |
| E10-08 | Mídia complementar (vídeo humano/esquema) onde exigida | M4 | 8 | Design | E10-04 | Doc08 §10.6 |
| E10-09 | App: ExerciseDemoPlayer com cache, legendas e fallback | M3 | 8 | App | E06-06, E03-06 | UX-10; DS-10 |
| E10-10 | Revisão técnica das mídias da onda 1 | M4 | 8 | Conteúdo | E10-07 | Doc08 §11.3 |

#### E11 — Qualidade e lançamento Fase 1 (Fase 1, 52 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E11-01 | Suíte E2E mobile dos fluxos críticos | M4 | 8 | QA | E07-09, E08-05 | Doc02 §16; Doc10 §6 |
| E11-02 | Auditoria de acessibilidade (leitor de tela, 200% de fonte, contraste) | M4 | 5 | QA | E04-05 | UX-11; UX-12; DS-04 |
| E11-03 | Segurança: ASVS nível 1, SAST, dependências e pentest externo | M4 | 8 | QA | E02-05 | Doc05 §12 |
| E11-04 | Desempenho: orçamento no aparelho de entrada | M4 | 5 | QA | E07-05 | Doc10 §7.6 |
| E11-05 | Teste de usabilidade rodada 2 (7 roteiros) | M4 | 5 | Design | E07-09 | Doc02 §16 |
| E11-06 | Beta fechado: distribuição, coleta, triagem e correções | M4 | 8 | QA | E11-01, E11-03 | Doc10 §8 |
| E11-07 | Publicação nas lojas: materiais, textos e revisão | M5 | 5 | App | E11-06, E02-06 | Doc06 §11 |
| E11-08 | Runbook de incidentes, suporte e resposta a pedidos LGPD | M5 | 3 | DevOps | E02-02 | Doc06 §11 |
| E11-09 | Painel de métricas de produto (eventos do Doc 03 §14) | M5 | 5 | API | E00-06 | Doc03 §14; Doc01 §14 |

#### E12 — Sugestões por regras (Fase 2, 84 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E12-01 | Modelos de sugestão: edição, aprovação e imutabilidade no admin | M6 | 5 | Web | E03-03 | Doc09 §3; CAT-07 |
| E12-02 | Revisão profissional dos 6 modelos e da triagem de segurança | M6 | 8 | Conteúdo | E12-01 | Doc09 §10 |
| E12-03 | Motor rules-1.0: triagem, seleção, rotação, tempo e registro | M6 | 13 | API | E12-01, E03-01 | Doc09 §7.4 |
| E12-04 | Testes do motor: reprodutibilidade, bloqueio, restrições e tempo | M6 | 5 | QA | E12-03 | CAT-04…CAT-08 |
| E12-05 | API de sugestões (criar, listar, detalhar, aceitar, descartar) | M6 | 5 | API | E12-03 | CT API-15; Doc07 §3 |
| E12-06 | App: TEL-026/027 assistente e revisão da sugestão | M6 | 8 | App | E12-05 | FL-04; UX-07; CA-04 |
| E12-07 | Textos de justificativa e avisos da sugestão | M6 | 3 | Conteúdo | E12-02 | Doc08 §12; Doc09 §7.4 |
| E12-08 | Catálogo onda 2 (34 exercícios): textos e revisão técnica | M6 | 13 | Conteúdo | E03-11 | Doc09 §8 |
| E12-09 | Mídias da onda 2 — lote A (12 exercícios) | M6 | 8 | Design | E10-07 | Doc09 §8 |
| E12-10 | Mídias da onda 2 — lote B (11 exercícios) | M7 | 8 | Design | E12-09 | Doc09 §8 |
| E12-11 | Mídias da onda 2 — lote C (11 exercícios) | M7 | 8 | Design | E12-10 | Doc09 §8 |

#### E13 — Conforto e evolução avançada (Fase 2, 52 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E13-01 | Evolução por exercício (API e TEL-032) | M7 | 8 | App | E09-02 | TEL-032 |
| E13-02 | Conquistas pessoais sem competição (microcopy revisado) | M7 | 5 | App | E13-01 | D8-04; Doc08 §12 |
| E13-03 | Sync incremental (change_log, tombstones, cursor) | M7 | 13 | API | E08-04 | Doc05 §10.2; D-12 |
| E13-04 | Exercício personalizado: modelo de dados, moderação e interface | M7 | 13 | API | E03-05 | D-06 |
| E13-05 | Notificações opt-in e central de avisos | M7 | 5 | App | E04-05 | Doc02 §11.4; D8-06 |
| E13-06 | Recordes pessoais | M7 | 5 | App | E13-01 | D8-05 |
| E13-07 | Capi animada de celebração | M7 | 3 | Design | E10-03 | Doc08 §9 |

#### E14 — Coach ponta a ponta (Fase 3, 81 pontos)

| ID | História | Marco | Pts | Papel | Depende de | Referências |
|---|---|---|---|---|---|---|
| E14-01 | Profissionais: solicitação e verificação (API e admin) | M8 | 8 | API | E03-03 | RG-022; CT COACH_NOT_VERIFIED |
| E14-02 | Convites, vínculos, escopo e consentimento (API) | M8 | 8 | API | E14-01, E02-01 | CT-81; CT-83 |
| E14-03 | Prescrição do coach: publicar com aceite, aceitar, recusar, retirar (API) | M8 | 8 | API | E14-02, E06-01 | CT-18…CT-21 |
| E14-04 | Autorização de dados do coach com matriz L3 | M8 | 5 | API | E14-02 | CT-81; CT-82; CA-10 |
| E14-05 | App: TEL-028/041 prescrições recebidas, vínculo e escopo | M8 | 8 | App | E14-03 | FL-03; FL-08; UX-14 |
| E14-06 | Portal do coach: login, alunos e convites | M8 | 8 | Web | E14-02 | COA-010; COA-020; COA-021 |
| E14-07 | Portal do coach: editor de prescrição e publicação | M8 | 13 | Web | E14-03 | COA-030; COA-031 |
| E14-08 | Portal do coach: acompanhamento mínimo do aluno | M9 | 8 | Web | E14-04 | COA-050 |
| E14-09 | Revogação: retirar aceites e negar sync atrasado do coach | M8 | 5 | API | E14-03 | CT-23; CT-61 |
| E14-10 | Piloto fechado com coaches (sinalizador de ambiente auditado) | M9 | 5 | DevOps | E14-07 | Doc06 RG-022 |
| E14-11 | Revisão jurídica e regulatória da prescrição por terceiros | M8 | 5 | Jurídico | — | Doc01 §3; Doc06 §11 |


### 4.4 Primeiras histórias sugeridas

Para começar sem esperar decisões externas: **E00-01, E00-02, E00-03, E00-04, E00-05, E00-08** (fundações), **E10-01** (Character Bible), **E03-10** (instruções da onda 1) e **E02-04** (textos legais). As três últimas são trilhas de longa duração e não dependem de código.

## 5. Caminhos críticos, previsão e riscos de prazo

### 5.1 Caminhos críticos (Fase 1)

**Técnico (sequência mais longa de dependências):**

E00-02 (5) → E00-04 (8) → E03-01 (8) → E07-01 (8) → E07-02 (5) → E08-04 (13) → E08-05 (8) → E11-01 (8) → E11-06 (8) → E11-07 (5) = 76 pontos

**Conteúdo e mídia:** `E10-01 (8) → E10-02 (13) → E10-04 (8) → E10-05 (8) → E10-06 (8) → E10-07 (8) → E10-10 (8) = 61 pontos` em uma única trilha de Design, mais a revisão técnica (E03-10/E03-11, 16 pontos) feita por **um profissional ainda não definido**. Essa trilha tende a ser mais longa que o caminho técnico.

**Ações para encurtar:** (a) paralelizar lotes de mídia com mais de uma pessoa ou fornecedor depois que o rig (E10-02) estiver aprovado; (b) reduzir a onda 1 para os 10 exercícios exibidos no beta e completar o resto após o lançamento (a ficha textual cobre a ausência de mídia — Doc 02 AC-10); (c) começar a revisão técnica dos textos antes das mídias.

### 5.2 Fórmula de previsão

1. Medir a **velocidade** (pontos concluídos por ciclo) nos 2–3 primeiros ciclos.
2. **Duração do marco** ≈ pontos restantes ÷ velocidade.
3. Para marcos com dependência externa (M0, M4, M8), somar o **prazo do fornecedor/revisor** em paralelo, não em série, e usar o maior.
4. Incluir reserva proporcional à incerteza (sugestão: 20% de pontos extras em marcos com offline/sync — M3 — e em M4, onde correções do beta são esperadas).
5. Reestimar a cada marco; histórias de 13 pontos são divididas antes de entrar no ciclo.

### 5.3 Riscos principais

| # | Risco | Prob. | Impacto | Mitigação | Gatilho |
|---|---|---|---|---|---|
| R1 | Revisor técnico não definido ou indisponível | Alta | Alto | Nomear no M0; contrato com escopo e volume; reduzir onda 1 (§5.1b) | Sem nome ao fim do M0 |
| R2 | Rig/animação da Capi atrasa ou não atinge fidelidade biomecânica | Média | Alto | Mídia complementar (humano/esquema); lançar com ficha textual; terceirizar lotes | E10-02 sem aprovação no M2 |
| R3 | Complexidade do offline/sync estoura o orçamento | Média | Alto | Escopo restrito (só execução, D-03); testes de caos cedo; reserva de 20% | E08-04 ou E08-08 acima de 1,5× a estimativa |
| R4 | Defeito de perda/duplicação de dados do treino | Baixa | Muito alto | Idempotência, triggers, L4/L5, S1 bloqueia release | Qualquer ocorrência no beta |
| R5 | Rejeição nas lojas (exclusão de conta, dados de saúde) | Média | Médio | E02-03, E02-06 antes do beta; revisar diretrizes vigentes | Rejeição de build de teste |
| R6 | Migration/schema só validados em MariaDB | Média | Médio | Executar em MySQL 8 no M0 (E00-02/E00-03) | Falha no CI MySQL 8 |
| R7 | Prescrição por terceiros sem enquadramento regulatório | Média | Alto | E14-11; piloto fechado; flag auditada | Parecer jurídico adverso |
| R8 | Sugestão inadequada para perfil com restrição | Baixa | Muito alto | Triagem que bloqueia, modelos aprovados, revisão obrigatória pelo usuário (Doc 09 §7.4) | Qualquer sugestão gerada com restrição ativa |
| R9 | Desempenho ruim em Android de entrada (executor, timer, cache de vídeo) | Média | Médio | Orçamentos (§7.6) medidos no M1; vídeo sob demanda | Orçamento estourado no M1/M3 |
| R10 | Vazamento de dados sensíveis em logs ou analytics | Baixa | Muito alto | Lint de logs, revisão E02-05, testes CT-80 | Achado em pentest |
| R11 | Marca CapiFit indisponível | Média | Médio | Verificação no M0; logotipo só final depois | Resultado negativo no INPI |
| R12 | Equipe pequena: dependência de uma pessoa por trilha (App, API, Design) | Média | Alto | Documentação, revisões cruzadas, divisão de histórias | Ausência > 1 ciclo |

## 6. Fluxos críticos de ponta a ponta (E2E)

Roteiros automatizados no app (ferramenta sugerida: Maestro, por suportar Expo sem acoplar ao código) contra um backend de teste com MySQL 8 e fixtures. Cada fluxo cobre critérios existentes.

| ID | Fluxo | Cobre | Fase |
|---|---|---|---|
| F1 | Cadastro → perfil → programa manual com 2 exercícios → ativar → executar → concluir → histórico | CA-01, CA-02, CA-09; AC-01, AC-02, AC-05 | 1 |
| F2 | Treino avulso com exercício adicionado do catálogo | CA-06-12 | 1 |
| F3 | Executar totalmente em modo avião, fechar e reabrir o app, reconectar e sincronizar | CA-07; AC-06, AC-08; UX-03, UX-04 | 1 |
| F4 | Sessão em andamento sobrevive a fechamento e alternância de abas | RN-04; UX-02 | 1 |
| F5 | Editar a ficha depois de uma sessão concluída; histórico intacto | CA-03; AC-07; UX-05 | 1 |
| F6 | Substituir exercício e pausar/retomar durante a sessão | CA-06-10, CA-06-11 | 1 |
| F7 | Excluir a conta com reautenticação | UX-16; CA-06-14 | 1 |
| F8 | Capi desativada e Reduce Motion: concluir uma sessão inteira | CA-11; AC-09; UX-11; UX-18 | 1 |
| F9 | Sugestão com restrição declarada de risco → bloqueada, sem programa | CAT-05 | 2 |
| F10 | Sugestão → editar → ativar → executar | CA-04; UX-07; AC-03 | 2 |
| F11 | Coach publica → aluno aceita (sem ativar) → ativa → executa → coach vê só o escopo autorizado | CA-06; CA-10; AC-04; UX-14 | 3 |
| F12 | Aluno revoga vínculo; coach perde acesso; aceite pendente é retirado | AC-12; UX-15; CT-23 | 3 |

**Roteiros de usabilidade** (Doc 02 §16, 7 tarefas): criar treino com 2 exercícios; gerar sugestão e trocar um exercício; registrar 3 séries, pausar e retomar; achar o peso do treino anterior; identificar autor da versão do coach; usar a demonstração e repetir sem a Capi; executar sem internet. Rodadas: protótipo (E04-07), app antes do beta (E11-05) e durante o beta.

## 7. Plano de testes

### 7.1 Estratégia

Pirâmide de testes com **mais testes baratos e determinísticos na base** e poucos E2E nos fluxos críticos. Regras gerais:

1. **Todo critério de aceite tem pelo menos um teste automatizado** ou uma inspeção documentada (§7.4).
2. **Defeito de perda, duplicação ou vazamento de dados é bloqueador de release** (S1, §7.10).
3. Testes de banco e de concorrência usam **MySQL 8 real**, nunca MariaDB nem mocks.
4. Nenhum teste usa dados pessoais reais; fixtures são sintéticas.
5. O contrato OpenAPI (Doc 07) é verificado em todo PR.

### 7.2 Ambientes e dados

| Ambiente | Uso | Dados |
|---|---|---|
| Local | Desenvolvimento; contêiner com MySQL 8 e PHP 8.2 | Seed do catálogo (Doc 09) + fixtures |
| CI | Testes unitários, integração, contrato e E2E sob demanda | Banco descartável por execução (E00-03) |
| Staging | Demonstrações, beta interno, ensaios de sync, pentest | Dados sintéticos; catálogo revisado |
| Produção | Beta fechado e lançamento | Dados reais; acesso mínimo e auditado |

**Fixtures mínimos** (Doc 07 §5.3): 2 alunos, 1 coach verificado e 1 não verificado, 1 admin, vínculo com escopo variável, programas publicados de cada origem, sessão aberta e encerrada, exercícios publicados e em revisão, 6 modelos de sugestão (rascunho e aprovado).

### 7.3 Camadas, ferramentas e responsáveis

| Camada | O que verifica | Ferramenta sugerida | Roda em | Dono |
|---|---|---|---|---|
| Estática | Estilo, tipos, hex literal, contrato OpenAPI, contraste | PHP-CS/PHPStan, ESLint/TypeScript, `validate-openapi`, `check-contrast` | Todo PR | Dev |
| Unitários API | Serviços, políticas, validadores, motor de sugestão | PHPUnit | Todo PR | API |
| Unitários App | Regras de domínio, filas, conflitos, formatação | Jest | Todo PR | App |
| Integração API | Rotas + MySQL 8, transações, triggers, concorrência (L1–L4) | PHPUnit + banco temporário | Todo PR | API/QA |
| Contrato | Respostas/requisições vs OpenAPI; matriz de autorização (L1–L3, L6) | Validador OpenAPI + gerador por `x-papeis`; diff de versão | Todo PR | API |
| Sync/offline | Cenários de rede ruins (L5) | Suíte dedicada + simulador de rede | Diário/PR de sync | QA |
| E2E mobile | Fluxos F1–F12 | Maestro | Noturno e antes de marco | QA |
| Acessibilidade | Leitor de tela, fonte 200%, contraste, Reduce Motion | Manual (VoiceOver/TalkBack) + automação de rótulos | Antes de M4 e a cada release | QA/Design |
| Desempenho | Orçamentos do §7.6 | Medição em aparelho real + carga na API | M1, M3, M4 | QA/DevOps |
| Segurança | ASVS L1, SAST, dependências, pentest | Scanners em CI + teste externo | CI e antes de M4 | QA |
| Usabilidade | Roteiros do §6 | Sessões moderadas | M1, M4, beta | Design |
| Visual | Tokens e componentes | Revisão de design + capturas de referência | Por componente | Design |

### 7.4 Rastreabilidade dos critérios de aceite

**Doc 01 — `CA-01…CA-12`**

| ID | Verificação | Marco |
|---|---|---|
| CA-01 Criar e ativar ficha | E2E F1 | M2 |
| CA-02 Registro de série e histórico | E2E F1; CT-30…CT-38 | M2 |
| CA-03 Edição não altera sessões passadas | E2E F5; CT-31; CT-15 | M2 |
| CA-04 Sugestão, edição e ativação | E2E F10; CAT-04…CAT-08 | M6 |
| CA-05 Origem visível e rastreável | UX-06; DS-08; inspeção | M2 |
| CA-06 Coach envia, aluno aceita sem perder fichas | E2E F11; CT-18…CT-21 | M8 |
| CA-07 Perda de conexão não elimina registros | E2E F3; testes de caos (L5) | M3 |
| CA-08 Catálogo revisado; vídeo ausente não impede registro | CT-70, CT-71; UX-10 | M4 |
| CA-09 Sessão anterior e histórico do exercício | CT-39; E2E F1 | M2 |
| CA-10 Coach só vê com vínculo e permissão | CT-81, CT-82; matriz L3 | M8 |
| CA-11 Registrar/finalizar sem animações | E2E F8; DS-06 | M4 |
| CA-12 Acessibilidade e reduzir movimento | Auditoria §7.7; DS-07 | M4 |

**Doc 02 — `AC-01…AC-14`**

| ID | Verificação | Marco |
|---|---|---|
| AC-01 | E2E F1 (sem medidas obrigatórias) | M2 |
| AC-02 | E2E F1; CT-11 | M2 |
| AC-03 | E2E F10; CT sugestão | M6 |
| AC-04 | E2E F11 | M8 |
| AC-05 | E2E F1 (previsto × realizado) | M2 |
| AC-06 | E2E F4 | M3 |
| AC-07 | E2E F5; CT-12 | M2 |
| AC-08 | Testes de caos; CT-53…CT-54 | M3 |
| AC-09 | E2E F8 | M4 |
| AC-10 | CT-71; DS-10 | M4 |
| AC-11 | E2E F11; CT-19 | M8 |
| AC-12 | E2E F12; CT-23 | M8 |
| AC-13 | Revisão de estados; UX-04 | M4 |
| AC-14 | Auditoria §7.7 | M4 |

**Doc 03 — `UX-01…UX-18`:** UX-01 E2E de navegação (M2) · UX-02 F4 (M3) · UX-03 F3 (M3) · UX-04 caos + revisão de estados (M3) · UX-05 F5 (M2) · UX-06 inspeção (M2) · UX-07 F10 (M6) · UX-08 CT-19…CT-22 (M8) · UX-09 E2E do timer (M2) · UX-10 CT-71 + simulação de mídia ausente (M3) · UX-11 auditoria §7.7 (M4) · UX-12 auditoria §7.7 (M4) · UX-13 E2E de formulários (M2) · UX-14 F11 (M8) · UX-15 F12 (M8) · UX-16 F7 (M4) · UX-17 E2E do editor (M2) · UX-18 F8 (M4).

**Outros conjuntos:** `CT-*` (Doc 07 §6), `CAT-*` (Doc 09 §9), `DS-*` (Doc 08 §15), `CA-04-*` (Doc 04 §16) e `CA-06-*` (Doc 06 §12) são verificados nas camadas indicadas em cada documento e entram no portão do marco correspondente (§3.3).

### 7.5 Offline e sincronização (foco de risco)

Suíte dedicada (E08-08) com simulador de rede capaz de: cortar a conexão no meio de um lote, reordenar e duplicar requisições, atrasar respostas, devolver 5xx intermitente e alterar o relógio do dispositivo. Casos mínimos: Doc 07 §6.4 (CT-50…CT-62) e Doc 04 §16 (CA-04-09, CA-04-10, CA-04-13). **Invariantes verificados em todo teste:** nenhuma série perdida, nenhuma duplicada, nenhuma conclusão repetida, UUIDs do cliente preservados, estado final do app igual ao do servidor após `push` + snapshot.

### 7.6 Desempenho

> Orçamentos **provisórios** para a primeira medição; não são metas de produto. Metas numéricas serão fixadas após linha de base real (Doc 01 §14; Doc 02 §16).

| Indicador | Orçamento provisório |
|---|---|
| Toque em "concluir série" → feedback visual | ≤ 100 ms |
| Confirmação de gravação local da série | ≤ 300 ms |
| Abrir o executor com treino em cache e sem rede | ≤ 1 s |
| API: leitura / escrita (percentil 95) | ≤ 300 ms / ≤ 500 ms, a confirmar após teste de carga |
| `sync/push` com 50 operações | ≤ 2 s |
| Cache de mídia | Limite configurável (padrão 200 MB), expiração definida |
| Aparelho de referência | Android de entrada (conclusão das histórias). iPhone com 3 gerações: fase posterior à versão comercial (decisão de 23/10/2026, Doc 14 §5.1) |

Medições: M1 (executor básico), M3 (cache e sync) e M4 (completo). Excesso do orçamento abre defeito S2.

### 7.7 Acessibilidade

Auditoria (E11-02) em iOS e Android, antes do beta e a cada release com mudança de UI: VoiceOver e TalkBack nos fluxos F1–F8 (rótulos como "Concluir série 2 de Supino reto", UX-12), fonte do sistema a 200% sem corte (DS-04), contraste de tokens (DS-01, automático), alvos de toque (DS-05), Reduce Motion e Capi desativada (UX-11, UX-18), uso sem áudio (AC-14). Defeitos de acessibilidade que impedem concluir uma série são S1.

### 7.8 Segurança e privacidade

- **ASVS nível 1** como checklist de partida; SAST e verificação de dependências no CI; **pentest externo** antes do M4 (E11-03).
- **Autorização:** matriz L3 gerada do OpenAPI; testes de acesso horizontal (CT-10, CT-81) em todo PR de API.
- **Privacidade:** CT-80 (logs sem senha, token, restrições, SQL); revisão E02-05; verificação de que analytics não carrega dados sensíveis (Doc 03 §14); teste de exportação e exclusão (CT-07, CT-08, CT-84).
- **Segredos:** nenhum segredo no repositório (varredura em CI).
- **Banco:** usuário da aplicação sem permissão de DDL (Doc 06 §5); triggers testados por SQL direto (CT-15).

### 7.9 Matriz de dispositivos

Versões mínimas de SO a fixar conforme a versão do Expo SDK escolhida (E00-08). Cobertura mínima de teste manual por release: **iOS** — um aparelho pequeno e um grande, versão atual e anterior; **Android** — um de entrada (≤ 3 GB de RAM), um intermediário e um grande, duas versões de Android; telas 360×640 dp e com teclado aberto (campos de carga/reps nunca cobertos). Tablet fora do escopo do MVP; orientação retrato.

### 7.10 Gestão de defeitos

| Severidade | Definição | Regra |
|---|---|---|
| **S1** | Perda, duplicação ou vazamento de dados; falha de autorização; impossibilidade de registrar série ou concluir sessão; sugestão gerada apesar de restrição de risco; crash no executor | Bloqueia release; correção imediata |
| **S2** | Função importante degradada com contorno; orçamento de desempenho estourado; falha de acessibilidade em fluxo secundário | Corrigir antes do marco ou aprovar exceção registrada |
| **S3** | Defeito menor sem impacto no treino | Priorizar no backlog |
| **S4** | Cosmético | Backlog |

Defeitos encontrados no beta recebem severidade e referenciam a história e o critério de aceite afetados.

## 8. Beta fechado, portões de release e rollout

### 8.1 Portão de entrada do beta (M4)

- [ ] Todas as histórias da Fase 1 concluídas, exceto mídia da onda 1 restante (se a ficha textual cobrir — §5.1b).
- [ ] CT, CA, AC, UX, DS e CAT aplicáveis passando (§3.3).
- [ ] Auditorias de acessibilidade e segurança sem achados S1; pentest sem vulnerabilidade alta aberta.
- [ ] Checklist de conformidade do Doc 06 §11 completo (exceto itens específicos de coach).
- [ ] Exclusão e exportação de conta funcionando e testadas; política de retenção publicada.
- [ ] Runbook de incidentes e canal de suporte definidos.
- [ ] Backup e restauração testados.
- [ ] Termo de participação do beta e coleta de feedback prontos.

### 8.2 Condução do beta (E11-06)

Grupo pequeno e variado, cobrindo as personas P01 (iniciante), P02 (intermediária) e P05 (admin/curador) do Doc 02. Distribuição por TestFlight e teste interno do Google Play. Coleta: eventos do Doc 03 §14 sem dados pessoais, formulário curto pós-sessão, relatos de falha com identificador de requisição. Triagem semanal por severidade. **Pergunta central:** o usuário consegue treinar sem ajuda e sem perder registros?

### 8.3 Portão de lançamento (M5)

- [ ] Nenhum S1 aberto; S2 com plano aprovado.
- [ ] Taxa de sessões concluídas sem perda ou duplicação **igual a 100%** no beta (Doc 01 §14, confiabilidade offline); meta de estabilidade definida após a linha de base.
- [ ] Aprovação nas lojas; textos sem promessa de resultado.
- [ ] Painel de métricas e alertas ativos (E11-09).
- [ ] Plano de reversão: versão anterior do app disponível, API compatível (`/v1` estável) e migrations reversíveis ou compatíveis.

### 8.4 Rollout

Liberação gradual (percentual crescente) com monitoramento de erros e de sincronização; pausa automática por critério de S1; comunicação clara de indisponibilidade com os dados preservados (Doc 02 §11.1).

## 9. Definição de Pronto e de Feito

**Pronta para entrar no ciclo (DoR):** objetivo e critério de aceite escritos e ligados a IDs de teste; dependências concluídas ou combinadas; tamanho ≤ 8 (13 só se dividida em seguida); contrato (OpenAPI) ou tela (Doc 03/08) definidos; dados e fixtures conhecidos; impacto em privacidade avaliado quando toca dados do usuário.

**Feita (DoD):**

1. Código revisado por outra pessoa e integrado conforme o protocolo de branches/PR da equipe.
2. Testes automatizados da camada correspondente passando; contrato validado quando houver mudança de API.
3. Estados de interface completos (carregando, vazio, erro, offline, permissão) e textos em `pt-BR` no catálogo de strings.
4. Acessibilidade verificada (rótulos, alvo de toque, fonte ampliada, contraste via tokens).
5. Sem hex literal, sem dado sensível em log ou evento de analytics.
6. Migrations versionadas e reversíveis ou compatíveis.
7. Documentos afetados atualizados (revisão versionada; Doc 05 §governança).
8. Demonstrada ao responsável do produto.

## 10. Pendências

1. **Equipe e capacidade:** informar tamanho, papéis e disponibilidade para converter pontos em calendário (§5.2).
2. Nomear **revisor técnico**, **responsável pela Capi** e **responsável jurídico** (M0).
3. Definir versões mínimas de iOS/Android a partir do Expo SDK.
4. Escolher ferramenta de gestão para importar `10_backlog.csv`.
5. Dividir as 9 histórias de 13 pontos antes do ciclo em que entram.
6. Definir a política de feature flags para rotas de Fase 2/3 já presentes no contrato (`501` até a liberação).
7. Estabelecer metas numéricas de produto (ativação, retenção, estabilidade) após a linha de base do beta.
8. Revisar o orçamento de desempenho (§7.6) com a primeira medição real.

## 11. Encerramento da série de documentos

Com este documento, a série planejada (01–10) está completa. O próximo passo natural é **executar o marco M0**. Qualquer divergência encontrada na implementação deve gerar revisão versionada dos documentos afetados, com testes atualizados (governança do Doc 05).

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 21/10/2026 | 128 histórias (746 pontos) em 15 épicos e 10 marcos, critérios de saída, caminhos críticos, riscos, fluxos E2E F1–F12, plano de testes e portões de release |
