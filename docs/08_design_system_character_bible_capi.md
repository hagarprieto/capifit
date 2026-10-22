# CapiFit — Documento 08
## Design System e Character Bible da Capi

**Versão:** 1.0 — baseline de design (design system v0.2)  
**Data:** 21/10/2026  
**Status:** Proposta para validação  
**Artefatos complementares:** `08_design_tokens.json` (tokens) e `tools/design/check-contrast.js` (verificação de contraste)  
**Referência visual:** `img/CapiFit_ Treino Leve, Evolução Forte.png` (prancha de conceito)  
**Dependências:** Documentos 01 (princípios e Capi), 02 (fluxos), 03 (telas e componentes), 04 (mídia), 06 (decisões)

---

## 1. Objetivo, escopo e precedência

Consolidar a identidade visual e o sistema de componentes do CapiFit e definir a **Capi** (personagem) de forma produzível: proporções, expressões, poses, especificações de mídia, fluxo de revisão e regras de uso.

**Precedência:** os valores de cor do Documento 03 §7.1 são **substituídos** pelos tokens deste documento (`08_design_tokens.json`). Estrutura de telas e comportamentos continuam definidos no Documento 03. O nome **CapiFit é provisório** (verificação de marca pendente — Doc 06 §11); logotipo e nome aparecem aqui como conceito.

**O que este documento não é:** um arquivo de design (Figma etc.) nem o model sheet final do personagem. Define o que esses artefatos devem conter e como serão aprovados.

## 2. Avaliação da prancha de conceito

A prancha é um bom norte de direção de arte: dark mode, verde neon, a Capi como protagonista. Comparada com os Documentos 01–06, ela traz pontos a **manter**, **corrigir** e **decidir**.

### 2.1 Manter

- Direção "fitness premium acessível" em fundo escuro com acento verde (confirma Doc 03 §7.1).
- Estrutura das telas: Início com "Treino de hoje", semana, resumo; Executor com tabela Série/Carga/Reps/Feito; Detalhe do exercício com abas **Execução / Músculos / Dicas**.
- Os três modos de montagem com cores distintas (verde = "Você monta", azul = "Seu coach monta", roxo = "O app sugere") → viram os tokens `origin.*`.
- Capi em contextos distintos (mostra, demonstra, dá dicas, lembra do descanso) → base da biblioteca de poses (§10.4).
- Volume total, treinos e tempo como indicadores da semana (alinha com `GET /me/progresso/resumo`).

### 2.2 Corrigir (divergências com os documentos de produto)

| # | Na prancha | Conflito | Decisão |
|---|---|---|---|
| D8-01 | 4ª aba chamada **"Mais"** | Doc 03 e critério UX-01 definem **"Perfil"** | Manter **Perfil** (UX-01). "Mais" só se o menu crescer (revisar na Fase 2) |
| D8-02 | Slogan da Capi: *"Disciplina hoje, resultados amanhã!"* | Doc 01 §7.1 proíbe prometer resultados | Substituir por *"Um treino de cada vez."* (§12) |
| D8-03 | Mensagem de conquista: *"capivarize seus limites!"* | Doc 01 §7.4 e Doc 03 §8.3: não incentivar excesso de esforço | Substituir por *"Você evoluiu! Continue no seu ritmo."* |
| D8-04 | Card **"Conquista · 5 treinos seguidos"** (sequência) | Doc 01 §10.2: sem gamificação competitiva; Doc 03 §8.3: sem culpa por treinos perdidos | Conquistas pessoais entram na **Fase 2**; sequência nunca "zera" com mensagem negativa — mostrar "treinos na semana", não "sequência" |
| D8-05 | **"Novo recorde pessoal! +100 kg no supino"** | Recordes são "posterior" (Doc 01 §6.5) e dependem de histórico por exercício (TEL-032, Fase 2) | Fase 2. Se exibido, usar linguagem neutra e só com dados registrados |
| D8-06 | Sino de notificações no Início | Notificações são opt-in (Doc 02 §11.4) | Sino = **central de avisos** (prescrição pendente, vínculo, sincronização); oculto quando não houver itens e as notificações estiverem desativadas |
| D8-07 | Botão **"Iniciar"** no descanso | Doc 03 §5.4: descanso inicia ao concluir a série *se habilitado* | Manter os dois: início automático (configurável) **e** botão manual |
| D8-08 | Texto técnico e dicas nas telas de exercício ("Mantenha o peito aberto e o core ativo") | Conteúdo técnico exige revisão profissional (RN-09, RG-017) | Qualquer instrução exibida vem do catálogo **aprovado** (Doc 09); a prancha é só ilustração |
| D8-09 | Capi demonstrando supino e agachamento | Risco biomecânico por proporção antropomórfica (Doc 01 §7.3) | Seguir §10.6: revisão por profissional e referência complementar |
| D8-10 | Tabela sem RIR | RIR é opcional (Doc 01 §4.1) | RIR oculto por padrão; coluna extra aparece quando a prescrição ou a preferência pedir |
| D8-11 | Borda dos campos de carga/reps quase invisível sobre o fundo | Contraste de componente < 3:1 (WCAG 1.4.11) | Campos usam `border.strong` (4,2:1) |

