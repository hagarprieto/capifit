# CapiFit — Documento 15: Resultados da validação em aparelho

Registro vivo das rodadas do roteiro do Documento 14. **P** = passou, **F** = falhou, **N/A** = não se aplica neste aparelho, **—** = ainda não testado. Uma história só vira concluída quando os testes obrigatórios (🔴) passam em pelo menos um **Android** (Doc 14 §5; decisão de 23/10/2026: iPhone fica para uma fase posterior à versão comercial).

## Rodada 1 — 23/10/2026

- **Aparelho:** Motorola edge 60 pro, Android 16, Expo Go 58.0.5 (iPhone fica para uma fase posterior).
- **Ambiente:** API local em PHP (MariaDB do XAMPP), app em desenvolvimento (Metro), ligação pelo cabo USB (`adb reverse`).
- **Como simular "sem rede":** parar a API no computador (o modo avião não corta o túnel do cabo).

### Defeitos encontrados nesta rodada (todos corrigidos e com teste)

| # | Onde | O que acontecia | Causa | Correção |
|---|---|---|---|---|
| D1 | Abertura do app (Expo Go 58) | O app caía ao abrir ("Cannot find native module ExpoTopicSubscriptionModule") | `expo-notifications` importado no topo; o Expo Go 58 não traz a parte nativa | Módulo carregado só quando preciso, com `try/catch` (`220dd69`) |
| D2 | Início sem a API | Indicador "Sincronizado" ao lado de "Não foi possível atualizar o resumo" | O estado "sem conexão" só era definido ao abrir o app | O cliente de rede avisa o resultado de cada chamada (`b99614e`) |
| D4 | Concluir a primeira série | Tela vermelha "Cannot find native module ExpoTopicSubscriptionModule" ao iniciar o descanso (a série já tinha sido registrada) | O Metro trata erro de carga de módulo como fatal e engole a exceção: o `try/catch` em volta do `require` da correção D1 não funcionava | Testa a existência do módulo nativo ANTES de carregar `expo-notifications` |
| D5 | Fim do descanso (V-03.4) | Tela vermelha "Cannot read property 'split' of null" quando o relógio do descanso chegou a zero | Ao fim, o cartão troca o relógio (Text tabular) pela mensagem de fim na mesma posição; `fontVariant` passava de lista a `undefined`, o nativo manda `null` e o React Native quebra em `processFontVariant` | `fontVariant` passa a ser sempre uma lista (`proportional-nums` quando não é tabular); teste de contrato em `design-system/text.test.tsx` |
| D6 | Executor (todas as séries) | Os campos eram caixas vazias, sem texto visível dizendo o que digitar (carga, repetições, tempo); na prancha, uma caixa só, sem indicar que é em segundos | Só existiam rótulos para o leitor de tela; faltava rótulo visível | Cabeçalho das colunas alinhado aos campos, com nome e unidade ("Carga / kg (total)", "Reps", "Tempo / segundos", "por lado"); testes de visibilidade e de acessibilidade |
| D8 | Executor, "+ série" | Uma série adicionada por engano não tinha como ser desfeita | Funcionalidade ausente (só havia "+ série") | Botão **Remover série** (tira a última série pendente ou extra; pede confirmação se já estava concluída). Série da prescrição já realizada não sai (use Corrigir). Sem rede, desfaz o que ainda não foi enviado; série já enviada exige conexão. API: `DELETE /me/sessoes/{uuid}/series/{serie_uuid}` |
| D7 | Executor, série concluída | O botão "Corrigir" ficava numa linha inteira embaixo de cada série concluída, quase triplicando a altura (4 séries ocupavam a tela toda e empurravam o descanso para fora) | Layout: "Corrigir" era um botão de linha própria | "OK" e "Corrigir" na mesma linha da série (quebra de linha só com fonte muito grande); 4 séries concluídas agora cabem com o cartão de descanso à vista |
| D3 | Iniciar treino avulso | Tela "Carregando o treino…" para sempre e erro "Maximum update depth exceeded" | `reload` era recriado a cada renderização e entrava como dependência de `useFocusEffect`, que recarregava o treino sem parar | `reload` estável; os testes passaram a usar um `useFocusEffect` que se comporta como o real, e o teste trava sem a correção |

Por que os testes automáticos não pegaram D4 e D5: os testes simulam as telas, não o código nativo nem o empacotador. Por isso a regra agora fica registrada em testes de contrato (a existência do módulo nativo antes do `require`; o `fontVariant` nunca indefinido).

Por que os testes automáticos não pegaram D3: o `useFocusEffect` era simulado como "não faz nada". Agora é simulado como o de verdade (roda ao abrir e de novo sempre que a função muda).

### Resultados por teste

| ID | Resultado | Observação |
|---|---|---|
| V-01.1 a V-01.3 | — | Erros do cadastro e teclados: não confirmados por item |
| V-01.4 | **P** | Cadastro válido entra no Início com "Olá, <nome>! Bora treinar?" e as 4 abas |
| V-01.5 | **P** | Mesma mensagem para senha errada e e-mail inexistente (conferido também na API) |
| V-01.6 | **P** | Reabrir o app entra direto na área logada |
| V-01.7 | **P** | Depois da correção D2: abre logado, "Offline — salvo neste dispositivo" e aviso; feito parando a API |
| V-01.8 | **P** | Mesma resposta (204) para e-mail cadastrado e inexistente |
| V-01.9 | **P** | Link do e-mail abre "Nova senha"; senha alterada; a antiga deixa de funcionar |
| V-01.10 | **P** | Link já usado: "Link inválido ou expirado. Peça um novo link." |
| V-01.11 | — | Renovação de sessão com token curto |
| V-02.1, V-02.2 | **P** | Treino avulso abre vazio; busca e exercício com 3 séries |
| V-02.3 | **P** (parcial) | Série concluída e descanso iniciado sem erro (depois de D3 e D4); falta conferir a vírgula e a sugestão da série seguinte |
| V-03.1 | **P** | O descanso começa ao concluir a série |
| V-03.4 | **F → corrigido** | Ao chegar a zero, tela vermelha (D5); a repetir |
| V-02.3 (vírgula) | **P** | "42,5" foi aceito e exibido com vírgula |
| V-02.5 | **P** | Série corrigida para 11 repetições |
| V-02c.1 (barra) | **P** | Legenda "Carga em kg (total)" e coluna "Carga / kg (total)" |
| V-02.4, V-02.6 em diante | — | Em andamento |

### Observações para decidir depois

- Com a API fora do ar o Início mostra dois avisos empilhados (informativo e de atenção); está correto, mas poderia ser um só.
- Notificação de fim de descanso: não existe no Expo Go 58; V-03.5, V-03.6, V-03.8 e V-03.9 só valem em build de desenvolvimento.
- Pendente de decisão do UX-02: valor digitado e não concluído volta à sugestão ao sair e voltar ao treino (V-07.6).
