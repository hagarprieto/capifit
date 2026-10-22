# CapiFit — Documento 01
## Visão Geral do Produto e Especificação Funcional

**Projeto:** CapiFit (nome provisório)  
**Versão:** 1.0 — Documento de definição inicial  
**Data:** 21/10/2026  
**Status:** Proposta para validação  
**Tipo:** Documento de produto (PRD) e requisitos funcionais de alto nível  
**Revisão 1.1 (21/10/2026):** reconciliado pelo Documento 06 — coach definido como Fase 3 ponta a ponta, fases de entrega (§10.4) e lista de próximos documentos renumerada. Em caso de divergência, o Documento 06 prevalece.

---

## 1. Objetivo deste documento

Formalizar a visão do CapiFit, os públicos, as jornadas, os módulos e as regras de funcionamento da primeira versão de um aplicativo de musculação com três formas de criação de treinos: **pelo usuário**, **por um coach** ou **por sugestão do aplicativo**. Este documento estabelece a referência de produto para a arquitetura, a experiência de uso, o modelo de dados e o planejamento dos próximos ciclos.

**Escopo desta versão:** especificar *o que* o sistema deve fazer e os critérios para validar seu funcionamento. Implementação, telas finais, protocolos de prescrição e modelo físico da personagem serão aprofundados em documentos posteriores.

## 2. Visão do produto

O **CapiFit** será uma plataforma mobile de planejamento, execução e acompanhamento de treinos, voltada ao praticante de musculação e aos profissionais que o acompanham. O aplicativo deve permitir que um usuário comece sozinho e, sem perder seus dados, passe a receber prescrições de um coach. Também deve permitir que um usuário receba uma sugestão inicial de rotina, personalize-a e acompanhe a evolução ao longo do tempo.

### 2.1 Proposta de valor

- **Liberdade:** montar e editar treinos próprios.
- **Acompanhamento:** receber programas elaborados por profissional vinculado.
- **Facilidade:** obter sugestões estruturadas de treino a partir das informações disponíveis, com limites de segurança e transparência.
- **Praticidade:** registrar séries, pesos, repetições e descanso com poucos toques.
- **Continuidade:** preservar o histórico mesmo quando a ficha ou o responsável mudar.
- **Identidade:** utilizar uma capivara fitness, chamada provisoriamente **Capi**, para demonstrar exercícios e orientar a experiência.

### 2.2 Princípios de produto

1. **Treinar primeiro:** a execução e o registro de uma série devem ser rápidos, legíveis e funcionais.
2. **Uma estrutura, três origens:** treinos manuais, prescritos e sugeridos seguem o mesmo modelo de execução.
3. **Histórico imutável:** mudanças na ficha não alteram séries já executadas.
4. **Origem sempre visível:** o usuário deve saber quem criou ou sugeriu o programa.
5. **Segurança e autonomia:** sugestões não substituem avaliação individual; decisões sensíveis devem ser revisáveis.
6. **Capi como apoio:** a mascote ensina, demonstra e motiva, mas nunca compromete a clareza da interface.
7. **Privacidade desde o início:** coletar o mínimo de dados necessário e proteger as informações do usuário.

## 3. Público-alvo e perfis

| Perfil | Necessidade principal | Capacidades previstas |
|---|---|---|
| **Aluno / praticante** | Planejar e executar treinos | Criar fichas próprias, adotar sugestões, aceitar treinos do coach, registrar séries e consultar histórico |
| **Coach / personal trainer** | Planejar e acompanhar alunos | Criar e versionar programas, enviá-los aos alunos vinculados, visualizar evolução autorizada |
| **Administrador da plataforma** | Operar o produto | Gerenciar catálogo de exercícios, mídias, usuários, denúncias, auditoria e parâmetros gerais |
| **Curador técnico de exercícios** (função administrativa) | Garantir qualidade da demonstração | Revisar descrições, instruções, alternativas e animações antes da publicação |

**Nota de nomenclatura:** “coach” é o termo de interface proposto, mas o produto deve distinguir profissionais habilitados de contas comuns caso ofereça serviços de prescrição profissional, conforme a legislação aplicável.

### 3.1 Permissões fundamentais

- O aluno controla sua conta, seus dados e vínculos com profissionais.
- O coach só acessa dados dos alunos que aceitaram o vínculo e autorizaram os tipos de informação necessários.
- O administrador possui acesso restrito por finalidade, com trilhas de auditoria; não há acesso irrestrito por padrão a registros sensíveis.
- A revogação de vínculo encerra o acesso futuro do coach aos dados do aluno, observados registros estritamente necessários para obrigações legais e operacionais.