### 2.3 Decidir (pendências de produto)

- Mostrar ou não a Capi com óculos escuros como "modo celebração" (poses de conquista — Fase 2).
- Paleta definitiva do personagem (valores provisórios no §10.2) após o model sheet.

## 3. Princípios visuais

1. **Dados primeiro.** Carga, repetições e confirmação têm o maior peso visual; a Capi nunca disputa com eles (Doc 03 §2.7).
2. **Verde é ação.** `brand.primary` marca a ação principal por tela e o estado "concluído". Nunca usar para erro ou aviso.
3. **Cor nunca sozinha.** Todo estado tem ícone ou texto além da cor.
4. **Escuro por padrão, claro disponível.** O tema claro é entregue na Fase 1 (para academias claras e preferência do sistema), com tokens já verificados.
5. **Leve, não infantil.** Cantos arredondados e personagem simpático, tipografia séria e números grandes.

## 4. Cores

Fonte: `08_design_tokens.json`. Verificação: `node tools/design/check-contrast.js` (**47 pares verificados, todos aprovados**).

### 4.1 Tema escuro (padrão)

| Token | Valor | Uso | Contraste principal |
|---|---|---|---|
| `bg.primary` | `#0D1117` | Fundo | — |
| `bg.surface` | `#171D26` | Cartões | texto 15,9:1 |
| `bg.elevated` | `#222B36` | Modais, campos | texto 13,5:1 |
| `brand.primary` | `#94F047` | CTA, concluído, destaque | 13,4:1 sobre `bg.primary` |
| `brand.onPrimary` | `#0D1117` | Texto sobre o verde | 13,4:1 |
| `brand.dark` | `#447A20` | Estados secundários, ícones de apoio | **só componente** (3,7:1 sobre fundo); não usar como texto |
| `text.primary` | `#F6F8FA` | Texto principal | 17,8:1 |
| `text.secondary` | `#B5BECA` | Apoio | 9,0:1 sobre surface |
| `text.disabled` | `#7C8795` | Desabilitado (isento de mínimo) | 4,6:1 |
| `feedback.error` | `#FF7777` | Erro (+ ícone + texto) | 6,6:1 |
| `feedback.warning` | `#FFD166` | Atenção | 11,7:1 |
| `feedback.success` | `#8CE5B0` | Sucesso | 11,3:1 |
| `feedback.info` | `#7CB7FF` | Informação | 8,1:1 |
| `border.subtle` | `#35404D` | Divisores **decorativos** | 1,8:1 (não usar em campos) |
| `border.strong` | `#6B7889` | Contorno de campos, botões secundários | 3,8–4,2:1 |
| `focus.ring` | `#FFFFFF` | Foco de teclado/leitor de tela | 18,9:1 |

### 4.2 Origem do programa (`OriginBadge`)

| Origem | Token escuro | Token claro | Ícone | Rótulo |
|---|---|---|---|---|
| Manual | `origin.usuario` `#8CE5B0` | `#17653A` | pessoa | "Criado por você" |
| Coach | `origin.coach` `#7CB7FF` | `#1F5FBF` | pessoa com seta | "Prescrito por {nome}" |
| App | `origin.app` `#C4A6FF` | `#6B3FD0` | brilho | "Sugerido pelo CapiFit" |

O badge sempre combina **ícone + texto + cor** (RN-08, UX-06).

### 4.3 Tema claro

