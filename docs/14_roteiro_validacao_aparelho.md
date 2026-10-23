# CapiFit — Documento 14: Roteiro de validação do app em aparelho

**Versão:** 2.3 (23/10/2026) · **Aplica-se a:** histórias E01-06, E01-07, E07-05, E07-06, E07-09, E06-03, E06-04, E06-05, E06-08, E07-04 (e metas D-14), E05-03, E04-03, E04-04, E09-03, E08-01, E08-02, E08-03, E08-05, E08-06, E08-07, E08-09, E07-08, E07-11, E06-06, E07-07 e E07-10
**Por que existe:** os testes automáticos (Jest, tipos, lint) já passam no CI, mas só um aparelho de verdade mostra teclado, rolagem, tema, notificação, vibração, leitor de tela e desempenho. Este roteiro transforma "falta validar em aparelho" em uma lista que você executa e marca.

## 0. Como usar

1. Faça a **preparação (§1)** uma vez. Leva cerca de 30 minutos na primeira vez.
2. Execute os roteiros **R0 a R12 (§2)** num **Android** e num **iPhone** (veja a matriz mínima em §1.4). Para cada passo, confira o **Esperado**.
3. Marque cada teste no **quadro de resultados (§3)**: **P** (passou), **F** (falhou), **N/A** (não se aplica neste aparelho) e, se falhou, anote o que viu (§4).
4. Uma história só vira **concluída** quando todos os testes **obrigatórios (🔴)** dela passam em **pelo menos um Android e um iPhone** (§5). Os desejáveis (🟡) viram pendência, não bloqueio.

**Regra de ouro:** se algo parecer estranho mas não estiver no roteiro, anote mesmo assim. Um roteiro nunca prevê tudo.

---

## 1. Preparação

### 1.1 Banco de dados local

Pré-requisito: PowerShell 7 (`pwsh`) e o MySQL/MariaDB do XAMPP ligado (painel do XAMPP → *Start* em MySQL; escuta em `127.0.0.1:3306`).

> ⚠ O comando abaixo **apaga e recria** o banco `capifit` desse servidor. Se já houver um `capifit` com dados que você queira manter, faça backup antes (`tools/db/backup.ps1`). O MariaDB do XAMPP serve para desenvolvimento e teste; o alvo oficial de produção continua sendo MySQL 8.

```powershell
cd C:\xampp\htdocs\capifit
$env:APP_DB_PASSWORD = 'escolha-uma-senha-local'   # senha do usuário da API; guarde para o .env
pwsh -File tools/db/apply-schema.ps1 -Port 3306 -Mysql 'C:\xampp\mysql\bin\mysql.exe' -WithSeed -Recreate -AppUser capifit_app -AppHost localhost
```

Esperado no final: `Tabelas: 36 (esperado 36)`, `triggers: 16`, `Exercícios: 54` e `Schema aplicado e conferido.`

### 1.2 Exercícios para o teste

O seed entra tudo como **rascunho** (conteúdo provisório, sem revisão profissional), e o app só lista exercícios **publicados**. Só no seu banco local de teste, publique alguns:

```powershell
# Por UUID (e não por nome): nomes com acento se perdem na linha de comando do Windows
& 'C:\xampp\mysql\bin\mysql.exe' --no-defaults -u root capifit -e "UPDATE exercicios SET status='publicado' WHERE nome IN ('Supino reto com barra','Supino reto com halteres','Puxada na frente','Remada baixa na polia','Barra fixa assistida') OR uuid IN ('497c80cb-5599-5658-b36c-9dd0c5c7ea05','eb249861-9a9e-5107-9ca0-e7dce2f64ec8');"
```

Isso dá exercícios das quatro modalidades: carga e repetições (supino, puxada, remada), peso corporal (flexão), assistido (barra fixa assistida) e **tempo** (prancha). **Nunca** faça isso em um banco de produção.

### 1.3 API

1. Copie `backend\.env.example` para `backend\.env` e preencha:
   - `DB_PORT=3306`, `DB_USER=capifit_app`, `DB_PASSWORD=` (a senha do passo 1.1);
   - `JWT_SECRET=` (gere com `& 'C:\xampp\php\php.exe' -r "echo bin2hex(random_bytes(32));"`);
   - `APP_ENV=local` (os e-mails ficam em arquivos, ver R1);
   - `RATE_LIMIT_ENABLED=0` para não travar nas repetições de login (o limite tem teste automático; reative depois).
2. Suba o servidor **acessível pela rede** (não só no 127.0.0.1):

```powershell
cd C:\xampp\htdocs\capifit\backend
& 'C:\xampp\php\php.exe' -S 0.0.0.0:8080 -t public public/index.php
```

3. No Windows, permita o PHP na rede **privada** quando o firewall perguntar. Descubra o IP do PC (`ipconfig`, "Endereço IPv4", ex.: `192.168.0.15`).
4. **Teste de pré-voo:** no navegador do celular (na mesma Wi-Fi) abra `http://192.168.0.15:8080/health`. Deve aparecer um JSON de saúde. Se não abrir, o app também não vai conseguir: resolva antes (Wi-Fi diferente, firewall, VPN).

### 1.4 App e aparelhos

1. Em `mobile\`, copie `.env.example` para `.env` e ajuste `EXPO_PUBLIC_API_URL=http://192.168.0.15:8080` (emulador Android: `http://10.0.2.2:8080`). Variáveis `EXPO_PUBLIC_*` ficam visíveis dentro do app: nunca coloque segredo ali.
2. `npm install` (se for a primeira vez) e `npm start`. Escaneie o QR code com o **Expo Go** (Android/iPhone) ou use um **build de desenvolvimento**.
3. Quando mudar o `.env` do app, reinicie com `npm start -- --clear`.

**Atalho com cabo USB (Android):** com a *Depuração USB* ligada (Configurações → Opções do desenvolvedor) e o aparelho autorizado (`adb devices` lista o aparelho como `device`), o celular enxerga o PC sem depender de Wi-Fi nem de firewall:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:8080 tcp:8080   # a API do PC passa a ser "localhost:8080" no celular
& $adb reverse tcp:8081 tcp:8081   # o servidor do app (Metro)
```

Com isso, use `EXPO_PUBLIC_API_URL=http://localhost:8080` no `mobile\.env` e, em `mobile\`, `npm run android` (abre o Expo Go no aparelho conectado). Refaça os dois `adb reverse` sempre que reconectar o cabo.

