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
| D3 | Iniciar treino avulso | Tela "Carregando o treino…" para sempre e erro "Maximum update depth exceeded" | `reload` era recriado a cada renderização e entrava como dependência de `useFocusEffect`, que recarregava o treino sem parar | `reload` estável; os testes passaram a usar um `useFocusEffect` que se comporta como o real, e o teste trava sem a correção |

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
| V-02.1 em diante | — | Em andamento; bloqueado pelo defeito D3 até a correção |

### Observações para decidir depois

- Com a API fora do ar o Início mostra dois avisos empilhados (informativo e de atenção); está correto, mas poderia ser um só.
- Notificação de fim de descanso: não existe no Expo Go 58; V-03.5, V-03.6, V-03.8 e V-03.9 só valem em build de desenvolvimento.
- Pendente de decisão do UX-02: valor digitado e não concluído volta à sugestão ao sair e voltar ao treino (V-07.6).