## 4. Três modos de montagem de treinos

### 4.1 Modo A — Criado pelo usuário

**Fluxo:** `Meus treinos → Novo programa → Definir rotina → Adicionar dias → Selecionar exercícios → Configurar séries → Revisar → Ativar`.

**Requisitos:**
- Criar programas e fichas A/B/C/D/E ou com nomes livres.
- Associar exercícios do catálogo às fichas, em ordem configurável.
- Definir séries, faixa de repetições, descanso, observações, carga de referência opcional e indicador de esforço opcional.
- Duplicar, reordenar, pausar, arquivar e versionar fichas.
- Configurar dias preferenciais sem impedir que o usuário escolha outra ficha no dia.
- Permitir alterações do programa sem modificar sessões concluídas.

### 4.2 Modo B — Criado pelo coach

**Fluxo:** `Coach cria programa → Seleciona aluno vinculado → Publica nova versão → Aluno recebe e aceita → Aluno executa → Coach acompanha`.

**Requisitos:**
- Convite e aceite explícito do vínculo coach–aluno.
- Coach elabora ou adapta programas a partir de modelos.
- Exibir autor, data de envio, número da versão e status (rascunho, publicado, aceito, substituído, arquivado).
- Aluno visualiza o programa e pode aceitá-lo ou recusá-lo.
- Alterações feitas pelo aluno devem seguir uma regra clara: **duplicação pessoal** ou **ajuste local registrado**, sem alterar silenciosamente a prescrição original.
- A cada republicação, manter histórico das versões e informar o aluno.
- Coach consulta a adesão e os resultados das sessões com autorização do aluno.

### 4.3 Modo C — Sugerido pelo aplicativo

**Fluxo:** `Gerar sugestão → Informar objetivo e disponibilidade → Responder perguntas de segurança → Visualizar proposta → Editar/aceitar → Ativar`.

**Dados de entrada iniciais:** objetivo principal, experiência declarada, número de dias semanais, tempo por sessão, equipamentos disponíveis, preferências e restrições informadas.

**Requisitos:**
- Gerar um programa inicial por regras determinísticas e modelos curados, antes da introdução de modelos de IA generativa.
- Explicar, de forma simples, por que determinada divisão e seleção de exercícios foram sugeridas.
- Permitir substituição de exercícios, alteração de ordem e edição de parâmetros.
- Identificar claramente o programa como **“Sugestão do CapiFit”**, sem atribuir prescrição a um profissional inexistente.
- Evitar sugerir automaticamente atividades incompatíveis com limitações ou sinais de risco declarados; indicar avaliação profissional quando necessário.
- Manter a versão do mecanismo de geração usada, para permitir auditoria e reprodução.

### 4.4 Regras de coexistência

- O usuário pode possuir **vários programas**, mas deve existir uma indicação clara de **programa ativo padrão**.
- Programas de diferentes origens coexistem na biblioteca do usuário.
- A origem é preservada mesmo quando o programa é duplicado (registrar origem da cópia e novo proprietário).
- A troca do programa ativo não exclui programas antigos nem apaga execuções.
- O coach não pode alterar a ficha pessoal do usuário sem uma ação explícita e autorizada.

## 5. Jornada principal do aluno

1. **Primeiro acesso:** conta, consentimentos, objetivo e preferências mínimas.
2. **Escolha da origem:** “Eu monto”, “Meu coach monta” ou “Capi sugere”.
3. **Ativação:** seleção da rotina que aparecerá no dashboard.
4. **Início da sessão:** abrir treino do dia ou escolher outra ficha.
5. **Execução:** visualizar demonstração e registrar cada série.
6. **Conclusão:** encerrar sessão e conferir resumo do treino.
7. **Evolução:** consultar desempenho, consistência e histórico.
8. **Revisão:** editar a ficha, receber nova versão do coach ou gerar outra sugestão.

### 5.1 Navegação mobile sugerida

**Abas principais:** `Início` · `Treinos` · `Evolução` · `Perfil`.

**Ações de destaque:** iniciar treino, continuar sessão aberta, acessar demonstração de exercício e registrar série concluída.

### 5.2 Estados especiais

O aplicativo deve cobrir: onboarding incompleto; nenhum programa; programa sem exercícios; sessão em andamento; conexão indisponível; sincronização pendente; conflito de versão; convite de coach pendente; perda de vínculo; mídia não disponível.

