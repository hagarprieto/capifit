# CapiFit — Documento 11
## Checklist de Execução do Marco M0 (Fundações e dependências externas)

**Versão:** 1.0  
**Data:** 22/10/2026  
**Status:** Plano de execução — nada aqui foi executado além do que está marcado como *verificado*  
**Artefatos preparados:** `tools/db/apply-schema.ps1`, `.github/workflows/ci.yml`, `.gitignore`  
**Base:** Documento 10 §3.3 (portão do M0), histórias E00-01…E00-08 e E10-01 (44 pontos)

---

## 0. Como usar

- Marque `[x]` ao concluir e anote a **evidência** (link, saída de comando, captura) no registro do §12.
- Cada bloco termina com **"Pronto quando"**; só então a história correspondente do `10_backlog.csv` vira "feita".
- Os blocos **A** (pessoas e decisões) e **H** (trilhas longas) **não dependem de código** e devem começar já, em paralelo aos blocos técnicos B–G.
- Itens marcados **[você]** exigem ação sua (conta, download, decisão); o resto pode ser feito pelo time técnico ou por mim, se pedir.
- Comandos são para **PowerShell 7** no Windows, a partir de `C:\xampp\htdocs\capifit`.

## 1. Ponto de partida (verificado em 22/10/2026)

| Item | Situação | Implicação |
|---|---|---|
| PHP | 8.2.12 no XAMPP — **o `php` do PATH é o 7.4.32 (`C:\tools\php74`); use `C:\xampp\php\php.exe`**, `mysqli`, `pdo_mysql`, `mbstring`, `openssl` e `intl` ativos; `argon2id` disponível | Atende o Doc 05 (PHP 8.2+; `password_hash`) |
| Composer | 2.6.5, mas o atalho `composer` usa o PHP 7.4 do PATH | Rodar com o PHP 8.2: `C:\xampp\php\php.exe C:\ProgramData\ComposerSetup\bin\composer.phar ...` (ver `backend/README.md`) |
| Node / npm | 24.19.0 / 11.17.0 | Validadores e app Expo |
| Git | 2.44 instalado, mas **a pasta ainda não é um repositório** | Fazer E00-01 |
| Banco | XAMPP traz **MariaDB 10.4.32**; **MySQL 8 não está instalado** | Instalar MySQL 8 em paralelo (D-01), porta 3307 |
| Docker | **Não instalado** | O Doc 10 previa contêiner; usar instalação nativa (§5) ou instalar Docker |
| `htdocs` | Compartilhado com outros projetos; `docs/` e `tools/` ficam acessíveis pelo Apache | Servir **só** `backend/public` (§6) |
| Já pronto | OpenAPI + validador (`tools/contract`), tokens + verificador de contraste (`tools/design`), SQL (04, 06, 09), seed, **script de aplicação do schema**, CI e `.gitignore` | Reduz o trabalho do M0 |

## 2. Mapa do M0

```text
A  Pessoas e decisões ───────────────────────────────────────────────┐ (paralelo, longa duração)
H  Trilhas longas: Capi (E10-01), textos técnicos, textos legais ─────┤
B  E00-01 Repositório ─► C  E00-02 Ambiente ─► C2 E00-03 Migrations ──┤
                          │                                           ├─► Portão M0 (§11)
                          ├─► D  E00-04 API esqueleto ─► F E00-06/07 ─┤
                          ├─► E  E00-05 CI ───────────────────────────┤
                          └─► G  E00-08 App esqueleto ────────────────┘
```

Pontos: E00-01 (2) · E00-02 (5) · E00-03 (3) · E00-04 (8) · E00-05 (5) · E00-06 (5) · E00-07 (3) · E00-08 (5) · E10-01 (8) = **44**.

## 3. Bloco A — Pessoas, contas e decisões **[você]**

Nenhum código depende destes itens, mas **os prazos externos costumam ser os mais longos** (Doc 10 §5.1).