**Expo Go ou build de desenvolvimento?** O Expo Go basta para quase tudo. Duas exceções:
- **Link do e-mail de recuperação** (`capifit://…`): no Expo Go o esquema é outro (veja R1). Em build de desenvolvimento o esquema `capifit://` funciona de verdade.
- **Notificação com a tela bloqueada** (R3): as notificações *locais* funcionam no Expo Go, mas o comportamento fiel (canal, som, entrega em segundo plano) só se confirma em build de desenvolvimento. Faça R3 nos dois, se possível.

**Matriz mínima** (preencha no quadro §3 o que usou):

| Aparelho | SO e versão | Tela | Observação |
|---|---|---|---|
| Android de entrada (🔴) | ex.: Android 12 | pequena | o pior caso de desempenho e de espaço |
| Android recente (🟡) | ex.: Android 14 | média | notificações exigem permissão no 13+ |
| iPhone (🔴) | ex.: iOS 17 | qualquer | Keychain, háptico e VoiceOver |

### 1.5 Contas e dados de teste

- Use e-mails fictícios do tipo `teste1@exemplo.invalid` (sem caixa real; o e-mail "enviado" fica em arquivo).
- Senha de teste com 10+ caracteres, ex.: `senha-de-teste-123`.
- Para ver o e-mail de recuperação: pasta `backend\storage\mail\` (um `.txt` por e-mail, o link está no corpo).

### 1.6 Antes de começar cada aparelho

- Bateria acima de 30 %, brilho médio, **sem** economia de energia (ela adia notificações e mascara problemas).
- Anote versão do SO e o horário. Se possível, grave a tela (ajuda a descrever defeitos).

---

## 2. Roteiros

Legenda: 🔴 obrigatório · 🟡 desejável. **Reprova se** descreve o que conta como falha.

### R0 — Base do app (vale para todas as telas)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-00.1 🔴 | Abra o app do zero (fechado). Conte o tempo até a tela de entrada aparecer. | Splash curto e a tela de boas-vindas. **Anote o tempo**: é a linha de base de abertura (o Doc 10 §7.6 ainda não fixa meta numérica; ela será definida com estas medições). | Tela branca/preta prolongada, travamento ou fechamento sozinho. |
| V-00.2 🔴 | Alterne o aparelho entre **tema claro e escuro** (configuração do sistema) com o app aberto e depois reaberto. | O app acompanha; texto legível, nada some, nenhum fundo "estoura". | Texto invisível, contraste ruim, cores trocadas pela metade. |
| V-00.3 🔴 | Aumente a **fonte do sistema ao máximo** (ou 200 %). Percorra boas-vindas, entrar, cadastrar. | Textos crescem, **nenhum é cortado**, os botões continuam inteiros e tocáveis, a rolagem alcança o fim. | Texto cortado, botão fora da tela ou sobreposto. |
| V-00.4 🟡 | Gire o aparelho. | Fica em retrato (orientação travada). | O app gira e quebra o layout. |
| V-00.5 🟡 | Use o app por 10 min em rede ruim (afaste-se do roteador). | Mensagens de erro claras, nada de tela congelada. | Spinner infinito sem saída. |

### R1 — Entrar, cadastrar e sessão (E01-06, E01-07)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-01.1 🔴 | Boas-vindas → **Criar conta**. Toque em Criar conta **sem preencher nada**. | Erros por campo, em texto ("Erro: …"), e **nada é enviado**. | Envia assim mesmo ou erro só em cor. |
| V-01.2 🔴 | Preencha nome, e-mail **inválido** (`abc`), senha de 5 caracteres, sem marcar os aceites. | Cada erro aparece no campo certo (e-mail, senha mínima de 10, aceite, 18+). | Algum erro faltando ou no campo errado. |
| V-01.3 🔴 | Observe os **teclados**: e-mail abre teclado de e-mail (sem maiúscula automática); senha oculta com **Mostrar/Ocultar**. | Correto nos dois campos; o gerenciador de senhas do aparelho oferece salvar (se ativo). | Teclado errado, senha visível sem pedir. |
| V-01.4 🔴 | Cadastre com dados válidos (marque os dois aceites). | Entra na área logada: Início com "Olá, <nome>! Bora treinar?" e as quatro abas embaixo. | Erro inesperado ou volta para a tela de entrada. |
| V-01.5 🔴 | Aba **Perfil** → **Sair**. Entre com a senha **errada**, depois com e-mail inexistente. | Nos dois casos a **mesma** mensagem: "E-mail ou senha incorretos." | Mensagens diferentes (revelam se o e-mail existe). |
| V-01.6 🔴 | Entre com a senha certa. Feche o app **deslizando para fora** e reabra. | Abre **direto** na área logada, sem pedir login (sessão restaurada). | Pede login de novo, ou mostra a tela de entrada por um instante antes. |
| V-01.7 🔴 | Ative o **modo avião**, feche e reabra o app. | Abre logado, com o indicador "Offline — salvo neste dispositivo" e o aviso "Sem conexão. Seus registros ficam neste dispositivo e sincronizam depois." | Trava, ou desloga por falta de rede. |
| V-01.8 🔴 | **Recuperar senha**: Esqueci minha senha → e-mail cadastrado → Enviar link. Repita com um e-mail que **não existe**. | **A mesma** mensagem nos dois casos ("Se existir uma conta…"). | Mensagens diferentes. |
| V-01.9 🔴 | Abra `backend\storage\mail\` e copie o `token=` do e-mail mais novo. Abra o link de redefinição (veja abaixo) e defina uma nova senha. Entre com a nova. | Senha alterada; a antiga deixa de funcionar. | Link não abre o app ou erro inesperado. |
| V-01.10 🔴 | Abra o **mesmo link de novo** (token já usado). | "Link inválido ou expirado. Peça um novo link." | Aceita de novo. |
| V-01.11 🟡 | Com `ACCESS_TOKEN_TTL=60` no `.env` da API (reinicie-a), entre, espere 2 min e navegue (Início, Meus treinos). | Continua funcionando: o app renova a sessão sozinho. | Pede login ou mostra erro. |

**Como abrir o link de redefinição:**
- *Build de desenvolvimento*: Android `adb shell am start -a android.intent.action.VIEW -d "capifit://redefinir-senha?token=COLE_O_TOKEN"`; iPhone: cole `capifit://redefinir-senha?token=…` no Safari.
- *Expo Go*: o esquema é o do Expo. Cole no navegador do celular `exp://192.168.0.15:8081/--/redefinir-senha?token=COLE_O_TOKEN` (troque pelo IP e porta mostrados no `npm start`).