| Token | Valor | Observação |
|---|---|---|
| `bg.primary` / `bg.surface` / `bg.elevated` | `#F6F8FA` / `#FFFFFF` / `#EEF1F5` | |
| `text.primary` / `text.secondary` | `#0D1117` / `#4A5565` | 18,9:1 / 7,6:1 sobre surface |
| `brand.primary` | `#94F047` | Como **preenchimento** de botão com `brand.onPrimary`; **nunca como texto** sobre claro (1,4:1) |
| `brand.text` | `#2E6414` | Texto/ícones verdes no tema claro (7,1:1) |
| `brand.dark` | `#447A20` | Contorno de botão (5,2:1) |
| `feedback.error / warning / success / info` | `#B42318` / `#8A5A00` / `#17653A` / `#1F5FBF` | ≥ 5,9:1 |
| `border.subtle` / `border.strong` | `#D0D7DE` / `#6B7889` | |

**Regra de uso:** componentes consomem tokens **semânticos**; é proibido usar hex literal em telas (Doc 03 §13.3).

## 5. Tipografia

- **Família:** Inter (licença OFL; embarcada no app) com fallback do sistema.
- **Números:** `font-variant-numeric: tabular-nums` obrigatório em carga, repetições, tempo e volume (alinhamento de colunas no executor).
- **Escala** (tokens `typography.scale`): caption 12/16 · bodySmall 14/20 · body 16/24 · title 20/28 · headline 24/32 · display 32/40 · numeric 24/32 (peso 700).
- Texto crítico (carga, reps, estado de série, erro) **nunca** em 12 pt.
- **Escala dinâmica:** respeitar fonte do sistema até **200%**. Em `SetRow`, a partir de 150% as colunas Série/Carga/Reps/Feito passam a empilhar em duas linhas sem cortar valores nem esconder o botão de concluir.

## 6. Espaçamento, forma e dimensões

- Espaçamentos: 4, 8, 12, 16, 24, 32 dp. Margem lateral de tela: 16 dp.
- Raios: 8 (campos), 12 (cartões), 16 (modais), 24 (hero), pílula (badges/chips).
- Alvos de toque: **mínimo 44 pt (iOS) / 48 dp (Android)**; no executor, o alvo preferido é **56 dp** e há ≥ 8 dp entre alvos adjacentes.
- `SetRow`: altura 64 dp; campo numérico 80 dp de largura; botão concluir 56×56 dp.
- Barra inferior: 64 dp + área segura; ícone 24 dp + rótulo ≥ 12 pt (visível sempre).
- Orientação: retrato no MVP; funcionar em 360×640 dp e com teclado aberto (o campo ativo nunca fica atrás do teclado nem do botão de concluir).

## 7. Ícones

- Grade de 24 dp, traço 2 dp, pontas arredondadas; preenchido só para estado ativo (aba atual, série concluída).
- Conjunto base de código aberto compatível com licença do projeto (sugestão: Lucide, ISC) + ícones próprios para: halter, capivara-selo, volume, série concluída, descanso.
- Ícones de estado sempre com rótulo acessível ("Série 2 concluída").
- Abas: Início (casa), Treinos (halter), Evolução (barras), Perfil (pessoa).

## 8. Componentes

Complementa o catálogo do Doc 03 §7.3 com especificação visual e de acessibilidade. Estados mínimos de cada componente continuam os do Doc 03.