## 6. Funcionalidades por módulo

### 6.1 Cadastro, autenticação e perfil

**MVP:** cadastro/login por e-mail; recuperação de senha; perfil de treino; termos e política; logout e gestão básica da conta. **Posterior:** login social, múltiplos perfis/organizações e recursos comerciais.

### 6.2 Catálogo de exercícios

**MVP:** nome, identificador, grupos musculares, equipamentos, instruções, cuidados, dificuldade indicativa, alternativas e mídia demonstrativa; busca por nome e filtros por músculo/equipamento.

**Regras:** catálogo com publicação revisada; exercício desativado permanece referenciável em históricos; mídias com identificação de versão e atribuição quando aplicável.

### 6.3 Programas e fichas

**MVP:** criar, editar, duplicar, versionar, ativar, arquivar, organizar exercícios e configurar prescrição de séries.

**Evoluções:** superséries, dropsets, circuitos, tempo de execução, periodização, semanas e modelos compartilháveis.

### 6.4 Sessões e registros

**MVP:** iniciar/pausar/finalizar sessão; carregar prescrição como referência; registrar repetições e carga executadas por série; marcar concluída; incluir/remover séries de execução; consultar dados da sessão anterior; temporizador de descanso; resumo final.

**Regras:** data/hora de início e fim; carga registrada na unidade preferida, armazenada em unidade normalizada; série não concluída não entra no volume realizado; corrigir erro após encerramento apenas com trilha de edição; proteção contra dupla sincronização.

### 6.5 Histórico e indicadores

**MVP:** calendário ou lista de sessões, histórico de cada exercício, total de sessões, séries e volume indicativo.

**Posterior:** recordes pessoais, tendências, constância, gráficos e avaliação por período. O volume calculado (`séries × repetições × carga`) é uma métrica operacional, não um indicador isolado de qualidade ou resultado físico.

### 6.6 Portal do coach

**MVP estendido após núcleo individual:** cadastro de coach, convite e aceite de aluno, criação de programas para vinculados, envio de versões, visualização dos registros autorizados.

**Posterior:** templates por objetivo, relatórios por aluno, mensagens, grupos, controle de assinatura e planos.

### 6.7 Gerador de sugestões

**MVP:** questionário simples, biblioteca de modelos curados, regras de seleção, explicação da sugestão, edição antes da ativação.

**Posterior:** recomendações baseadas no histórico, preferências, equipamento disponível e feedback do usuário, com critérios auditáveis e supervisão técnica.

## 7. Mascote Capi — componente oficial da experiência

### 7.1 Identidade

**Nome provisório:** Capi. **Espécie:** capivara antropomórfica fitness. **Personalidade:** simpática, persistente, acolhedora, confiante e bem-humorada, sem tom moralista. **Identidade visual proposta:** personagem 3D estilizada, aparência atlética, roupas esportivas com marca, proporções consistentes e expressões reconhecíveis.

**Não é permitido:** usar a mascote para ridicularizar o corpo do usuário, incentivar treinar lesionado, afirmar resultados garantidos ou substituir orientação profissional quando necessária.

### 7.2 Papéis da personagem

| Papel | Uso | Prioridade |
|---|---|---|
| **Mascote de marca** | Onboarding, tela inicial, comunicações e estados vazios | MVP |
| **Guia de interface** | Mensagens de ajuda e contexto | MVP, discreto |
| **Demonstração de exercícios** | Exibir execução e detalhes técnicos | MVP com catálogo piloto |
| **Comemorações** | Treino concluído, marcos e consistência | Fase 2 |
| **Assistente conversacional** | Dúvidas sobre o uso e organização do treino | Futuro, escopo controlado |

### 7.3 Pipeline de animação

1. Criar *character bible*: vistas frontal, lateral e traseira, proporções, roupas, cores, expressões e padrões de movimento.
2. Construir **modelo 3D mestre** e esqueleto articulado (*rigging*).
3. Produzir animações reutilizáveis por exercício, com ângulos adequados.
4. Submeter movimentos à revisão de profissional habilitado e documentar aprovação.
5. Exportar arquivos leves para mobile; no MVP, preferir vídeo curto em loop e imagem de fallback.
6. Versionar cada mídia por exercício, incluindo data, autor e status de revisão.

**Requisito de segurança:** as proporções antropomórficas não devem distorcer instruções biomecânicas. Quando a fidelidade do movimento for insuficiente, oferecer referência complementar revisada (ex.: vídeo humano ou esquema anatômico). A Capi jamais deve ser a única explicação de um movimento complexo sem revisão.

