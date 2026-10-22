# CapiFit — Documento 12
## Operação: Logs, Métricas, Backup e Restauração, Segredos

**Versão:** 1.0  
**Data:** 22/10/2026  
**Status:** Proposta para validação — o que foi **executado** está marcado como verificado; o resto depende de decisões e da hospedagem  
**Artefatos:** `tools/db/backup.ps1`, `tools/db/restore.ps1`, `tools/ops/summarize-access-log.js`, `tools/security/scan-secrets.js`, `backend/src/Http/Middleware/AccessLogMiddleware.php`  
**Base:** Documento 11 (blocos C e F), Documento 05 §12 e §16, Documento 06 §11, Documento 10 (E00-06, E00-07)

---

## 1. Objetivo e limites

Definir como a API produz **logs seguros**, como deles saem **métricas**, como o banco é **copiado e restaurado** e como os **segredos** são tratados. Valores como frequência de backup, retenção, RPO/RTO e limites de alerta são **propostas**: dependem do provedor de hospedagem (ainda não escolhido) e do apetite de risco do produto.

## 2. Logs

### 2.1 Regras

- Uma linha **JSON** por evento, em `stderr` (o processo da hospedagem coleta e encaminha).
- **Proibido** em qualquer log: senha, tokens (acesso, renovação, recuperação), cabeçalho `Authorization`, cookies, `restricoes` (dado de saúde), corpo de login, SQL com valores, **IP** do cliente, e-mail, nome e caminho real com identificadores.
- A lista de chaves sensíveis é aplicada por um processador (`RedactingProcessor`) em **qualquer profundidade**. Ele é rede de segurança: a regra é não colocar o dado no log em primeiro lugar.
- Erros inesperados registram **classe da exceção, código, arquivo e linha** — nunca a mensagem (exceções de banco podem trazer valores).

### 2.2 Log de acesso (uma linha por requisição)

```json
{"message":"request","context":{"request_id":"req_…","method":"GET","route":"/me/sessoes/{uuid}","status":200,"duration_ms":4.12,"response_bytes":1830},"level_name":"INFO","channel":"capifit","datetime":"…"}
```

| Campo | Observação |
|---|---|
| `request_id` | Mesmo valor do cabeçalho `X-Request-Id` e do `error.request_id` das respostas de erro |
| `route` | **Padrão** da rota, nunca o caminho real; rota inexistente vira `unmatched` (baixa cardinalidade e sem UUID em log) |
| `status`, `duration_ms`, `response_bytes` | Base das métricas |
| nível | `info`; `warning` quando `status >= 500` |

Não há campo de usuário, IP, query string, cabeçalhos ou corpo. Quando for preciso investigar um caso de um usuário, usa-se o `request_id` que ele informa.

**Verificado:** 5 testes automatizados (`AccessLogTest`) comprovam que token em query string, `Authorization`, IP, corpo e UUID do caminho **não** aparecem no log; o conjunto de campos é exatamente o da tabela acima. Também verificado com o servidor real: nenhuma das linhas gerou vazamento.

### 2.3 Cabeçalhos de resposta

`X-Request-Id` em toda resposta; `X-Powered-By` removido; `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` nas respostas JSON.

## 3. Métricas e alertas

### 3.1 Fonte das métricas

Enquanto não houver provedor de métricas, elas **saem do log de acesso**. O script `tools/ops/summarize-access-log.js` lê as linhas (as que não forem do log de acesso são ignoradas) e mostra, por rota, requisições, 4xx, 5xx, taxa de 5xx, p50 e p95:

```bash
node tools/ops/summarize-access-log.js < arquivo.log
```

Exemplo verificado com o servidor local (7 requisições): `GET /health` 5 req, p50 0,63 ms, p95 1,03 ms; requisições de rotas inexistentes agrupadas como `unmatched`.

Métricas de **sincronização** (aplicadas, conflitos e rejeitadas por lote) entram com a história E08-04, como eventos no mesmo formato (`message: "sync"`), também sem dados pessoais.

### 3.2 Alertas propostos

*A ativação depende da hospedagem/monitoramento (pendência); os limites são pontos de partida a calibrar com a linha de base do beta.*

| Alerta | Condição proposta | Gravidade |
|---|---|---|
| API fora do ar | `GET /health` sem `200` por 3 verificações seguidas (1 min) | Crítico |
| Taxa de erro | `5xx` acima de 2% das requisições em 5 min | Crítico |
| Latência | p95 de qualquer rota crítica acima de 1 s por 10 min (rotas críticas: executor, `sync/push`) | Alto |
| Conflitos de sincronização | Pico de `conflito`/`rejeitada` acima de 5% dos itens em 15 min | Alto |
| Falhas de autenticação | Aumento anormal de `401` em `/auth/*` | Médio |
| Backup | Backup diário ausente ou com SHA-256 divergente | Crítico |
| Disco/banco | Espaço livre abaixo de 20% | Alto |