| Componente | Especificação visual | Acessibilidade |
|---|---|---|
| `PrimaryButton` | Preenchimento `brand.primary`, texto `brand.onPrimary` 16/600, altura 56, raio 12; desabilitado: `bg.elevated` + `text.disabled`; carregando: spinner + texto mantido | Rótulo descritivo ("Iniciar treino A"); estado `busy` anunciado |
| `SecondaryButton` | Contorno `border.strong`, texto `text.primary` | Mesmo mínimo de alvo |
| `NumberField` | Altura 48–56, fundo `bg.elevated`, contorno `border.strong`, valor `numeric`; foco: contorno 2 dp `focus.ring`; erro: contorno `feedback.error` + ícone + mensagem abaixo | Teclado numérico/decimal; rótulo "Carga em kg, série 2 de Supino" |
| `SetRow` | Série · Carga · Reps · Feito; valor **pré-preenchido** em `text.secondary` até confirmação; ao concluir: linha com marcador ✓ em `brand.primary`, valores em `text.primary`; série extra com rótulo "extra" | "Concluir série 2 de Supino reto: 40 kg, 10 repetições"; estado pendente/concluída/editando anunciado (UX-12) |
| `WorkoutCard` | Fundo `bg.surface`, raio 12, título `title`, `OriginBadge`, versão e data em `text.secondary` | Cartão inteiro focável; origem lida antes do título |
| `WeekStrip` | 7 círculos (Seg–Dom); concluído = ✓ verde; hoje = anel `brand.primary`; não treinado = ponto neutro (**nunca** ✗ vermelho) | Anuncia "Terça: treino concluído"; não depende de cor |
| `StatTile` | Número `numeric` + rótulo `caption`; unidade sempre visível ("12.450 kg") | Leitura "Volume da semana: 12.450 quilos" |
| `RestTimer` | Anel + tempo `display` tabular; botões Pausar/Pular ≥ 48; fim: háptico opcional + texto | Atualização lida a cada 15 s ou sob demanda; não bloqueia o executor |
| `SyncStatus` | Ícone + texto: "Sincronizado", "Pendente de sincronização", "Offline — salvo neste dispositivo", "Conflito — revisar" | Mudança de estado anunciada de forma discreta |
| `CapiCoachTip` | Avatar 40 + balão `bg.elevated`, texto `bodySmall`, botão "Dispensar" | Dispensável; respeita "ocultar dicas"; nunca sobre campos de registro |
| `ExerciseDemoPlayer` | Proporção 4:3, miniatura com ▶ e "Ver execução", tela cheia opcional; abas Execução / Músculos / Dicas | Controles de reprodução; legendas; transcrição textual; sem autoplay por padrão |
| `EmptyState` | Capi estática 120 dp + frase curta + 1 CTA | Texto equivalente à ilustração |
| `ConfirmDialog` | `bg.elevated`, ação destrutiva com `feedback.error` + texto explicando efeito | Foco inicial em "Cancelar" |
| Gráfico de barras (evolução) | Uma cor (`brand.primary`), valor rotulado, barra do dia atual com contorno; eixo com texto ≥ 12 pt | Tabela textual alternativa disponível |

**Regras de gráfico:** sem ranking, sem comparação com outras pessoas, sem cor de "ruim/bom" (Doc 03 §5.7); mostrar sempre o dado e a unidade.

## 9. Movimento e redução de movimento

| Tipo | Duração | Comportamento |
|---|---|---|
| Transição de tela | 200 ms, `standard` | Reduzir movimento: corte direto |
| Marcar série concluída | 120 ms (preenchimento do ✓) | Mantém o estado final; sem animação sob Reduce Motion |
| Celebração pós-treino | ≤ 2 s, uma vez | Imagem estática sob Reduce Motion ou preferência "sem animações da Capi" |
| Demonstração do exercício | Loop do vídeo | Sob demanda; pausa automática ao sair da tela |

Regras: nenhuma animação durante o preenchimento de carga/reps; sem som por padrão; ler a preferência do sistema **e** a preferência do app (RN-11).

## 10. Character Bible — Capi

### 10.1 Identidade

- **Espécie e papel:** capivara antropomórfica fitness; mascote, guia e demonstradora (Doc 01 §7).
- **Personalidade:** simpática, persistente, acolhedora, bem-humorada, sem moralismo.
- **Frase-guia (assinatura):** *"Seu treino com mais leveza."* e *"Um treino de cada vez."*
- **Voz:** frases curtas, verbos de apoio ("Bora?", "Registre quando terminar"), nunca culpa ou comparação.
- **Não é:** profissional licenciado, avaliadora clínica, juíza do corpo do usuário.

### 10.2 Aparência (conforme prancha)

| Elemento | Descrição | Cor provisória* |
|---|---|---|
| Pelagem | Marrom-avermelhado quente, mais clara no focinho e barriga | `#A9622B` / `#D9A066` |
| Olhos | Escuros, expressivos, com brilho simples | `#1A1208` |
| Uniforme | Regata preta com selo da marca no peito; shorts pretos com listras verdes laterais | `#0D1117` + `#94F047` |
| Acessórios | Pulseira de treino no pulso; tênis preto com detalhe verde | — |
| Proporções | Corpo robusto de capivara com ombros largos, **braços e pernas curtos**; cabeça grande (≈ 1/3 da altura) | — |

\* Valores estimados da prancha; **substituir pelas amostras do model sheet aprovado**. O verde do uniforme usa o mesmo `brand.primary` para coerência.

