# CapiFit — Documento 14: Roteiro de validação do app em aparelho

**Versão:** 1.0 (22/10/2026) · **Aplica-se a:** histórias E01-06, E01-07, E07-05, E07-06, E07-09, E06-03, E06-04 e E06-05
**Por que existe:** os testes automáticos (Jest, tipos, lint) já passam no CI, mas só um aparelho de verdade mostra teclado, rolagem, tema, notificação, vibração, leitor de tela e desempenho. Este roteiro transforma "falta validar em aparelho" em uma lista que você executa e marca.

## 0. Como usar

1. Faça a **preparação (§1)** uma vez. Leva cerca de 30 minutos na primeira vez.
2. Execute os roteiros **R0 a R6 (§2)** num **Android** e num **iPhone** (veja a matriz mínima em §1.4). Para cada passo, confira o **Esperado**.
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
& 'C:\xampp\mysql\bin\mysql.exe' --default-character-set=utf8mb4 -u root capifit -e "UPDATE exercicios SET status='publicado' WHERE nome IN ('Supino reto com barra','Supino reto com halteres','Puxada na frente','Remada baixa na polia','Flexão de braços','Barra fixa assistida','Prancha isométrica');"
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
| V-01.4 🔴 | Cadastre com dados válidos (marque os dois aceites). | Entra na área logada ("Olá, <nome>"). | Erro inesperado ou volta para a tela de entrada. |
| V-01.5 🔴 | **Sair**. Entre com a senha **errada**, depois com e-mail inexistente. | Nos dois casos a **mesma** mensagem: "E-mail ou senha incorretos." | Mensagens diferentes (revelam se o e-mail existe). |
| V-01.6 🔴 | Entre com a senha certa. Feche o app **deslizando para fora** e reabra. | Abre **direto** na área logada, sem pedir login (sessão restaurada). | Pede login de novo, ou mostra a tela de entrada por um instante antes. |
| V-01.7 🔴 | Ative o **modo avião**, feche e reabra o app. | Abre logado, com o aviso "Sem conexão: você pode treinar normalmente." | Trava, ou desloga por falta de rede. |
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
| V-02.7 🔴 | **Modo avião** → conclua uma série. Depois desligue e tente de novo. | Aviso "Não foi possível registrar…", **os valores digitados permanecem**; ao voltar a rede, concluir funciona. | Perde o que digitou, ou registra duas vezes. |
| V-02.8 🔴 | **Finalizar treino** com séries pendentes. Cancele, depois confirme. | O diálogo diz quantas séries ficaram pendentes; Cancelar não faz nada; Finalizar abre o resumo. | Finaliza sem perguntar. |
| V-02.9 🔴 | Inicie **outro** treino avulso e adicione o mesmo supino. | As séries já vêm sugeridas com o que você fez no treino anterior, e aparece "Última vez: 40 kg · …". | Sugestão em branco ou errada. |
| V-02.10 🔴 | Com um treino aberto, volte ao Início. | O botão vira **Continuar treino em andamento**. | Permite iniciar um segundo treino aberto. |
| V-02.11 🔴 | Use **só uma mão** (polegar) para registrar 3 séries seguidas. | Alcança os botões; alvos de toque confortáveis (sem tocar errado). | Botões pequenos demais ou fora do alcance. |
| V-02.12 🟡 | Registre uma série de **peso corporal** (flexão) e uma **assistida** (barra fixa assistida). | Peso corporal: só reps (carga opcional); assistida: reps e carga de assistência. | Campo obrigatório indevido. |

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
| V-04.4 🔴 | **Voltar ao início**; depois use o botão voltar do sistema. | Não volta para o resumo. O Início mostra "Iniciar treino avulso" de novo. | Volta ao resumo ou ao executor. |
| V-04.5 🟡 | Finalize um treino só de peso corporal. | Sem linha de volume. | Mostra "Volume: 0 kg". |

### R5 — Meus treinos e editor de programa (E06-03, E06-04, E06-05)

| ID | Passos | Esperado | Reprova se |
|---|---|---|---|
| V-05.1 🔴 | Início → **Meus treinos** (conta nova). | Aba Ativo vazia com "Nenhum programa ativo" e **Criar programa**. As abas mostram contagem. | Erro ou tela vazia sem orientação. |
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
| V-03.1 … V-03.9 |  |  |  |
| V-04.1 … V-04.4 |  |  |  |
| V-05.1 … V-05.12 |  |  |  |
| V-06.1 … V-06.4 |  |  |  |

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
| E07-06 (descanso) | V-03.1 a V-03.9, V-06.3 |
| E07-09 (resumo) | V-04.1 a V-04.4 |
| E06-03 (Meus treinos) | V-05.1, V-05.2, V-06.4 |
| E06-04 (editor de programa e ficha) | V-05.3, V-05.4, V-05.7 a V-05.12 |
| E06-05 (configurar exercício) | V-05.5, V-05.6 |

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