- [ ] **Revisor técnico** (profissional de Educação Física habilitado): nome, escopo (instruções, cuidados, alternativas, mídia, modelos), volume estimado e forma de contratação. *Bloqueia M2 em diante.*
- [ ] **Responsável pela Capi** (model sheet, rig, vídeos): pessoa ou fornecedor, formato de entrega e licenças/cessão de direitos (Doc 08 §10.3).
- [ ] **Responsável jurídico/LGPD**: termos de uso, política de privacidade, retenção, e parecer sobre prescrição por terceiros (Fase 3).
- [ ] **Marca**: pesquisa de "CapiFit" no INPI, domínio e nomes nas lojas (R11). Se negativo, o nome muda antes do logotipo final.
- [ ] **Contas de desenvolvedor** Apple e Google (necessárias para beta no M4): iniciar agora, pois podem exigir verificação de identidade ou empresa e levar tempo.
- [ ] **Hospedagem e storage** para staging: decidir provedor de API/banco e de objetos (mídia). *Pode esperar o fim do M0, mas bloqueia o staging do M1.*
- [ ] **Equipe e capacidade**: quem faz API, App, Web, Design, QA; disponibilidade por pessoa (necessário para converter pontos em calendário — Doc 10 §5.2).
- [ ] **Ferramenta de gestão**: escolher e importar `docs/10_backlog.csv`.
- [ ] **Confirmar decisões do Doc 06**: D-09 (somente maiores de 18 anos) continua ajustável; D-01, D-02, D-05 já confirmadas.

**Pronto quando:** revisor, responsável pela Capi e responsável jurídico estão nomeados; contas de desenvolvedor solicitadas; resultado da pesquisa de marca registrado.

## 4. Bloco B — E00-01 · Repositório (2 pts)

- [ ] Inicializar o repositório e fazer o commit inicial:

```powershell
git init -b main
git add .
git status   # conferir: sem .env, sem node_modules
git commit -m "chore: documentação 01-11, contrato OpenAPI, SQL e ferramentas de validação"
```

- [ ] Criar o repositório remoto privado e configurar `origin`.
- [ ] Aplicar o **protocolo de GitHub da equipe** (nome de branch, Conventional Commits, modelo de PR, checklist de revisão). *Posso aplicá-lo com a skill de protocolo, se você pedir.*
- [ ] Proteger a `main`: PR obrigatório, 1 aprovação, CI verde antes do merge.
- [ ] Criar `CODEOWNERS` e um modelo de PR que cite a história (`E00-xx`) e os critérios de aceite.
- [ ] Definir a estrutura de pastas (monorepo):

```text
backend/   API PHP            mobile/   app Expo
web/       painéis admin e coach (Fase 3 para coach)
docs/      documentos 01–11   design/   Capi, mídia, ícones (sem binários pesados)
tools/     contrato, design, banco   .github/  CI
```

**Pronto quando:** `git log` mostra o commit inicial, a `main` está protegida e o primeiro PR de teste exige o CI.

## 5. Bloco C — E00-02 e E00-03 · Ambiente com MySQL 8 e migrations (8 pts)

### 5.1 Instalar MySQL 8 em paralelo ao XAMPP **[você]**

Mantenha a MariaDB do XAMPP intacta (outros projetos em `htdocs` dependem dela).

- [ ] Baixar o **MySQL Community Server 8.0 (ZIP)** na página oficial de downloads do MySQL e extrair em `C:\mysql8`.
- [ ] Criar `C:\mysql8\my.ini`:

```ini
[mysqld]
basedir=C:/mysql8
datadir=C:/mysql8/data
port=3307
character-set-server=utf8mb4
collation-server=utf8mb4_general_ci
```

- [ ] Inicializar e iniciar (o `--initialize-insecure` deixa o `root` sem senha **apenas até o próximo passo**):

```powershell
C:\mysql8\bin\mysqld.exe --defaults-file=C:\mysql8\my.ini --initialize-insecure --console
C:\mysql8\bin\mysqld.exe --defaults-file=C:\mysql8\my.ini --console
```