### R2 — Executor de treino (E07-05)

Pré-requisito: logado, API no ar, exercícios publicados (§1.2).

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-02.1 🔴 | Início → **Iniciar treino avulso**. | Abre o executor com o estado vazio "Nenhum exercício neste treino". | Erro ou tela em branco. |
| V-02.2 🔴 | **Adicionar exercício** → busque `supino` → toque em "Supino reto com barra". | Volta ao executor com **3 séries** vazias e o exercício no topo. A busca responde em ~1 s. | Lista vazia sem motivo (confira §1.2), travamento. |
| V-02.3 🔴 | Na série 1, digite carga `40` e reps `10`; toque em **Concluir**. Depois a série 2 com `42,5` (**vírgula**) e `8`. | O botão mostra progresso na hora e a série vira "OK" (anote o tempo até o OK: esta versão grava no servidor; o orçamento de ≤ 300 ms do Doc 10 §7.6 é da versão com gravação local, E08). A seguinte já vem com os valores da anterior em cor mais apagada (sugestão). A vírgula é aceita. | Teclado sem decimal, vírgula recusada, valor perdido, nenhum sinal de que o toque foi recebido. |
| V-02.4 🔴 | Toque em **Concluir** com reps vazio. | Erro "Informe as repetições…", nada registrado. | Registra série incompleta. |
| V-02.5 🔴 | **Corrigir** a série 1: mude as reps para `11` e conclua de novo. | Registra o valor novo; não recomeça o descanso. | Duplica a série ou perde o valor. |
| V-02.6 🔴 | **+ série**, depois **+ exercício** (Prancha isométrica). Vá com **Próximo/Anterior**. | A prancha pede **tempo em segundos** (não carga e reps). Navegação mantém os valores. | Campo errado para a prancha, perda de dados ao navegar. |
| V-02.7 🔴 | **Modo avião** → conclua uma série (treino já aberto). Depois desligue o modo avião. | A série **é concluída normalmente** e o indicador mostra "Offline — salvo neste dispositivo". Ao voltar a rede o indicador passa por "Pendente" e termina em "Sincronizado" (detalhes em R10). | Erro ao concluir, perde o que digitou, ou registra duas vezes. |
| V-02.8 🔴 | **Finalizar treino** com séries pendentes. Cancele, depois confirme. | O diálogo diz quantas séries ficaram pendentes; Cancelar não faz nada; Finalizar abre o resumo. | Finaliza sem perguntar. |
| V-02.9 🔴 | Inicie **outro** treino avulso e adicione o mesmo supino. | As séries já vêm sugeridas com o que você fez no treino anterior, e aparece "Última vez: 40 kg · …". | Sugestão em branco ou errada. |
| V-02.10 🔴 | Com um treino aberto, volte ao Início. | Aparece o cartão **TREINO EM ANDAMENTO** com "N de M séries concluídas" e o botão **Continuar treino**; "Iniciar treino avulso" some. | Permite iniciar um segundo treino aberto. |
| V-02.11 🔴 | Use **só uma mão** (polegar) para registrar 3 séries seguidas. | Alcança os botões; alvos de toque confortáveis (sem tocar errado). | Botões pequenos demais ou fora do alcance. |
| V-02.12 🟡 | Registre uma série de **peso corporal** (flexão) e uma **assistida** (barra fixa assistida). | Peso corporal: só reps (carga opcional); assistida: reps e carga de assistência. | Campo obrigatório indevido. |

### R2c — Rótulos de carga e unilaterais (E07-10)

Pré-requisito: exercícios publicados de convenções diferentes (§1.2): barra (total), halteres (por halter), máquina/polia (máquina), peso corporal (kg extra), assistido (assistência) e um unilateral.

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-02c.1 🔴 | Abra, no executor, um exercício de **halteres**. | Sob o nome aparece "Carga em kg por halter"; com TalkBack/VoiceOver o campo é lido como "Carga em kg por halter, série 1 de …". | Rótulo "kg" simples, ou legenda ausente. |
| V-02c.2 🔴 | Um exercício **unilateral** (ex.: remada unilateral com halter). | A legenda inclui "Repetições por lado" e o campo de repetições é lido como "Repetições por lado…". | Sem a indicação de lado. |
| V-02c.3 🔴 | Barra livre, máquina/polia, peso corporal e assistido, um de cada. | "kg (total)" é só implícito (sem legenda se for o padrão) ou aparece como "kg (total)"; máquina: "kg (máquina)"; peso corporal: "kg extra"; assistido: "kg de assistência". | Rótulo trocado entre exercícios. |
| V-02c.4 🔴 | Conclua uma série de halter unilateral e leia o botão e o resumo ao finalizar. | O botão fala "…20 kg por halter, 10 repetições por lado"; o resumo/registros mostram "Série 1: 20 kg por halter × 10 por lado". | Resumo sem unidade ou sem "por lado". |
| V-02c.5 🟡 | Fonte 200 %. | A legenda quebra em linhas sem cortar o texto. | Legenda cortada. |

### R2b — Substituir e acrescentar exercício (E07-07)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-02b.1 🔴 | Treino aberto com um exercício de 3 séries: conclua a 1ª. Toque em **Substituir exercício** e escolha outro. | Volta ao treino: o exercício original ficou com a 1ª série concluída, e o **novo** aparece logo depois com as 2 séries que faltavam (vazias). A lista mostra os dois. | A série concluída some, ou as pendentes ficam no original. |
| V-02b.2 🔴 | Conclua uma série no exercício novo e finalize; abra o resumo. | O resumo conta as séries dos dois exercícios; a Evolução/histórico mostra o treino uma única vez. | Contagem errada, ou exercício duplicado. |
| V-02b.3 🔴 | Na escolha do substituto, toque em **Detalhes** de um candidato e volte. | Abre a explicação sem trocar nada. | Troca sem querer. |
| V-02b.4 🔴 | Tente trocar pelo **mesmo** exercício. | Recusa com mensagem; nada muda. | Duplica o exercício. |
| V-02b.5 🟡 | Abra o substituto e troque de novo o já substituído. | Funciona; o exercício previsto no início é preservado (visto no servidor/histórico). | Perde o vínculo com o previsto. |
| V-02b.6 🟡 | Treino aberto com rede: **abra a busca**, corte a rede (avião) e escolha o exercício. | Se a troca/adição não completar, o aviso é claro e o treino permanece intacto; se completar, entra na fila e sincroniza depois. | Perde o treino. |