### 7.4 Diretrizes de UX da mascote

- Mensagens curtas e dispensáveis; nunca interromper o registro de séries.
- Reduzir animações durante exercício; respeitar configurações de acessibilidade e redução de movimento.
- Não incentivar excesso de esforço nem tratar descanso como fracasso.
- Permitir ocultar dicas e sons da personagem.

## 8. Motor de sugestão e progressão

### 8.1 Geração inicial

No MVP, o sistema utiliza combinações **curadas e determinísticas** de objetivos, dias, duração, experiência e equipamentos. A geração deve ser reproduzível e explicável. A ficha gerada é uma proposta editável, não um diagnóstico nem prescrição profissional individualizada.

### 8.2 Progressão assistida — posterior

Exemplo conceitual de regra: para meta de 3 × 8–12 repetições, o sistema pode **propor revisão ou progressão** quando houver registro consistente no topo da faixa com execução adequada; não elevar automaticamente a carga sem confirmação. Feedback de dor, fadiga, recuperação e técnica pode bloquear a sugestão.

### 8.3 Separação entre recomendação e decisão

Toda mudança sugerida deverá apresentar: **motivo**, **dados utilizados**, **efeito pretendido**, **opção de recusa** e **quem aprovou a alteração**. Programas elaborados pelo coach exigem política própria para propostas de ajuste pelo sistema.

## 9. Regras de negócio transversais

**RN-01:** todo programa possui proprietário, origem e versão.  
**RN-02:** sessões e séries realizadas guardam uma fotografia da prescrição vigente no momento do início.  
**RN-03:** não sobrescrever versões publicadas de programas do coach.  
**RN-04:** uma sessão em andamento deve ser recuperável após fechamento inesperado do app.  
**RN-05:** sincronização offline deve ser idempotente e resolver conflitos sem apagar registros silenciosamente.  
**RN-06:** qualquer compartilhamento coach–aluno requer vínculo e autorização.  
**RN-07:** o usuário consegue exportar seus dados e solicitar exclusão conforme regras legais e política de retenção.  
**RN-08:** sugestões de treinamento exibem origem e não são apresentadas como prescrição profissional.  
**RN-09:** o catálogo de animações só publica demonstrações aprovadas.  
**RN-10:** medidas, registros corporais e eventuais dados de saúde têm acesso restrito e finalidade definida.  
**RN-11:** configurações de acessibilidade e preferência de mídia persistem por usuário.  
**RN-12:** um mesmo usuário pode assumir o papel de aluno e coach mediante habilitação apropriada, sem misturar permissões.

## 10. Escopo de lançamento (MVP)

### 10.1 Incluído

- Aplicativo mobile Android e iOS.
- Conta, perfil, objetivo, disponibilidade e equipamentos.
- Catálogo inicial **curado** de exercícios, com conteúdo e mídia demonstrativa.
- Mascote Capi nos pontos principais e demonstrações de exercícios selecionados.
- Criação manual de programas e fichas.
- Sugestões por modelos curados com edição antes da ativação.
- Execução de sessões, séries, cargas, repetições e temporizador de descanso.
- Histórico e indicadores simples.
- Registro local com sincronização segura quando a conexão voltar.
- Painel administrativo para catálogo, mídias, usuários e moderação básica.
- **Coach ponta a ponta na Fase 3 do MVP** (vínculo → prescrição → aceite explícito → execução → acompanhamento autorizado), conforme Documento 06. O modelo de dados e os contratos de API já nascem prontos na Fase 1; não lançar apenas uma tela incompleta de coach. Relatórios avançados ficam fora do MVP.
- **Treino avulso** (sessão sem ficha) e substituição de exercício durante a sessão.

### 10.2 Fora do MVP

- IA generativa autônoma para prescrever exercícios.
- Análise automática de postura pela câmera.
- Rede social, ranking público e gamificação competitiva.
- Marketplace de coaches.
- Cobrança recorrente e divisão de receita.
- Integração com wearables.
- Chat clínico ou substituição de atendimento profissional.
- Renderização 3D em tempo real para todo o catálogo (vídeos pré-renderizados são suficientes inicialmente).

### 10.3 Critério de recorte

Se prazo ou orçamento exigirem redução: priorizar **catálogo → montagem manual → execução → histórico → sugestões curadas → fluxo mínimo coach**. A mascote deve aparecer desde o primeiro lançamento, mas o volume de animações pode crescer progressivamente.

### 10.4 Fases de entrega