## 4. Backup e restauração

### 4.1 Política proposta (a decidir)

| Item | Proposta inicial |
|---|---|
| Frequência | Diário, mais um backup antes de toda migration |
| Retenção | 14 diários + 8 semanais; pelo menos 1 cópia **fora** do servidor do banco |
| RPO / RTO | A definir com o responsável. Referência medida hoje: banco de teste com 36 tabelas e 54 exercícios — backup em ~2 s e restauração em ~2 s; **não** extrapolar para produção |
| Criptografia | Os backups contêm dados pessoais e de saúde: guardar **cifrados** em repouso e em trânsito (ferramenta a escolher, por exemplo `age`) |
| Armazenamento | Fora do repositório (o script recusa pasta dentro dele) |
| Mídia (vídeos) | Fica em storage de objetos com versionamento próprio; não entra no dump |

### 4.2 Backup

```powershell
$env:MYSQL_PWD = '<senha>'
./tools/db/backup.ps1 -Port 3307 -User capifit_migrator -OutDir D:\backups\capifit
```

Gera `capifit_AAAAMMDD_HHMMSS.sql.gz` (consistente, com rotinas, triggers, eventos e UTF-8), o `.sha256` e o `.contagens.json` (linhas por tabela e total de triggers, para conferir a restauração).

### 4.3 Restauração (simulado)

```powershell
./tools/db/restore.ps1 -BackupFile D:\backups\capifit\capifit_….sql.gz -TargetDatabase capifit_restore -Port 3307
```

O script: confere o **SHA-256**; restaura em um banco **diferente do original** (recusa o banco de origem); remove os `DEFINER` do dump (para restaurar sem privilégio SUPER); confere **tabelas, triggers e linhas por tabela**; informa o tempo total. Só recria o banco de destino em servidor local.

### 4.4 Simulado executado (local, 22/10/2026)

Executado numa MariaDB temporária (não em ambiente de staging), com dados sintéticos (usuários com acento, programa publicado, sessão):

| Verificação | Resultado |
|---|---|
| Backup | 14,4 KB em 2,1 s |
| Restauração em `capifit_restore` | 36 tabelas, 16 triggers e todas as contagens conferidas, em 2,1 s |
| Acentos | Preservados ("Ana Conceição", "Peito e tríceps") |
| Trigger de imutabilidade no banco restaurado | Continua funcionando (`VERSION_IMMUTABLE`) |
| Restaurar sobre o banco de origem | Recusado |
| Backup adulterado (um byte alterado) | Recusado pelo SHA-256 |
| Gravar backup dentro do repositório | Recusado, sem criar a pasta |

**Pendente (para fechar E00-07):** repetir o simulado em MySQL 8 de **staging** com restauração cronometrada, depois de definidos hospedagem e armazenamento externo; decidir criptografia, retenção e RPO/RTO.

### 4.5 Limitações conhecidas

O dump é lido inteiro em memória na restauração (adequado ao tamanho atual; trocar por streaming se o banco crescer); `mysqldump` lógico é lento em bancos grandes (avaliar backup físico/snapshot do provedor); backups lógicos não preservam usuários e privilégios do servidor (recriados por `apply-schema.ps1 -AppUser`).

## 5. Segredos

### 5.1 Regras

1. **Nunca** versionar segredos nem `.env` (só `.env.example`, sem valores). O `.gitignore` bloqueia `.env`, `*.pem` e `*.key`.
2. Em produção, segredos vêm de variáveis de ambiente ou do gerenciador do provedor — não de arquivo no servidor sempre que possível.
3. Senhas de banco: **uma por usuário** (`capifit_app` somente DML; `capifit_migrator` com DDL só para migrations e backups) e **distintas por ambiente**.
4. Senhas e tokens não passam por argumento de linha de comando (aparecem na lista de processos): os scripts usam variáveis de ambiente e stdin.
5. Segredos do CI ficam em *GitHub Secrets*. Os valores `ci_only_*` do workflow são de bancos descartáveis criados em cada execução e não protegem nada real.

### 5.2 Rotação (procedimento)

| Segredo | Quando rotacionar | Como |
|---|---|---|
| Senha do `capifit_app` | A cada 90 dias, saída de pessoa com acesso, suspeita de vazamento | Gerar a senha nova → `ALTER USER 'capifit_app'@'<host>' IDENTIFIED BY '<nova>'` com o `capifit_migrator` → atualizar o segredo da API → reiniciar. (Não use `apply-schema.ps1` para isso: ele reaplica o schema e só serve para criar bancos novos.) |
| Senha do `capifit_migrator` / `root` | Idem | `ALTER USER` → atualizar gerenciador |
| Segredo de assinatura do JWT (E01-02) | A cada 180 dias ou suspeita | Aceitar chave nova e antiga por uma janela igual à validade do token (15 min) e então remover a antiga; refresh tokens são opacos e não dependem dela |
| Tokens de CI | Saída de pessoa ou suspeita | Revogar no GitHub e criar outro |