### R3 — Descanso (E07-06)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-03.1 🔴 | Conclua uma série com "Iniciar o descanso ao concluir uma série" marcado. | O cartão **Descanso** mostra `01:30` descendo. Você ainda consegue editar outra série. | Não inicia, ou bloqueia a tela. |
| V-03.2 🔴 | **Pausar** → espere 10 s → **Retomar**. | Congela no valor; ao retomar, continua dali. | Continua descendo pausado. |
| V-03.3 🔴 | **+15 s** e **−15 s**. **Pular**. | O tempo muda de 15 em 15 s; Pular volta ao estado "Iniciar descanso". | Valor errado ou não cancela. |
| V-03.4 🔴 | Inicie um descanso de 90 s e **deixe chegar a zero** com o app aberto. | Aparece "Descanso terminou…" e o aparelho **vibra uma vez** (se tiver vibração e ela estiver ligada). | Sem aviso, ou vibra repetidamente. |
| V-03.5 🔴 | **Permissão de notificação**: no primeiro descanso do app, o sistema pergunta. Permita. | A pergunta aparece **uma vez**, no momento em que o descanso começa (não ao abrir o app). | Pergunta ao abrir o app, ou várias vezes. |
| V-03.6 🔴 | Inicie um descanso, **bloqueie a tela** e espere o fim. | A **notificação "Descanso terminou"** chega na hora certa (±5 s). | Não chega, ou chega muito atrasada. |
| V-03.7 🔴 | Inicie um descanso, **vá para outro app** por 2 min, volte. | O descanso aparece **terminado** (o tempo andou fora do app). | Mostra tempo errado ou reinicia. |
| V-03.8 🔴 | Inicie um descanso e **Pule**/saia do treino. Espere o tempo original passar. | **Nenhuma** notificação aparece depois. | Notifica um descanso já cancelado. |
| V-03.9 🔴 | Negue a permissão de notificação (Configurações do app) e faça um descanso. | O descanso funciona normalmente dentro do app, sem erro. | Erro ou travamento. |
| V-03.10 🟡 | Desmarque "Iniciar o descanso ao concluir uma série" e conclua outra série. | Não inicia sozinho; o botão manual funciona. | Inicia mesmo assim. |

### R4 — Resumo da sessão (E07-09)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-04.1 🔴 | Faça um treino com **supino** (3 séries criadas; conclua 2: `40×10` e `42,5×8`) e **prancha** (3 séries criadas; conclua 1 de 45 s). Deixe as outras 3 pendentes e finalize. | "Treino concluído!"; **Séries concluídas: 3 de 6**; **Exercícios executados: 2**; **Volume: 740 kg** (`40×10 = 400` mais `42,5×8 = 340`; a prancha não entra no volume). | Números diferentes dos seus cálculos. |
| V-04.2 🔴 | Leia a linha pequena sob o volume. | Explica "carga × repetições… sem aquecimento… não é uma nota do treino". | Sem explicação do cálculo. |
| V-04.3 🔴 | **Ver registros** / **Ocultar registros**. | Lista as séries feitas, por exercício; as pendentes não aparecem. | Mostra séries não feitas. |
| V-04.4 🔴 | **Voltar ao início**; depois use o botão voltar do sistema. | Não volta para o resumo. O Início mostra "Iniciar treino avulso" de novo e a semana já conta este treino. | Volta ao resumo ou ao executor. |
| V-04.5 🟡 | Finalize um treino só de peso corporal. | Sem linha de volume. | Mostra "Volume: 0 kg". |

### R5 — Meus treinos e editor de programa (E06-03, E06-04, E06-05)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-05.1 🔴 | Aba **Treinos** (conta nova). | Aba Ativo vazia com "Nenhum programa ativo" e **Criar programa**. As abas mostram contagem. | Erro ou tela vazia sem orientação. |
| V-05.2 🔴 | **Criar programa**: sem nome → erro; depois "Hipertrofia 4x". | Cria e abre o detalhe; o programa aparece em **Rascunhos (1)** com a origem "Criado por você" (símbolo + texto). | Cria duplicado ou sem origem visível. |
| V-05.3 🔴 | Detalhe → **Editar programa**. **+ Ficha** duas vezes. Renomeie a primeira para "Peito e tríceps". | Aparecem "Treino A"/"Treino B"; o aviso muda para **Alterações não salvas**. | Aviso não muda. |
| V-05.4 🔴 | Na ficha: **+ Exercício** → Supino reto com barra; **+ Exercício** → Prancha isométrica. | Resumos legíveis: `3 × 8–12 · descanso 1:30` e `3 × 45 s · descanso 1:30`. | Resumo vazio ou errado. |
| V-05.5 🔴 | **Configurar** o supino: 4 séries, aquecimento, reps `6` a `8`, carga `60,5`, RIR `2`, descanso `120`. Aplicar. | Prévia e resumo: `4 × 6–8 + aquecimento · descanso 2:00`. | Resumo não reflete o formulário. |
| V-05.6 🔴 | Configurar com valores inválidos: mínimo `12` e máximo `8`; RIR `15`; carga `abc`. Aplicar. | Erros em cada campo; **continua na tela**; nada é aplicado. | Aplica valor inválido. |
| V-05.7 🔴 | **Subir/Descer** exercícios e fichas; **Remover** (confirma antes) e **Duplicar** uma ficha. | A ordem muda; remover pede confirmação; a cópia aparece como "… (cópia)". | Remove sem perguntar. |
| V-05.8 🔴 | **Salvar rascunho**. Feche o app, reabra, Meus treinos → o programa → Editar. | O que você montou **está lá**. | Perdeu dados salvos. |
| V-05.9 🔴 | Faça uma alteração e toque em **Voltar** sem salvar. | Pergunta "Sair sem salvar?"; "Sair sem salvar" descarta, Cancelar volta. | Sai sem avisar e perde. |
| V-05.10 🔴 | **Publicar versão** (com todas as fichas com exercício). Confirme. | Publica e volta ao detalhe ("Versão 1 · publicada"); aparece em **Ativo** (publicados). Texto do diálogo diz que **não ativa**. | Publica ficha vazia, ou ativa sozinho. |
| V-05.11 🔴 | Tente publicar com uma ficha **sem exercício**. | Recusa com a mensagem "cada ficha precisa de pelo menos um exercício". | Publica. |
| V-05.12 🔴 | Programa publicado → **Editar programa** de novo. | Abre uma **nova versão em rascunho** (a publicada continua intacta). | Edita a versão publicada. |
| V-05.13 🟡 | **Conflito**: abra o editor, e em outro lugar altere o programa (outro aparelho ou `curl` no PUT da estrutura), depois salve no primeiro. | Aviso de que foi alterado em outro lugar + botão **Recarregar**; nada é sobrescrito. | Sobrescreve em silêncio. |
| V-05.14 🟡 | Modo avião → **Salvar rascunho**. | Aviso de falta de conexão; o rascunho continua na tela; salva ao voltar a rede. | Perde as alterações. |
| V-05.15 🟡 | Compare dois programas de origens diferentes (só "Criado por você" é possível sem coach). | Rótulo e símbolo legíveis nos dois temas. | Origem só por cor. |