### 10.3 Deliverables do Character Bible (produção)

1. **Model sheet:** vistas frontal, lateral, ¾ e traseira em pose neutra, com cotas de proporção.
2. **Folha de expressões** (§10.4) e **folha de mãos/gestos** (polegar, apontar, segurar barra/halter/prancheta/garrafa).
3. **Paleta** com hex/RGB/CMYK e regras de iluminação.
4. **Rig 3D** com limites articulares anatômicos documentados (ver §10.6).
5. **Variantes de figurino** (§10.5) e regras de marca (selo, área de proteção, tamanhos mínimos).
6. **Kit de UI:** WebP/PNG com alfa em 5 tamanhos; versão monocromática do selo.
7. **Licenças e autoria:** contrato de cessão, arquivos-fonte e registro de versões (Doc 01 §11, propriedade intelectual).

### 10.4 Expressões e poses (biblioteca mínima do MVP)

| ID | Expressão / pose | Uso | Fase |
|---|---|---|---|
| `capi_boas_vindas` | Sorriso com aceno | Splash, boas-vindas | 1 |
| `capi_neutra` | Sorriso leve, postura aberta | Avatar, listas | 1 |
| `capi_apoio` | Polegar para cima | Dicas, fim de sessão | 1 |
| `capi_prancheta` | Mostra o exercício | Editor, catálogo | 1 |
| `capi_demonstra` | Executando movimento | Demonstrações (vídeo) | 1 |
| `capi_descanso` | Segura garrafa, respira | Timer de descanso, dica de hidratação | 1 |
| `capi_vazio` | Olhar convidativo | Estados vazios | 1 |
| `capi_offline` | Expressão calma, nuvem | Offline/erros (tom neutro, sem humor) | 1 |
| `capi_pensando` | Mão no queixo | Geração de sugestão | 2 |
| `capi_celebra` | Braços para cima | Treino concluído | 1 (estática) / 2 (animada) |
| `capi_oculos` | Óculos escuros, confiante | Conquistas pessoais | 2 |
| `capi_cansada_ok` | Suor leve, sorriso | Pós-treino ("bom descanso") | 2 |

**Proibido:** expressões de deboche, decepção ou culpa; Capi apontando o corpo do usuário; poses de esforço extremo; qualquer pose com risco articular.

### 10.5 Figurinos

Base (regata + shorts). Variantes sazonais ou temáticas só após aprovação de marca e **sem alterar silhueta e proporções**.

### 10.6 Regras biomecânicas para demonstração (obrigatórias)

- **Fidelidade antes de fofura:** nos vídeos de demonstração, usar rig de proporções "técnicas" (alongamento de membros dentro de um limite definido no model sheet e aprovado pelo revisor técnico — pendência §16.7) quando as proporções de marca impedirem amplitude correta.
- Cada movimento tem **ficha de referência** (Doc 09): ângulos-chave, trajetória, posição de pés/mãos, respiração, erros comuns.
- **Aprovação em dois níveis:** (1) revisão **técnica** por profissional de Educação Física habilitado; (2) revisão **editorial/de marca**. Sem as duas, a mídia permanece `em_revisao` (RG-016/RG-017).
- **Mídia complementar obrigatória** (vídeo humano ou esquema anatômico) para exercícios de dificuldade `avancado`, exercícios com barra livre acima da cabeça e qualquer movimento em que a revisão apontar perda de fidelidade.
- Registro da aprovação: nome do revisor, data, versão da mídia e observações (campos `revisado_por/em` e `versao`, Doc 04/06).

### 10.7 Uso da Capi na interface

| Contexto | Tamanho | Regras |
|---|---|---|
| Avatar (Início, balão) | 32 / 40 / 56 dp | Estático; pode ser ocultado |
| Dica (balão) | Avatar 40 + texto | Dispensável; ≤ 140 caracteres |
| Estados vazios | 120 dp | Estática |
| Boas-vindas/celebração | ≥ 160 dp | Animação opcional e pulável |
| Demonstração | Player 4:3 | Sob demanda; fallback textual |
| **Executor (registro de série)** | — | **Capi oculta** (Doc 02 §12.1) |

Configurações do usuário (RN-11): comentários da Capi, animações, sons, demonstrações apenas sob solicitação.

## 11. Especificação de mídia

### 11.1 Demonstração de exercício (vídeo)