| Fase | Conteúdo |
|---|---|
| **1 — Núcleo individual** | Conta e consentimentos, perfil, catálogo piloto (≈40–60 exercícios), programa manual com versões, execução (incl. avulso, substituição, pausa), persistência local da sessão e sincronização idempotente, histórico, exclusão/exportação de conta, painel admin de catálogo e mídia |
| **2 — Sugestões e conforto** | Motor de sugestão com modelos curados aprovados por profissional habilitado, exercício personalizado, sync incremental, evolução por exercício, notificações opt-in |
| **3 — Coach ponta a ponta** | Verificação de profissional, convites, prescrição, aceite, acompanhamento e portal do coach |

Detalhes e dependências externas: Documento 06, §4.

## 11. Requisitos não funcionais

- **Plataformas:** React Native + Expo; backend PHP 8.x com API REST; MySQL 8.x; painel web em Bootstrap 5 (tecnologias propostas).
- **Autenticação:** sessões seguras, credenciais armazenadas com hash robusto, tokens protegidos, renovação/revogação e autorização por recurso.
- **Dados:** acesso via consultas parametrizadas; criptografia em trânsito; proteção e backup das bases e dos arquivos.
- **Offline:** registrar sessões sem conexão e sincronizar posteriormente com identificadores únicos.
- **Desempenho:** registrar uma série com interação curta, sem depender de streaming; cache das mídias mais usadas.
- **Acessibilidade:** contraste, tamanho de toque, textos ajustáveis, legendas e opção de reduzir movimento.
- **Observabilidade:** logs técnicos sem expor dados pessoais indevidos; métricas de erro e sincronização.
- **Privacidade/LGPD:** finalidade, minimização, base legal apropriada, transparência, direitos do titular, retenção e gestão de incidentes. Dados de saúde, quando coletados, exigem cuidado adicional por serem sensíveis.
- **Propriedade intelectual:** manter direitos e licenças sobre modelo, rig, animações, sons e elementos de marca; pesquisar disponibilidade do nome CapiFit antes do lançamento.

## 12. Arquitetura funcional (alto nível)

```text
Aplicativo React Native / Expo
  ├── Onboarding e autenticação
  ├── Biblioteca de exercícios e mídias
  ├── Montagem de programas (manual / sugestão / coach)
  ├── Execução de sessão e temporizador
  ├── Histórico e evolução
  └── Persistência local / sincronização
                  │
               API REST
                  │
Backend PHP 8.x ── Serviços de domínio
  ├── Identidade e permissões
  ├── Catálogo e conteúdo técnico
  ├── Programas, versões e vínculos
  ├── Sessões, séries e indicadores
  ├── Motor de sugestões curadas
  └── Auditoria e notificações
                  │
       MySQL 8 + Storage de mídia
                  │
Painel web de administração e coach
```

A arquitetura detalhada, incluindo endpoints, diagrama de dados e contratos de sincronização, será definida posteriormente.

## 13. Entidades conceituais principais

- `usuarios`, `perfis_treinamento`, `profissionais`, `vinculos_coach_aluno`;
- `exercicios`, `grupos_musculares`, `equipamentos`, `exercicios_grupos`, `midias_exercicio`;
- `programas_treino`, `versoes_programa`, `treinos`, `treino_exercicios`, `prescricoes_series`;
- `sessoes_treino`, `series_executadas`, `eventos_sincronizacao`;
- `modelos_sugestao`, `geracoes_programa`, `logs_auditoria`.

**Observação:** os nomes e campos acima são preliminares; o esquema oficial está no Documento 04 (`04_schema_inicial_mysql8.sql`) mais a Migration 001 do Documento 06 (ex.: `series_executadas` → `sessoes_series`; `treinos` → `fichas_treino`; `prescricoes_series` → `series_prescritas`). A modelagem deve separar prescrição, instância da sessão e execução de cada série.

## 14. Métricas de sucesso

| Indicador | Definição |
|---|---|
| Ativação | % dos novos usuários que criam ou aceitam um programa e concluem a primeira sessão |
| Tempo até o primeiro treino | Tempo entre cadastro e primeira sessão finalizada |
| Registro de séries | % de sessões com séries registradas, em vez de apenas marcadas como realizadas |
| Retenção | Usuários que voltam a executar treinos em períodos definidos |
| Conclusão de sessões | Relação entre sessões iniciadas e concluídas |
| Adoção por origem | Proporção de programas manuais, sugeridos e publicados por coach |
| Qualidade do catálogo | Exercícios disponíveis com conteúdo e mídia tecnicamente revisados |
| Confiabilidade offline | % de sessões sincronizadas sem perda ou duplicação |