> Programas **do coach** e **sugeridos pelo app** não têm como ser criados nesta fase (sem tela de coach nem motor); a regra "coach não edita" tem teste automático e será validada em aparelho quando houver como gerar um.

### R6 — Acessibilidade transversal

Ative **TalkBack** (Android: Configurações → Acessibilidade) ou **VoiceOver** (iPhone: Ajustes → Acessibilidade). Navegue com deslizes.

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-06.1 🔴 | Percorra **Entrar** e **Cadastrar**. | Cada campo é lido com seu rótulo; botões como "botão"; erros são anunciados. | Campo "sem nome", erro mudo. |
| V-06.2 🔴 | No executor, ouça uma série. | O botão diz "Concluir série 2 de Supino reto: 40 kg, 10 repetições"; depois de concluída, "Série 2 de Supino reto concluída: …". | Rótulos genéricos ("Concluir" repetido sem contexto). |
| V-06.3 🔴 | Descanso rodando com o leitor ligado. | Avisa o tempo a cada ~15 s (não a cada segundo) e permite focar o relógio para ler o valor exato. | Anuncia todo segundo, ou nada. |
| V-06.4 🔴 | Meus treinos: foque um cartão de programa. | Lê a **origem antes do título** ("Criado por você. Hipertrofia 4x…"). Abas anunciam "selecionada". | Origem não é lida. |
| V-06.5 🟡 | Fonte 200 % no executor e no editor. | Layout aguenta; nada cortado; botões acessíveis. | Cortes, sobreposição. |
| V-06.6 🟡 | Teste de contraste a olho nu, ao sol/brilho baixo, nos dois temas. | Texto secundário e valores sugeridos ainda legíveis. | Valor sugerido ilegível. |

### R7 — Início e abas (E05-03, E04-03, E04-04)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-07.1 🔴 | Logado, olhe a barra inferior e toque em cada aba. | Quatro abas com **texto sempre visível**: Início, Treinos, Evolução, Perfil. A ativa se destaca (negrito, cor e traço) e cada uma abre uma tela com conteúdo. | Aba sem texto, ativa indistinguível, ou aba que não abre. |
| V-07.2 🔴 | Conta **sem programa ativo**: abra o Início. | "Você ainda não tem um programa ativo", **Criar programa** e **Iniciar treino avulso**; "Sua semana" com 7 dias (Seg a Dom), o de hoje com anel; "0 treinos" e "0 min"; texto explicando que a semana conta ao terminar o primeiro treino. | Tela vazia, ou número sem unidade. |
| V-07.3 🔴 | Com **programa ativo** e nenhum treino feito: Início. | Cartão **PROGRAMA ATIVO** com a origem ("Criado por você"), título, "Próximo: Treino A", "N exercícios", **Iniciar Treino A** e **Ver a ficha**. | Próximo errado, ou sem origem. |
| V-07.4 🔴 | Conclua o Treino A e volte ao Início. | Passa a mostrar **"Próximo: Treino B"** (a ficha seguinte; depois da última volta à primeira). O dia de hoje fica **preenchido** na semana, "Treinos na semana: 1", o tempo e "Última sessão: dd/mm · N min". | Rotação errada, ou dia não marcado. |
| V-07.5 🔴 | Com treino em andamento, troque de aba (volte do executor e vá a Treinos, Evolução, Perfil). | Em **todas** as abas aparece o botão **Voltar ao treino** acima da barra; ele leva ao executor. No Início também há o cartão TREINO EM ANDAMENTO. | Botão sumindo em alguma aba, ou levando a outro treino. |
| V-07.6 🟡 | Digite carga e repetições numa série **sem concluir**, volte ao Início e use **Voltar ao treino**. | As séries **já concluídas continuam concluídas**. Anote o que acontece com o valor digitado e não concluído (esperado hoje: volta à sugestão; o UX-02 pede retorno "ao ponto exato", então isto é uma observação para decidirmos). | Série concluída perdida. |
| V-07.7 🔴 | Android: use o botão/gesto de **voltar** dentro das abas, e confira a barra com **navegação por gestos** e com botões. | Voltar sai do app ou volta à aba inicial de forma previsível; a barra **não fica por trás** da barra de gestos nem com folga estranha. | Barra cortada ou sobreposta. |
| V-07.8 🔴 | Aba **Perfil**. | Nome da conta, **Verificação do tema** e **Sair**. | Falta algum deles. |
| V-07.9 🔴 | Leitor de tela no Início: percorra a semana. | Cada dia é lido com o estado ("Terça: treino concluído", "Quinta (hoje): sem treino"); os números dizem a unidade ("Tempo de treino na semana: 54 min"). | Dia lido só como "círculo"/"✓". |
| V-07.10 🟡 | Fonte 200 % e tema claro/escuro no Início e nas abas. | Nada cortado; barra legível; indicador de sincronização legível. | Corte ou texto invisível. |

