# CapiFit — App (mobile)

React Native + Expo (SDK 58) com Expo Router. Código em `src/`; rotas em `src/app/`.

## Comandos

```bash
npm install            # dependências (se faltar algum pacote, use `npx expo install <pacote>`)
npm start              # servidor de desenvolvimento (abra com o Expo Go ou um build de desenvolvimento)
npm run check          # tokens + TypeScript + lint + regras do projeto + testes (o mesmo que o CI roda)
npm run tokens         # regenera src/design-system/tokens.generated.ts a partir de docs/08_design_tokens.json
npm run api:types      # regenera src/api/schema.generated.ts a partir de docs/07_openapi.yaml (o check confere se está em dia)
npm run mock:api       # servidor mock do contrato em http://localhost:4010 (Prism), para trabalhar sem a API
```

## Regras do projeto

- **Cores só pelos tokens.** `docs/08_design_tokens.json` é a fonte; o tema é gerado (`npm run tokens`) e o lint reprova
  cor literal (hex, `rgb()`) em `src/` (DS-02).
- **Texto só pelo catálogo.** Toda string visível vem de `src/i18n/pt-BR.ts` via `t()`; o lint reprova texto fixo no JSX.
- Use `npx expo install` (não `npm install`) para pacotes do Expo, para obter a versão compatível com o SDK.
- Não edite `ios/` nem `android/` (gerados). Configuração nativa fica em `app.json`.

## API e autenticação

- **URL da API:** `EXPO_PUBLIC_API_URL` (ver `.env.example`; variáveis `EXPO_PUBLIC_*` ficam visíveis no app, nunca coloque segredo). Emulador Android acessa o PC por `http://10.0.2.2:PORTA`.
- **Tipos do contrato:** `src/api/schema.generated.ts` é gerado do OpenAPI (não edite). Mudou o contrato? Rode `npm run api:types` e commite; o CI reprova se estiver defasado.
- **Cliente:** `src/api/client.ts` desembrulha o envelope, devolve `ApiError` (código, campos, `request_id`, `Retry-After`), tem tempo limite e, em 401, renova o token UMA vez e repete a chamada com a mesma chave de idempotência.
- **Sessão:** tokens ficam só no armazenamento seguro do aparelho (`expo-secure-store`: Keychain/Keystore), nunca em log nem em estado de tela. `src/auth/authCore.ts` renova com uma chamada por vez; o app restaura a sessão ao abrir, inclusive sem rede (o treino não depende da conexão). O identificador do aparelho é criado uma vez e sobrevive ao logout.
- **Rotas por sessão:** `src/app/_layout.tsx` usa `Stack.Protected`: sem sessão só as telas de entrada (`boas-vindas`, `entrar`, `cadastrar`, `recuperar`); com sessão a área logada. O link do e-mail abre `redefinir-senha?token=…` (esquema `capifit://`). O guard só esconde telas: a autorização é do servidor.

## Executor de treino (TEL-012)

- **Fluxo:** Início → "Iniciar treino avulso" (ou "Continuar treino em andamento" se já houver um aberto: o servidor aceita só um por vez) → `treino/[uuid]` → `treino/[uuid]/exercicios` (escolha de exercício do catálogo, que já cria 3 séries). Finalizar volta ao Início.
- **Pré-preenchimento (D-14):** carga e repetições vêm **sugeridas** e editáveis, em cor secundária até o usuário editar; só viram registro no toque em **Concluir**. Ordem da sugestão: série anterior já concluída neste treino → série de mesma posição (ou a última) do último treino concluído do exercício → em branco. Corrigir uma série concluída reabre os campos e registra de novo.
- **Validação local = servidor:** carga e repetições (`reps_carga`), só repetições (peso corporal e assistido; carga opcional) ou só duração (`tempo`). Carga aceita vírgula (`42,5`).
- **Lógica fora da tela:** `features/workout/input.ts` (digitação), `prefill.ts` (sugestão), `workoutApi.ts` (chamadas) e `useWorkout.ts` (estado). Esta entrega é **online**: salvar offline e a fila de sincronização são as histórias E08-01…E08-03.
- **Descanso (TEL-013, `features/rest/`):** o timer guarda o **instante final** (`restTimer.ts`, funções puras), não um contador: bloquear a tela ou trocar de app não faz o tempo parar, e ao voltar o relógio é recalculado na hora. Inicia ao concluir uma série nova (configurável; corrigir não reinicia) ou à mão; pausar, pular e ajuste de 15 s (limites de 15 s a 10 min); padrão 90 s. Não bloqueia: dá para editar outras séries durante a contagem. Fim: háptico (uma vez) e aviso local agendado (`expo-notifications`), cancelado ao pausar, pular ou sair da tela. A permissão de notificação é pedida **uma vez**, quando o primeiro descanso começa; sem permissão, o descanso segue só dentro do app. Leitor de tela: o texto de apoio (região viva) muda a cada 15 s, não a cada segundo.
- **Resumo (TEL-014, `treino/[uuid]/resumo`):** ao finalizar, o executor abre o resumo, que **relê a sessão no servidor** e só mostra "Treino concluído!" se ela estiver concluída (senão avisa e deixa tentar de novo). Mostra duração (ativa, sem pausas), séries concluídas de total, exercícios executados e, se houver carga, o volume. **Volume = carga × repetições das séries realizadas de trabalho** (sem aquecimento, sem exercício de tempo ou assistido, só com carga maior que zero), a mesma regra do servidor; a tela explica o cálculo e que não é nota do treino. "Ver registros" expande as séries feitas. Lógica em `features/workout/summary.ts`.
- **Meus treinos (TEL-020, `features/programs/`):** abas **Ativo** (programa em uso primeiro, depois os outros publicados), **Rascunhos** e **Arquivados**, com contagem; cada cartão (`WorkoutCard`) mostra a **origem** (`OriginBadge`: ícone + texto + cor, nunca só a cor), versão e data, e o ativo mostra "Em uso" e as fichas. "Criar programa" abre `programas/novo` (nome até 180, objetivo até 100; a chave de idempotência é da tela, então tentar de novo não duplica) e leva ao detalhe `programas/[uuid]`, por ora **somente leitura** (fichas e exercícios; a edição é a E06-04). Ativar, arquivar e copiar são a E06-08/E06-09; "Receber sugestão" é da Fase 2. A lista carrega até 500 programas (5 páginas de 100).
- **Fora desta entrega:** duração de descanso por exercício (vem da prescrição, E06-05) e preferências de descanso e háptico persistidas (E04-05), substituir exercício e pausar (E07-07/E07-08), resumo da sessão (E07-09) e rótulos de carga por convenção (E07-10).

## Pendências desta base (história E00-08)

- Abrir o app em um Android de entrada e em um iPhone e registrar o **tempo de abertura** (linha de base do Doc 10 §7.6).
- Ícones e splash são os **provisórios do template**; substituir pelos da marca (depende da Capi/identidade).
- Definir `android.package` e `ios.bundleIdentifier` e a versão mínima de iOS/Android antes do primeiro build (Doc 10 §10.3).
- `npm audit` aponta vulnerabilidades em dependências transitivas das ferramentas de build; reavaliar a cada atualização do SDK.