### 5.3 Varredura automática

`node tools/security/scan-secrets.js` examina os arquivos versionados e reprova: chaves privadas, chaves AWS/Google, tokens do GitHub e do Slack, JWT, credenciais atribuídas em texto e qualquer `.env` versionado. Roda em todo push no CI. Valores de teste inofensivos ficam em uma lista de exceções (`ALLOW_VALUES`) que exige justificativa em revisão.

**Verificado:** a varredura passa no repositório e **reprova** um arquivo de teste com senha atribuída, chave AWS, chave privada e `.env`. Ela é uma rede de segurança simples, **não** substitui o *secret scanning* do GitHub nem o histórico limpo.

### 5.4 Ações no GitHub (repositório privado) — dependem de você

- [ ] Ativar **Dependabot alerts** e atualizações de segurança (Settings → Code security).
- [ ] Verificar se o *secret scanning* está disponível para o plano do repositório e ativá-lo.
- [ ] Ativar autenticação em dois fatores na conta.

## 6. Usuários e permissões do banco

| Usuário | Privilégios | Uso |
|---|---|---|
| `capifit_app` | `SELECT, INSERT, UPDATE, DELETE` no banco `capifit` | A API em execução |
| `capifit_migrator` | Todos no banco `capifit` | Migrations, backup, restauração |

Criado por `apply-schema.ps1 -AppUser capifit_app -AppHost <host>` com a senha em `APP_DB_PASSWORD`.

**Verificado (CI e local):** `AppUserPrivilegesTest` conecta como `capifit_app` e comprova que ele lê e grava dados, que **não** consegue criar, alterar, apagar ou truncar tabela, criar ou apagar trigger, criar índice, criar usuário nem conceder privilégio, e que os triggers de imutabilidade continuam valendo para ele. O teste aborta antes de qualquer DDL se o usuário parecer administrativo.

## 7. Critérios de aceite

| ID | Critério | Verificação |
|---|---|---|
| OPS-01 | Todo evento de log é JSON e as chaves sensíveis são mascaradas em qualquer profundidade | `SupportTest`, `ErrorHandlerTest` |
| OPS-02 | O log de acesso não contém query string, cabeçalhos, corpo, IP nem caminho real | `AccessLogTest` |
| OPS-03 | Erro 500 devolve só o envelope genérico com `request_id`, e o log registra classe/código sem mensagem | `ErrorHandlerTest` |
| OPS-04 | Um backup restaurado em outro banco tem as mesmas tabelas, triggers e linhas | `restore.ps1` (simulado) |
| OPS-05 | Backup adulterado é recusado | `restore.ps1` (simulado) |
| OPS-06 | Nenhum segredo ou `.env` é versionado | `scan-secrets.js` no CI |
| OPS-07 | O usuário da aplicação não altera o schema | `AppUserPrivilegesTest` no CI |
| OPS-08 | Simulado de restauração em staging (MySQL 8) com tempo registrado | **Pendente** |
| OPS-09 | Alertas da §3.2 ativos | **Pendente** (hospedagem) |

## 8. Pendências

1. Escolher hospedagem (API, banco, objetos) — destrava alertas, backup externo e staging.
2. Definir retenção, RPO/RTO e a ferramenta de criptografia dos backups.
3. Fazer o simulado de restauração em staging com MySQL 8.
4. Ativar Dependabot, secret scanning (se disponível no plano) e 2FA no GitHub.
5. Escolher o coletor de logs/métricas e implementar os alertas da §3.2.
6. Decidir a política de retenção dos próprios logs (sugestão: 30 dias de acesso, 90 de erros, sem dados pessoais).
7. Escolher o provedor de **e-mail transacional** (recuperação de senha e verificação já funcionam e são testadas; sem provedor, `NullMailer` não envia e deixa o aviso `mail.not_sent`). Considerar SPF/DKIM/DMARC no domínio.
8. Agendar **uma vez por dia** `php bin/cleanup.php` no cron/agendador da hospedagem (E00-10). O comando já existe e é testado: remove janelas de limite de taxa com mais de 2 dias, chaves de idempotência com mais de 7, tokens de ação e sessões de login vencidos há mais de 7 e 30 dias, e imprime só contagens. Falta definir onde agendar.

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 22/10/2026 | Logs sem dados pessoais e log de acesso, métricas por rota, alertas propostos, backup/restauração com simulado local, política de segredos e rotação, varredura de segredos, usuários de banco com teste de privilégios |