### R8 — Evolução e histórico (E09-03)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-08.1 🔴 | Conta **sem treino concluído**: aba Evolução. | Indicadores zerados com unidade e o estado "Nenhum treino concluído ainda"; nada de erro. | Erro, ou espaço vazio sem explicação. |
| V-08.2 🔴 | Faça 2 ou 3 treinos com valores conhecidos (anote carga × repetições) e abra a Evolução (4 semanas). | **Treinos**, **Tempo de treino**, **Séries** e **Volume** conferem com a sua conta (volume = soma carga × repetições, sem aquecimento). A semana atual aparece com a quantidade certa. | Número diferente do calculado. |
| V-08.3 🔴 | Troque para **12 semanas** e volte a **4 semanas**. | O período muda, a lista de semanas aumenta e os números continuam coerentes. | Número que diminui ao ampliar o período. |
| V-08.4 🔴 | Leia a explicação sob o volume. | Diz que é um número de acompanhamento, **não uma nota do treino**. Não há meta, ranking nem comparação. | Texto punitivo ou comparativo. |
| V-08.5 🔴 | Histórico: confira a ordem e toque numa sessão. | Mais recente primeiro, com título, data, duração e nº de séries; tocar abre o **resumo** daquela sessão com os registros. | Ordem errada, ou abre outra sessão. |
| V-08.6 🟡 | Com mais de 20 treinos (pode semear no banco de teste), vá ao fim da lista. | Botão **Carregar mais** traz as próximas sem repetir. | Repetição ou lista que trava. |
| V-08.7 🔴 | **Modo avião** → abra a Evolução. | Aviso "Não foi possível carregar a evolução agora…" e **Tentar de novo**; ao religar a rede funciona. | Spinner infinito, ou tela quebrada. |
| V-08.8 🔴 | Leitor de tela: percorra as semanas e o histórico. | "Semana de 19/10: 3 treinos"; cada sessão é um botão lido com nome, data, duração e séries. | Barras sem leitura. |

### R9 — Programa ativo, ficha e metas (E06-08, E07-04, D-14)

Pré-requisito: um programa **publicado** com pelo menos duas fichas, em que um exercício tenha meta (ex.: supino 8–12 repetições, carga-alvo 60 kg, 3 séries + 1 de aquecimento).

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-09.1 🔴 | Treinos → programa publicado → **Ativar**. | Confirma, o programa vai para **Ativo** e o Início passa a mostrá-lo. | Ativa sem confirmar, ou não aparece no Início. |
| V-09.2 🔴 | Ative **outro** programa publicado. | O diálogo diz que o atual deixa de ser o ativo (não é apagado); depois o anterior aparece em publicados. | Apaga ou perde o anterior. |
| V-09.3 🔴 | **Arquivar** um programa. | Pede confirmação explicando o efeito; sai de Ativo/Publicados e aparece em **Arquivados**. | Arquiva sem perguntar. |
| V-09.4 🔴 | Programa publicado → **Abrir a ficha**. | A prescrição é legível: exercícios, séries, repetições, carga-alvo, descanso e o tipo de série (aquecimento). | Dados faltando ou ilegíveis. |
| V-09.5 🔴 | Na ficha, **Iniciar treino desta ficha**. | O executor abre com os exercícios e as séries **da ficha**; não cria um segundo treino se já houver um aberto (oferece continuar, avisando se é de outra origem). | Dois treinos abertos. |
| V-09.6 🔴 | No executor da ficha, confira o supino **sem histórico**. | Aparece "Meta: 8–12 repetições · 60 kg". A série de **trabalho** vem com **60 kg** e **8** repetições (o mínimo da faixa); o **aquecimento não herda os 60 kg**. | Carga de aquecimento igual à de trabalho, ou repetições fora da faixa. |
| V-09.7 🔴 | Faça o supino com **15** repetições, termine e inicie a mesma ficha de novo. | A sugestão parte do último treino, mas **dentro da faixa**: repetições 12 (não 15). A carga-alvo continua mandando. | Sugere 15, ou ignora a faixa. |
| V-09.8 🟡 | Tente iniciar uma ficha de versão em **rascunho**. | Não deixa treinar (só versão publicada). | Inicia. |

### R10 — Offline completo (E08-01, E08-02, E08-03, E08-07, E07-08, E07-11)

Este é o roteiro que mais importa antes de confiar no app na academia. Pré-requisito: programa ativo e API acessível. Para conferir o que chegou ao servidor, use a aba Evolução ou o histórico (e, se quiser, o banco: `SELECT * FROM sessoes_treino ORDER BY id DESC LIMIT 3`).

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-10.1 🔴 | **Com rede**, abra o Início (isso guarda o programa no aparelho). Ative o **modo avião**, **feche o app deslizando** e reabra. | Abre logado; o Início mostra o programa e "Próximo: …", com o aviso "Sem conexão: mostrando o programa salvo neste aparelho em dd/mm" e o indicador **Offline — salvo neste dispositivo**. | Início vazio, erro, ou desloga. |
| V-10.2 🔴 | Ainda em avião: **Iniciar** a próxima ficha. | O executor abre com as séries da ficha e os valores sugeridos (metas e último treino salvos). | Erro "não foi possível iniciar". |
| V-10.3 🔴 | Conclua 3 séries (uma com vírgula, ex.: `42,5`). | Cada uma vira concluída na hora, **sem mensagem de erro**; o indicador continua Offline. | Erro ao concluir, ou série não fica concluída. |
| V-10.4 🔴 | Ainda em avião, **feche o app à força** (deslizar para fora) e reabra. | O Início mostra **TREINO EM ANDAMENTO** com o progresso; **Continuar treino** abre o executor com as 3 séries **ainda concluídas**. | Treino sumiu, séries perdidas, ou deixa iniciar outro treino. |
| V-10.5 🔴 | **Pausar treino**, espere 1 min, **Retomar treino**. | O aviso "Treino pausado…" aparece e some; sem erro. | Erro, ou a pausa não some. |
| V-10.6 🔴 | **+ série** e conclua-a; depois **Finalizar treino** (confirme). | Abre o resumo com os números certos (séries, exercícios, volume). | Número errado, ou erro. |
| V-10.7 🔴 | Desative o modo avião e **fique no app** (ou saia e volte a ele). | O indicador passa por **Pendente de sincronização** e termina em **Sincronizado** em até ~30 s (o app tenta enviar sozinho a cada 30 s enquanto houver registro esperando; **Tentar novamente** tenta na hora). | Fica pendente para sempre, ou mostra erro sem saída. |
| V-10.8 🔴 | Abra a Evolução / o histórico. | O treino está lá **uma única vez**, com a **duração sem o tempo de pausa** e as séries/valores que você registrou. | Duplicado, valor diferente, ou duração contando a pausa. |
| V-10.9 🔴 | Repita um treino offline, mas **ligue e desligue o modo avião várias vezes** durante o envio. | No fim há **um** treino no histórico, sem séries repetidas. | Treino ou séries em duplicidade. |
| V-10.10 🔴 | Em avião, no executor, toque em **+ exercício** e busque. | Aviso claro de que precisa de conexão; **o treino e os registros continuam intactos**. | Perde o treino, trava, ou fecha o app. |
| V-10.11 🟡 | Treino iniciado **com rede**; corte a rede no meio (avião) e continue registrando; religue ao fim. | Continua sem erro e sincroniza no fim, sem duplicar. | Erro ao registrar, ou duplicidade. |
| V-10.12 🟡 | Em avião, **Descartar treino** (confirme) e religue a rede. | O treino cancelado **não aparece** no histórico nem na semana. | Aparece como concluído. |