As metas numéricas deverão ser fixadas depois de testes com usuários, não inventadas antecipadamente.

## 15. Critérios de aceitação do MVP

- **CA-01:** um usuário consegue cadastrar-se, criar uma ficha com ao menos dois exercícios e ativá-la.
- **CA-02:** uma sessão registra carga, repetições e conclusão de cada série e gera histórico consultável.
- **CA-03:** a edição de uma ficha não altera o conteúdo de sessões passadas.
- **CA-04:** um usuário pode gerar uma proposta de programa, revisá-la, alterá-la e ativá-la.
- **CA-05:** a origem da ficha é exibida e permanece rastreável.
- **CA-06:** um coach autorizado consegue enviar uma ficha e o aluno consegue aceitá-la sem perder fichas existentes.
- **CA-07:** a perda temporária de conexão não elimina registros da sessão.
- **CA-08:** o catálogo possui demonstrações revisadas; indisponibilidade do vídeo não impede o registro.
- **CA-09:** o usuário consegue consultar sua sessão anterior e o histórico do exercício.
- **CA-10:** nenhum coach consegue visualizar dados de um usuário sem vínculo e permissões adequadas.
- **CA-11:** funções essenciais de registrar séries e finalizar sessão podem ser usadas sem animações da mascote.
- **CA-12:** acessibilidade e opção de reduzir movimentos estão disponíveis nas interfaces relevantes.

## 16. Riscos, dependências e decisões em aberto

| Tema | Risco ou decisão | Tratamento proposto |
|---|---|---|
| Demonstração biomecânica | Corpo antropomórfico pode representar movimentos incorretamente | Revisão técnica e mídia complementar quando necessário |
| Qualidade do catálogo | Alto custo de produzir animações para todos os exercícios | Catálogo piloto prioritário, expansão por demanda |
| Segurança da sugestão | Programa inadequado ao perfil ou às restrições | Regras curadas, triagem e limites claros |
| Prescrição profissional | Necessidade de cumprir regulamentação aplicável | Validar requisitos legais e credenciais antes do lançamento comercial |
| Offline | Conflitos ou duplicidade de séries | IDs únicos, sincronização idempotente, auditoria |
| Privacidade | Compartilhamento não autorizado de dados corporais | Consentimentos/autorização por vínculo, segregação e registro de acesso |
| Marca | Nome CapiFit pode não estar disponível | Verificação de INPI, domínio e lojas antes da decisão final |
| Monetização | Escopo de planos não validado | Adiar assinatura até validar retenção e valor para coaches |

### 16.1 Perguntas de produto para a próxima versão

1. Coaches serão profissionais verificados desde o MVP ou o primeiro piloto será fechado e supervisionado?
2. Quais objetivos serão atendidos na sugestão inicial e quais ficarão fora do escopo?
3. Qual será o conjunto piloto de exercícios que receberá animações da Capi?
4. Haverá prescrição detalhada de carga, RIR e intensidade no MVP ou apenas metas simples?
5. O aluno poderá compartilhar notas e medidas corporais com o coach separadamente do histórico do treino?
6. Quais parâmetros serão livremente editáveis em uma ficha recebida de um coach?
7. Quais métricas serão exibidas no dashboard inicial para não sobrecarregar o usuário?

## 17. Próximos documentos recomendados

**Já produzidos:** Documento 02 (Personas, Jornadas e Fluxos), 03 (Arquitetura de Informação e Telas), 04 (Modelagem de Dados e DDL), 05 (Arquitetura e Contratos da API REST), 06 (Reconciliação, Decisões e Migration 001) e 07 (OpenAPI 3.1 e Testes de Contrato).

**Também produzidos:** Documento 08 (Design System e Character Bible da Capi), 09 (Catálogo de Exercícios e Padrões de Prescrição) e 10 (Backlog, Roadmap por fase e Plano de Testes). A série planejada (02–10) está completa; o próximo passo é executar o marco M0 do Documento 10.

## 18. Definição de pronto desta etapa

O Documento 01 estará validado quando houver concordância sobre: **modelo híbrido**, **perfis e permissões**, **regras de origem/versionamento**, **funções da Capi**, **escopo do MVP** e **riscos prioritários**. Após essa validação, o projeto pode seguir para fluxos de navegação e modelagem detalhada sem decisões contraditórias.

---

**Fim do Documento 01 — CapiFit.**