| Item | Especificação |
|---|---|
| Formato | MP4 (H.264, perfil Baseline/Main) + WebM (VP9) opcional |
| Resolução | 720 × 540 (4:3), 30 fps; versão 480 × 360 para dados limitados |
| Duração | Loop de 3–8 s por repetição completa |
| Tamanho | ≤ 1,5 MB (720p) e ≤ 700 KB (480p) |
| Visões | Frontal e lateral (mínimo); ¾ opcional |
| Áudio | Sem áudio obrigatório; legendas WebVTT em pt-BR opcionais |
| Miniatura | WebP ≤ 80 KB, mesma proporção |
| Nome do arquivo | `ex_{exercicio_uuid}_{tipo}_{vista}_v{n}.mp4` (`tipo`: `capi`, `humano`, `esquema`) |
| Acessibilidade | Texto alternativo + descrição passo a passo (do catálogo) |
| Cache | Pré-carga da miniatura; vídeo sob demanda; limite de cache configurável |

### 11.2 Ilustrações da Capi (UI)

WebP/PNG com alfa em 1x/2x/3x; ≤ 60 KB cada (avatar) e ≤ 150 KB (hero). Nome: `capi_{id_do_conjunto}_{variante}_v{n}.webp` (ex.: `capi_apoio_base_v1.webp`). Animações de UI (celebração) em Lottie ou vídeo curto com fallback estático; ≤ 300 KB.

### 11.3 Fluxo de revisão (ligação com o schema)

Estados do Doc 04 (`midias_exercicio.status`): `rascunho → em_revisao → aprovado | rejeitado`. Checklist do revisor:

- [ ] Posição inicial e final corretas; amplitude segura.
- [ ] Trajetória e velocidade didáticas (sem movimentos balísticos).
- [ ] Pés, mãos, coluna e ombros coerentes com a ficha de referência.
- [ ] Equipamento representado corretamente (barra, halter, polia, banco).
- [ ] Proporção da Capi não distorce o movimento (§10.6) ou há mídia complementar.
- [ ] Direitos de uso e autoria registrados.
- [ ] Texto alternativo e instruções conferem com o catálogo.

## 12. Microcopy e tom de voz

### 12.1 Princípios

Frases curtas; verbo no imperativo gentil; sem culpa, sem promessa de resultado, sem comentários sobre o corpo; erro diz **o que aconteceu**, **se os dados foram preservados** e **o que fazer** (Doc 02 §11.1).

### 12.2 Textos de referência

| Contexto | Texto |
|---|---|
| Boas-vindas | "Oi! Eu sou a Capi. Vamos organizar seu treino?" |
| Slogan | "Seu treino com mais leveza." |
| Início | "Seu treino está pronto. Vamos nessa?" |
| Executor | "Registre quando terminar. Sem pressa." |
| Descanso | "Recupere o fôlego para a próxima." |
| Fim de sessão | "Treino registrado! Seu histórico está atualizado." |
| Conquista (Fase 2) | "Você evoluiu! Continue no seu ritmo." |
| Semana sem treino | "Quando quiser voltar, seu treino estará aqui." |
| Offline | "Sem conexão. Seus registros ficam neste dispositivo e sincronizam depois." |
| Falha de sync | "Não conseguimos sincronizar agora. Seus dados estão salvos. Tentar novamente." |
| Sugestão pronta | "Preparei uma proposta para você revisar. Dá para mudar tudo antes de começar." |
| Aviso de sugestão | "Sugestão geral baseada no que você informou. Não substitui avaliação de um profissional." |
| Restrição declarada | "Pelo que você informou, vale conversar com um profissional antes de começar. Posso ajudar a montar algo mais leve para você revisar." |
| Sessão aberta | "Você tem um treino em andamento. Continuar?" |
| Exclusão de conta | "Isso encerra seu acesso agora. Veja o que acontece com seus dados antes de confirmar." |

## 13. Painel web (coach e administração)