### R11 — Conflitos e sair da conta (E08-05, E08-06, E08-09)

Os testes V-11.1 a V-11.3 precisam de **dois aparelhos** (ou um aparelho e um emulador) na mesma conta, porque o conflito só existe quando **outro dispositivo** gravou valores diferentes na mesma série. Por isso são 🟡. Os demais são 🔴 e funcionam com um só.

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-11.1 🟡 | Aparelho A, **offline**: registre uma série (60 kg × 10) de um treino que o servidor já conhece. Aparelho B, **online**, na mesma série: registre outro valor (55 kg × 8) **depois**. Religue o A. | O A mostra **Conflito — revisar** e o aviso com a quantidade; **Revisar registros** lista a série com **os dois lados** ("Neste dispositivo: 60 kg × 10" / "No servidor: 55 kg × 8"). | Sobrescreve em silêncio, ou não avisa. |
| V-11.2 🟡 | **Manter o meu**. | A operação some da revisão, o indicador volta a Sincronizado e o servidor passa a ter 60 × 10. | Continua em conflito para sempre. |
| V-11.3 🟡 | Refaça o conflito e escolha **Usar o do servidor**. | A série local passa a 55 × 8 e o indicador volta a Sincronizado. | Mantém o valor antigo. |
| V-11.4 🔴 | Em avião, registre uma série e vá a Perfil → **Sair**. | **Não sai.** Painel "Antes de sair" com a contagem de registros ainda no aparelho e as opções **Tentar enviar agora**, **Sair e manter no aparelho**, **Sair e apagar do aparelho** e **Cancelar**. | Sai sem avisar, ou perde o registro. |
| V-11.5 🔴 | **Sair e manter no aparelho**. Religue a rede e **entre de novo com a mesma conta**. | Entra, o envio acontece sozinho e o treino aparece no histórico. | O registro some. |
| V-11.6 🔴 | Repita a pendência e escolha **Sair e apagar do aparelho**. | Pede confirmação explicando que é definitivo. Ao entrar de novo, o treino **não existe**. | Apaga sem confirmar. |
| V-11.7 🔴 | Deixe pendências de uma conta e **entre com outra conta** no mesmo aparelho. | A outra conta **não vê nem envia** os registros da primeira. | Mistura de contas. |
| V-11.8 🔴 | Com tudo sincronizado, toque em **Sair**. | Sai direto, sem painel. | Pergunta sem necessidade, ou não sai. |
| V-11.9 🟡 | Depois de sincronizar um treino feito offline, reabra-o (histórico → resumo). | Os números conferem com o que o servidor calculou (duração com a pausa descontada). | Divergência entre o aparelho e o servidor. |

### R12 — Biblioteca de exercícios (E06-06)

Pré-requisito: exercícios publicados (§1.2). O seed não traz mídia, então a demonstração aparecerá como "indisponível" (é o esperado e é o que se testa em V-12.4).

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-12.1 🔴 | Aba **Treinos** → **Biblioteca de exercícios**. | Lista de exercícios com equipamento e grupo; campo de busca; filtros de **Grupo muscular** e **Equipamento** com a opção "Todos". | Lista vazia sem motivo (confira §1.2), ou tela quebrada. |
| V-12.2 🔴 | Busque `supino`; depois escolha o filtro de um grupo e de um equipamento. | A lista acompanha (a busca espera um instante depois de digitar); o chip escolhido fica destacado e é lido como "selecionado". | Filtro que não muda a lista, ou seleção só por cor. |
| V-12.3 🔴 | Busque algo que não existe (`zzzz`). | "Nenhum exercício encontrado" com orientação e **Limpar busca e filtros**, que volta à lista. | Tela vazia sem explicação. |
| V-12.4 🔴 | Abra um exercício. | Nome e tags; **Demonstração** com o aviso de que não há demonstração e **Como fazer** em passos numerados, **Cuidados** (se houver), músculos e **Alternativas**. Nada de erro por não haver vídeo. | Erro, tela em branco, ou instruções escondidas por falta de vídeo. |
| V-12.5 🔴 | Toque numa **alternativa**. | Abre o detalhe da alternativa; o botão voltar do sistema volta ao exercício anterior. | Abre o exercício errado, ou perde a navegação. |
| V-12.6 🔴 | Ao adicionar exercício à ficha (editor) e ao treino (executor), toque em **Detalhes** de um item. | Abre o detalhe **sem** adicionar o exercício; ao voltar, a busca continua e o item só entra se você tocar no nome. | Adiciona sem querer, ou perde a busca. |
| V-12.7 🔴 | No executor, toque em **Como fazer este exercício**. | Abre o detalhe do exercício atual; ao voltar, o treino está como estava (séries concluídas mantidas). | Perde séries, ou abre outro exercício. |
| V-12.8 🔴 | **Modo avião** → abra a biblioteca e um detalhe. | Aviso de falta de conexão com **Tentar de novo**; o treino em andamento não é afetado. | Trava, ou derruba o app. |
| V-12.9 🔴 | Leitor de tela: percorra a lista e um detalhe. | Cada exercício é lido com nome, equipamento e grupo; as seções têm títulos (Demonstração, Como fazer…); os passos são lidos como "Passo 2: …". | Itens sem nome, passos sem ordem. |
| V-12.10 🟡 | (Só com mídia aprovada no banco de teste) Exercício com imagem aprovada. | A imagem aparece com "Demonstração revisada · versão N"; fonte 200 % não corta a legenda. | Imagem sem legenda de revisão. |