- [ ] Em outro terminal, definir a senha do `root` (gere uma senha forte e **guarde em gerenciador de senhas**, nunca no repositório) e criar os usuários de menor privilégio:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY '<senha-forte>';
CREATE USER 'capifit_migrator'@'localhost' IDENTIFIED BY '<outra-senha>';
GRANT ALL PRIVILEGES ON capifit.* TO 'capifit_migrator'@'localhost';
CREATE USER 'capifit_app'@'localhost' IDENTIFIED BY '<terceira-senha>';
GRANT SELECT, INSERT, UPDATE, DELETE ON capifit.* TO 'capifit_app'@'localhost';
```

`capifit_app` **não** recebe `ALTER`, `DROP`, `TRIGGER` nem `CREATE` (Doc 06 §5).

- [ ] (Opcional) Instalar como serviço do Windows: `C:\mysql8\bin\mysqld.exe --install CapiFitMySQL8 --defaults-file=C:\mysql8\my.ini`.

### 5.2 Aplicar o schema e o seed (E00-03)

- [ ] Com o MySQL 8 no ar:

```powershell
$env:MYSQL_PWD = '<senha-do-migrator>'
./tools/db/apply-schema.ps1 -Port 3307 -User capifit_migrator -Mysql 'C:\mysql8\bin\mysql.exe' -WithSeed -Recreate
```

O script aplica `04 → 06 (migration 001) → 09 (migration 002) → seed`, para na primeira falha e confere **36 tabelas, 16 triggers, 54 exercícios, 6 modelos e nenhum exercício fora de `rascunho`**. `-Recreate` só é aceito em servidor local. *O script foi testado numa MariaDB temporária (sintaxe e contagens); ainda não em MySQL 8.*

- [ ] **Se algum script falhar no MySQL 8** (ponto de atenção: `MODIFY ... NULL` em colunas com FK; índice único sobre coluna gerada virtual; FKs compostas): registre a mensagem no §12, ajuste o arquivo SQL correspondente (ainda não há banco em produção, então a edição é segura) e atualize o Doc 06 §5.
- [ ] Rodar os quatro testes de integridade que usei na validação (Doc 06 §5): ficha em versão publicada rejeitada; segunda sessão aberta do mesmo aluno rejeitada; sessão programada sem ficha rejeitada; vínculo vigente duplicado rejeitado (e permitido após revogação). **Transformá-los em testes automatizados no E00-04.**
- [ ] Testar o login do usuário `capifit_app` (apenas DML) e confirmar que `DROP TABLE` e `DROP TRIGGER` são negados.
- [ ] Documentar o procedimento no `README` do repositório.

**Pronto quando:** o script termina com "Schema aplicado e conferido" em MySQL 8 e o `capifit_app` não consegue alterar o schema.

## 6. Bloco D — E00-04 · Esqueleto da API (8 pts)

Estrutura do Doc 05 §2.1 (controller → service → repository, `mysqli` com prepared statements).

- [ ] `composer init` em `backend/` (PHP `^8.2`) e dependências propostas *(confirmar antes de instalar)*: roteador `nikic/fast-route`, `firebase/php-jwt`, `vlucas/phpdotenv`, `monolog/monolog`; desenvolvimento: `phpunit/phpunit`, `phpstan/phpstan`, `squizlabs/php_codesniffer`, `league/openapi-psr7-validator` (L1/L2 do Doc 07).
- [ ] `public/index.php` como único ponto de entrada; **nenhum** arquivo fora de `public/` deve ser acessível pela web.
- [ ] Servir via host virtual do Apache apontando **somente** para `backend/public` (porta/nome próprio), para não expor `docs/`, SQL, `.env` ou `tools/`. Não alterar os projetos existentes em `htdocs`.
- [ ] Middlewares na ordem do Doc 05 §14: request-id → HTTPS/CORS → rate limiting → autenticação → autorização → validação.
- [ ] **Envelope** `{data, meta}` e **erros** `Error` com os códigos de `ErrorCode` (Doc 07); nunca vazar stack trace, SQL ou token.
- [ ] Conexão `mysqli` com `utf8mb4`, `MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT`, helper de transação (begin/commit/rollback).
- [ ] Tradução dos erros dos triggers (`VERSION_IMMUTABLE`, `SESSION_CLOSED`, `MODEL_IMMUTABLE`) em respostas HTTP 409.
- [ ] `GET /health` (público, sem dados sensíveis, **fora do OpenAPI**) para monitoramento.
- [ ] `.env.example` com as variáveis (banco, segredo JWT, origens CORS) e **sem valores reais**.
- [ ] Testes: rota inexistente → 404 JSON no envelope de erro; JSON inválido → 400; resposta de erro nunca contém SQL; `request_id` presente; testes dos 4 cenários de integridade do §5.2 via banco real.

**Andamento (22/10/2026):** esqueleto criado em `backend/` (PSR-7/PSR-15, roteador, middlewares, envelope e erros do contrato, conexão mysqli, logs com redação, `/health`); 30 testes e PHPStan nível 6 passam localmente (integração contra MariaDB temporária); job `api-php` adicionado ao CI. **CI verde no GitHub com MySQL 8.0.46 em 22/10/2026** (PHPUnit com os 7 testes de integração e PHPStan). O primeiro CI falhou porque `apply-schema.ps1` usava `cmd /c` (só Windows); o script foi corrigido para rodar também no Linux.

**Pronto quando:** `composer test` passa no CI com MySQL 8, `GET /health` responde, e qualquer erro devolve o envelope documentado.

## 7. Bloco E — E00-05 · Pipeline de CI (5 pts)

Já preparado: `.github/workflows/ci.yml` com dois jobs — **contrato e design** (validador OpenAPI e contraste dos tokens) e **banco em MySQL 8** (aplica o schema e o seed). *Ainda não foi executado no GitHub.*

- [ ] Fazer o primeiro push e corrigir o que o GitHub apontar.
- [ ] Marcar os dois jobs como **checks obrigatórios** da `main`.
- [ ] Acrescentar quando existirem: lint e testes PHP (job com MySQL 8), lint/TypeScript do app, varredura de segredos, SAST e verificação de dependências.
- [ ] Acrescentar o **diff de contrato (L6)** entre o PR e a última tag de release (Doc 07 §5.2) assim que houver a primeira release.

**Pronto quando:** um PR que quebre o OpenAPI, um contraste de token ou uma migration **falha** no CI, e um PR correto passa.

## 8. Bloco F — E00-06 e E00-07 · Observabilidade, segredos e backup (8 pts)

- [ ] **Logs** estruturados (JSON) com `request_id`; **lista de campos proibidos** nos logs: senha, tokens, `restricoes`, corpo de login, SQL com valores (CT-80). Teste automatizado que falha se um log contiver esses campos.
- [ ] Métricas mínimas por endpoint: contagem, latência (p50/p95), taxa de erro; contagem de sync (aplicada/conflito/rejeitada).
- [ ] Alertas básicos: taxa de 5xx, falha de sync, API fora do ar.
- [ ] **Segredos** em variáveis de ambiente/gerenciador; `.env` ignorado pelo Git (já em `.gitignore`); rotação documentada.
- [ ] **Backup** do banco (dump agendado) e do storage; **teste de restauração** em ambiente separado, com a restauração cronometrada e registrada.

**Andamento (22/10/2026):** detalhes e verificações no **Documento 12**. Feito: log de acesso por requisição sem dados pessoais, redação de campos sensíveis, resumo de métricas por rota, backup e restauração com SHA-256 e conferência de contagens (simulado local OK), varredura de segredos no CI e política de rotação. **Falta:** alertas (dependem da hospedagem), simulado de restauração em staging com MySQL 8, retenção/RPO/RTO e criptografia dos backups.

**Pronto quando:** um erro provocado de propósito aparece no log com `request_id` e sem dado sensível, e uma restauração de backup foi feita e conferida.

## 9. Bloco G — E00-08 · Esqueleto do app Expo (5 pts)

- [ ] **Fixar a versão do Expo SDK** (a estável no momento) e registrar a versão mínima de iOS e Android que ela suporta — fecha a pendência do Doc 10 §10.3.
- [ ] Criar o app em `mobile/` (`npx create-expo-app`, TypeScript) com Expo Router e a estrutura do Doc 03 §13.1.
- [ ] Bibliotecas propostas *(confirmar)*: `expo-secure-store` (tokens), `expo-sqlite` (offline), `expo-notifications` (timer), `@tanstack/react-query` (cache remoto), `zustand` (estado local), `react-hook-form` + `zod` (formulários), `openapi-typescript` (tipos, E00-09).
- [ ] **Tema por tokens:** script que lê `docs/08_design_tokens.json` e gera o tema (claro/escuro), tipografia e espaçamentos; fonte Inter embarcada.
- [ ] **Lint** que proíbe hex literal fora do tema (DS-02) e texto fixo fora do catálogo de strings (`pt-BR`).
- [ ] Tela de verificação (a tela inicial do M0) que mostra o tema claro/escuro e a fonte aumentada a 200%, para validar tokens no aparelho.
- [ ] Rodar em um Android de entrada e em um iPhone (ou simulador) e **registrar** o tempo de abertura (linha de base para o Doc 10 §7.6).

**Andamento (22/10/2026):** `mobile/` criado com Expo SDK 58 e Expo Router (rotas em `src/app/`); tema claro/escuro gerado dos tokens, fonte Inter, catálogo `pt-BR`, lint que reprova hex e texto fixo, tela de verificação do tema; 17 testes, TypeScript, lint e `expo-doctor` passam e o bundle Android compila; job `app-mobile` no CI. **Falta:** abrir em Android e iOS reais e registrar o tempo de abertura; `CI` verde no GitHub. Detalhes e pendências em `mobile/README.md`.

**Pronto quando:** o app abre nos dois sistemas, alterna os temas, o lint reprova um hex literal e o CI executa o lint/TypeScript do app.

## 10. Bloco H — Trilhas longas que começam no M0

| História | O que fazer agora | Dono |
|---|---|---|
| **E10-01** Character Bible v1 (8 pts) | Briefing para o responsável: usar o Doc 08 §10 (identidade, proporções, expressões, deliverables) e a prancha em `img/`; incluir as correções D8-01…D8-11 no briefing | Design |
| **E03-10** Instruções da onda 1 (iniciar) | Redigir, com o revisor, as instruções, cuidados e alternativas dos 20 exercícios da onda 1 usando o modelo do Doc 09 §4.2 | Conteúdo |
| **E02-04** Textos legais (iniciar) | Primeiro rascunho de termos e política (menção a 18+, dados de treino e restrições, compartilhamento com coach, retenção e exclusão) | Jurídico |
| **E04-07** Protótipo navegável | Montar protótipo das telas TEL-010, 012, 020–025 para a primeira rodada de usabilidade (M1) | Design |

**Pronto quando (M0):** briefing do E10-01 entregue ao responsável; primeiros textos de E03-10 e E02-04 em revisão.

## 11. Portão de saída do M0

Conforme o Doc 10 §3.3. Preencha com evidências.

- [ ] **CI verde** na `main`: validador OpenAPI, contraste dos tokens, schema em MySQL 8 e lint/testes disponíveis.
- [ ] **MySQL 8** com migrations 04 → 06 → 09 e seed aplicados e conferidos (36 tabelas, 16 triggers, 54 exercícios, 6 modelos em rascunho).
- [ ] `capifit_app` sem permissão de alterar schema (testado).
- [ ] API responde `/health`, devolve envelope e erros do contrato, sem vazar detalhes.
- [ ] App Expo abre em Android e iOS, com temas por tokens e lint de hex literal.
- [ ] Backup restaurado com sucesso em ambiente separado.
- [ ] **Revisor técnico, responsável pela Capi e responsável jurídico nomeados.**
- [ ] Contas de desenvolvedor Apple/Google solicitadas; pesquisa de marca registrada.
- [ ] Versão do Expo SDK e mínimos de iOS/Android registrados; ferramenta de gestão com o backlog importado.
- [ ] Doc 06 §5 atualizado com o resultado da validação em MySQL 8 (e, se houver falha, a correção).

## 12. Registro de execução (preencher)

| Item | Quem | Evidência | Observações |
|---|---|---|---|
| E00-01 Repositório | | | |
| E00-02 MySQL 8 instalado | | | |
| E00-03 Schema/seed em MySQL 8 | | | Falhas e correções: |
| E00-04 API esqueleto | | | |
| E00-05 CI no GitHub | | | |
| E00-06 Logs e métricas | | | |
| E00-07 Segredos e restauração | | | Tempo de restauração: |
| E00-08 App esqueleto | | | Tempo de abertura (Android/iOS): |
| E10-01 Briefing da Capi | | | |
| Revisor / Capi / Jurídico nomeados | | | |
| Contas Apple/Google | | | |
| Pesquisa de marca | | | |

## 13. Se travar

| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro 1832 ou 1833 ao aplicar a migration 001 | `MODIFY ... NULL` em coluna com FK (comportamento do MySQL 8) | Dropar e recriar a FK em torno do `MODIFY` no próprio script e reexecutar com `-Recreate` |
| Erro em índice único sobre coluna gerada | Ordem ou sintaxe de coluna virtual no MySQL 8 | Separar `ADD COLUMN` e `ADD UNIQUE KEY` (já estão separados nos pontos conhecidos); revisar a mensagem |
| `apply-schema.ps1` diz "Falha ao aplicar" sem detalhe | Erro do cliente `mysql` | Rodar o arquivo manualmente com `mysql < arquivo.sql` para ver a mensagem |
| Porta 3307 ocupada | Outro serviço | Trocar `port` no `my.ini` e usar `-Port` no script |
| CI de banco falha no `apply-schema` | Imagem `mysql:8.0` ainda iniciando ou senha divergente | Conferir o *health check* e o `MYSQL_PWD` do job |
| Sem revisor até o fim do M0 | R1 do Doc 10 | Reduzir a onda 1 (Doc 10 §5.1b) e seguir com ficha textual |

## 14. Depois do M0: o que o M1 pede

Fatia vertical: **login → catálogo → treino avulso → série registrada** (Doc 10 §3.2). Histórias (14): E00-09, E01-01, E01-02, E01-04, E01-06, E01-07, E03-01, E03-02, E04-01, E04-02, E04-03, E04-07, E07-01 e E07-05. Com a equipe e a velocidade informadas, converto os pontos em calendário (Doc 10 §5.2).

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 22/10/2026 | Checklist do M0 com estado verificado do ambiente, blocos A–H, script de schema, CI inicial, portão de saída e plano de contingência |