- Bootstrap 5 com tema próprio: **claro por padrão** (tabelas densas, uso em escritório) e escuro opcional, usando os mesmos tokens.
- Mapeamento: `--bs-primary` ← `brand.dark` (botões primários em tema claro com texto branco; contraste 5,2:1 com `#FFFFFF` sobre `#447A20` — verificar no build), `--bs-body-bg` ← `bg.primary`, `--bs-body-color` ← `text.primary`, `--bs-border-color` ← `border.strong` em campos, `--bs-danger/warning/success/info` ← tokens `feedback.*` do tema.
- Capi aparece só em login, estados vazios e ajuda; **não** em telas de revisão técnica.
- Tabelas com cabeçalho fixo, filtros persistentes e estados de revisão com ícone + texto + cor (rascunho, em revisão, aprovado, publicado, rejeitado).
- Portal do coach exibe sempre o **escopo efetivo de acesso** ao lado do aluno (Doc 03 §11.1) com `OriginBadge` "Coach" e versão.

## 14. Implementação e handoff

### 14.1 Tokens no código

`08_design_tokens.json` é a fonte. No app: gerar `theme.ts` (cores por tema, tipografia, espaçamento, raios, tamanhos) e proibir hex literal por regra de lint. No painel web: gerar variáveis CSS (`--cf-*`) mapeadas para Bootstrap.

### 14.2 Estrutura sugerida de assets

```text
design/
  tokens/                  # tokens.json (cópia gerada) e gerador de tema
  capi/
    bible/                 # model sheet, expressões, paleta (fontes e PDFs)
    ui/                    # webp/png por tamanho
    animations/            # lottie / vídeos curtos
  exercises/
    media/{exercicio_uuid}/  # vídeos, miniaturas e legendas versionados
    reference/             # fichas de referência biomecânica (Doc 09)
  icons/
  docs/changelog.md
```

Mídia pesada **não** versionada no Git do código (usar storage do Doc 05 §2 com índice no banco).

### 14.3 Versionamento do design system

`v0.2` (este documento) → `v0.3` após protótipo navegável e testes de acessibilidade → `v1.0` com o model sheet aprovado. Mudança de token que afete contraste exige reexecutar `check-contrast.js` no CI.

## 15. Critérios de aceitação

| ID | Critério | Verificação |
|---|---|---|
| DS-01 | Todos os pares de tokens atendem os mínimos WCAG definidos (47 verificações em dois temas) | `node tools/design/check-contrast.js` no CI |
| DS-02 | Nenhuma tela usa hex literal | Lint do app |
| DS-03 | Campos de entrada têm contorno ≥ 3:1 em ambos os temas | Inspeção + script |
| DS-04 | `SetRow` permanece utilizável a 200% de fonte, sem corte de valores | Teste manual em iOS e Android |
| DS-05 | Alvos de toque do executor ≥ 48 dp (Android) / 44 pt (iOS), 56 dp preferido | Inspeção de layout |
| DS-06 | Capi oculta durante o registro de série e removível por configuração | Teste funcional (UX-18, CA-11) |
| DS-07 | Reduce Motion desativa transições não essenciais e animações da Capi | Teste de sistema (UX-11) |
| DS-08 | Badge de origem usa ícone + texto + cor nos três modos e dois temas | Inspeção |
| DS-09 | Nenhum texto de produto promete resultado, compara pessoas ou culpa ausência | Revisão de microcopy |
| DS-10 | Mídia de exercício só aparece após aprovação em dois níveis | Teste de API/admin (CT-71) |
| DS-11 | Nenhum arquivo de mídia excede os orçamentos do §11 | Verificação no upload do painel |

## 16. Pendências

1. Aprovar a direção da prancha com as correções D8-01 a D8-11.
2. Contratar/definir responsável pelo **model sheet** e pelo **rig** (e prazos) — dependência externa do Doc 06 §4.
3. Escolher o conjunto de ícones e confirmar a licença.
4. Definir o logotipo final após a verificação de marca (INPI, domínio, lojas).
5. Testar com usuários o tema escuro vs. claro no ambiente de academia.
6. Decidir a ferramenta de animação de UI (Lottie vs. vídeo) após prova de desempenho em aparelho de entrada.
7. Definir o fator de alongamento permitido do rig "técnico" para demonstrações (§10.6) com o profissional revisor.

## 17. Próximos documentos

- **Documento 09 — Catálogo de Exercícios e Padrões de Prescrição** (fichas de referência citadas no §10.6).
- **Documento 10 — Backlog, Roadmap por fase e Plano de Testes.**

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 21/10/2026 | Design system v0.2 (tokens claro/escuro verificados), avaliação da prancha (D8-01…D8-11), Character Bible, especificação de mídia, microcopy, handoff e critérios DS-01…DS-11 |