---

## 3. Quadro de resultados

Copie e preencha (uma cópia por aparelho). **P**/**F**/**N/A** e uma observação curta.

| ID | Aparelho | Resultado | Observação |
|---|---|---|---|
| V-00.1 |  |  | tempo de abertura: ___ s |
| V-00.2 |  |  |  |
| V-00.3 |  |  |  |
| V-01.1 … V-01.10 |  |  |  |
| V-02.1 … V-02.11 |  |  |  |
| V-02b.1 … V-02b.4 |  |  |  |
| V-02c.1 … V-02c.4 |  |  |  |
| V-03.1 … V-03.9 |  |  |  |
| V-04.1 … V-04.4 |  |  |  |
| V-05.1 … V-05.12 |  |  |  |
| V-06.1 … V-06.4 |  |  |  |
| V-07.1 … V-07.9 |  |  |  |
| V-08.1 … V-08.8 |  |  |  |
| V-09.1 … V-09.7 |  |  |  |
| V-10.1 … V-10.10 |  |  | testar em avião de verdade |
| V-11.4 … V-11.8 |  |  |  |
| V-12.1 … V-12.9 |  |  |  |

---

## 4. Registrando um defeito

Para cada **F**, anote (no mesmo quadro, ou me envie):

- **ID do teste** e **aparelho/SO** (ex.: V-02.3, Pixel 6a, Android 14);
- **O que você fez** (passos) e **o que esperava** × **o que aconteceu**;
- **Frequência** (sempre / às vezes / uma vez);
- **Print ou gravação de tela**, se puder (sem dados pessoais reais: use só as contas de teste);
- Se envolve rede: com Wi-Fi, 4G ou modo avião.

Não coloque senhas, tokens nem e-mails reais no relato.

## 5. Critério para marcar as histórias como concluídas

| História | Testes obrigatórios (🔴) que precisam passar |
|---|---|
| E01-06 (entrar, cadastrar, recuperar) | V-00.1 a V-00.3, V-01.1 a V-01.5, V-01.8 a V-01.10, V-06.1 |
| E01-07 (restaurar sessão) | V-01.6, V-01.7 |
| E07-05 (executor) | V-02.1 a V-02.11, V-06.2 |
| E07-07 (acrescentar e substituir exercício) | V-02b.1 a V-02b.4 |
| E07-10 (rótulos de carga e unilaterais) | V-02c.1 a V-02c.4 |
| E07-06 (descanso) | V-03.1 a V-03.9, V-06.3 |
| E07-09 (resumo) | V-04.1 a V-04.4 |
| E06-03 (Meus treinos) | V-05.1, V-05.2, V-06.4 |
| E06-04 (editor de programa e ficha) | V-05.3, V-05.4, V-05.7 a V-05.12 |
| E06-05 (configurar exercício) | V-05.5, V-05.6 |
| E05-03 (Início) | V-07.2 a V-07.5, V-07.9 |
| E04-03 (abas e voltar ao treino) | V-07.1, V-07.5, V-07.7, V-07.8 |
| E04-04 (SyncStatus, semana, números) | V-07.9, V-10.1, V-10.7 |
| E09-03 (Evolução e histórico) | V-08.1 a V-08.5, V-08.7, V-08.8 |
| E06-08 (ativar, trocar, arquivar) | V-09.1 a V-09.3 |
| E07-04 (ficha e iniciar) e metas D-14 | V-09.4 a V-09.7 |
| E08-01, E08-02, E08-03 (banco, cache, fila) | V-10.1 a V-10.3, V-10.7 a V-10.10 |
| E07-11 (recuperar o treino) | V-10.4 |
| E07-08 (pausar, retomar, descartar) | V-10.5 |
| E08-07 (estado de sincronização) | V-10.1, V-10.7 |
| E08-05 (conflitos) | V-11.1 a V-11.3 (precisam de dois aparelhos; sem eles a história fica "em andamento") |
| E08-06 (reconciliação) | V-10.8, V-11.9 |
| E08-09 (sair da conta) | V-11.4 a V-11.8 |
| E06-06 (biblioteca e detalhe do exercício) | V-12.1 a V-12.9 |

Regra: **todos os 🔴 da história em um Android e em um iPhone**. Se faltar um dos dois SO, a história continua "em andamento" com a nota do que falta. Falhas viram defeitos (§4) e a história volta a ser marcada depois da correção e de uma nova rodada só dos testes que falharam.

## 6. Anexo: comandos úteis

```powershell
# Ver os e-mails "enviados" pela API local (mais novo por último).
# Para zerar o banco de teste e começar de novo, repita §1.1 e §1.2 (apaga TUDO do capifit local).
Get-ChildItem C:\xampp\htdocs\capifit\backend\storage\mail | Sort-Object LastWriteTime | Select-Object -Last 3

# Limpar os dados do app no Android (força login de novo e novo identificador de aparelho)
adb shell pm clear host.exp.exponent        # Expo Go; em build de desenvolvimento use o pacote do app

# Ver o log do aparelho enquanto reproduz um defeito (Android)
adb logcat *:E ReactNativeJS:V
```

- **iPhone:** para "limpar dados", desinstale e reinstale o app (o Keychain pode manter a sessão; teste isso também: é um comportamento do iOS).
- **Servidor mock (sem API):** `npm run mock:api` em `mobile\` responde pelo contrato em `http://localhost:4010`. Serve para ver as telas, mas **não** vale para validar regras (ele não grava nada de verdade): use a API real para este roteiro.

---

## Registro de versão

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 22/10/2026 | Primeira versão: preparação, 6 roteiros, quadro de resultados e critério de conclusão para as histórias do app já entregues. |
| 2.3 | 23/10/2026 | R2c (rótulos de carga por convenção e unilaterais, E07-10). |
| 2.2 | 23/10/2026 | R2b (substituir e acrescentar exercício, E07-07). |
| 2.1 | 23/10/2026 | R12 (biblioteca de exercícios, E06-06) e critérios correspondentes. |
| 2.0 | 23/10/2026 | Cinco roteiros novos (R7 Início e abas, R8 Evolução, R9 programa ativo e metas, R10 offline completo, R11 conflitos e sair da conta); textos atualizados onde as telas mudaram (Sair no Perfil, Treinos como aba, executor offline, cartão de treino em andamento); quadro e critérios estendidos. |
