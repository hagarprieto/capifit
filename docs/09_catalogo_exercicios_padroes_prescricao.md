# CapiFit — Documento 09
## Catálogo de Exercícios e Padrões de Prescrição

**Versão:** 1.0 — baseline de conteúdo e regras do motor  
**Data:** 21/10/2026  
**Status:** Proposta para validação — **todo conteúdo técnico é provisório até revisão de profissional habilitado**  
**Artefatos complementares:** `09_migration_002_catalogo.sql` e `09_seed_catalogo.sql`  
**Dependências:** Documentos 01 (§4.3, §8), 04 (modelo de dados), 06 (decisões e Migration 001), 08 (mídia da Capi)

---

## 1. Objetivo, escopo e limites

Definir **o que existe no catálogo** (taxonomia, ficha do exercício, conjunto piloto), **como o conteúdo é produzido e aprovado** e **quais padrões de prescrição** alimentam o motor de sugestões por regras (Doc 01 §8; Fase 2 do Doc 06).

**Limites importantes:**

- Este documento e o seed **não** contêm instruções de execução aprovadas. As instruções, observações de segurança, áreas de cuidado, alternativas, faixas de prescrição e modelos de treino são **propostas de engenharia/produto**. Nada é publicado ao usuário sem revisão e aprovação de profissional de Educação Física habilitado (RN-09, RG-016, RG-017).
- Os valores de prescrição (§7) são **referências iniciais conservadoras**, não prescrição individual. Sugestões continuam sendo "Sugestão do CapiFit", nunca prescrição profissional (RN-08).
- A decisão sobre quem é o **profissional revisor** e seu mandato continua pendente (Doc 06 §14).

## 2. O que muda no schema (Migration 002)

`09_migration_002_catalogo.sql` (aplicar após a Migration 001):

| Mudança | Para quê |
|---|---|
| `exercicios.padrao_movimento` (12 valores) e `composto` | O motor monta fichas por **padrão de movimento** (equilíbrio entre empurrar, puxar, agachar etc.), não por nome |
| `exercicios.convencao_carga` | Resolve a pendência de unilaterais/halteres (Doc 06 §14, item 6) — ver §6 |
| `exercicios.prioridade_motor` | Escolha **determinística** (menor valor primeiro) |
| `exercicios.onda_midia` | Ordem de produção das mídias da Capi (§8) |
| `exercicios_cuidados` (área) | O motor exclui exercícios com cuidado em área declarada como restrição (§7.4) |
| `exercicios_sinonimos` | Busca tolerante ("pulldown" encontra "Puxada na frente"); `GET /exercicios?q=` deve consultar nome **e** sinônimos |
| Triggers em `modelos_sugestao` | Modelo `aprovado` é imutável (RG-024) |

**Ordem de aplicação:** `04_schema_inicial_mysql8.sql` → `06_migration_001_reconciliacao.sql` → `09_migration_002_catalogo.sql` → `09_seed_catalogo.sql`.

**Validação executada:** os quatro scripts foram aplicados em sequência em uma MariaDB 10.4 temporária (sem erros). Verificado: 54 exercícios sem nomes duplicados, todos com grupo primário, nenhum sinônimo ambíguo, JSON dos modelos válido e rejeição de edição/exclusão de modelo aprovado. **Confirmado em MySQL 8.0.46** no CI do GitHub em 22/10/2026 (04 → 06 → 09 → seed, com as contagens esperadas).

## 3. Governança do catálogo

### 3.1 Papéis

| Papel | Responsabilidade | Perfil |
|---|---|---|
| **Curador** | Cadastro, padronização de nomes, taxonomia, busca e mídia | Admin com papel `admin` (ADM-020) |
| **Revisor técnico** | Aprova instruções, áreas de cuidado, alternativas, mídia e modelos de sugestão | Profissional de Educação Física habilitado (a definir) |
| **Produtor de mídia** | Entrega vídeos/esquemas conforme Doc 08 §11 | Equipe de animação/vídeo |

Separação de funções: quem **cadastra** não **aprova**; o aprovador fica registrado em `revisado_por/revisado_em` (e `midias_exercicio.revisado_por`).

### 3.2 Estados e transições

`rascunho → em_revisao → aprovado → publicado` (rejeição volta a `rascunho` com justificativa; `arquivado` preserva histórico). Endpoints: Doc 06 §8.5 (`enviar-revisao`, `revisar`, `publicar`).

### 3.3 Critérios de publicação (checklist do revisor)

- [ ] Nome padronizado (§4.3) e sem duplicidade/equivalência com outro exercício.
- [ ] Grupos primário e secundários, equipamento, modalidade e dificuldade corretos.
- [ ] Instruções completas (§4.2) em pt-BR, claras para iniciante.
- [ ] **Áreas de cuidado** revisadas; observações de segurança presentes.
- [ ] Convenção de carga correta (§6).
- [ ] Alternativas coerentes (mesmo padrão ou grupo; §5).
- [ ] Ao menos uma instrução textual disponível **sem mídia** (CT-72, fallback offline).
- [ ] Mídia, quando houver, aprovada pelo fluxo do Doc 08 §11.3.
- [ ] Sem promessa de resultado, sem comentário estético, sem diagnóstico.

### 3.4 Mudanças após publicação

Alteração crítica (técnica, cuidado, mídia) → nova revisão; exercício em uso histórico **nunca** é apagado fisicamente (Doc 04 §6.3). Mídia aprovada não é substituída sem novo ciclo.

## 4. Taxonomia e ficha do exercício

### 4.1 Vocabulários controlados

**Grupos musculares (16):** Peitoral · Dorsais · Deltoides anterior · Deltoides lateral · Deltoides posterior · Trapézio · Bíceps · Tríceps · Antebraço · Abdômen · Lombar · Glúteos · Quadríceps · Posteriores de coxa · Adutores · Panturrilhas.

**Equipamentos (11):** Barra livre · Halteres · Máquina · Polia · Peso corporal · Barra guiada · Barra fixa · Paralelas · Banco · Elástico · Kettlebell. (*Banco, Elástico e Kettlebell estão reservados; nenhum exercício piloto os usa como equipamento principal.*)

**Modalidade de registro** (`exercicios.modalidade`):

| Valor | Registro | Volume (Doc 04 RG-015) |
|---|---|---|
| `reps_carga` | carga × repetições | Conta |
| `reps_peso_corporal` | repetições; `carga_kg` = carga **adicional** (vazio = só o corpo) | Conta somente com carga adicional |
| `reps_assistido` | repetições; `carga_kg` = **assistência** | Não conta |
| `tempo` | duração em segundos | Não conta |

**Dificuldade (`iniciante`, `intermediario`, `avancado`)** — critério indicativo (o revisor pode reclassificar):

| Nível | Critério |
|---|---|
| iniciante | Trajetória guiada ou simples; baixa exigência de coordenação e mobilidade; execução segura com supervisão mínima |
| intermediário | Exige estabilidade, controle da trajetória ou domínio prévio de padrões básicos |
| avançado | Alta demanda técnica, mobilidade ou força prévia; maior consequência de erro |

**Padrões de movimento (12):** `empurrar_horizontal`, `empurrar_vertical`, `puxar_horizontal`, `puxar_vertical`, `agachar`, `dobradica_quadril`, `avanco`, `ponte_quadril`, `isolamento_superior`, `isolamento_inferior`, `core`, `panturrilha`.

**Áreas de cuidado (8):** ombro · cotovelo · punho · coluna_cervical · lombar · quadril · joelho · tornozelo. O cuidado indica "esta articulação/região é solicitada de modo relevante"; **não** é diagnóstico nem contraindicação.

### 4.2 Estrutura da instrução técnica

Cada exercício publicado tem texto (campo `instrucoes`) com estas seções, em linguagem simples (nível de leitura de ensino fundamental), até ~900 caracteres no total para caber no executor:

1. **Preparação** — posição, ajuste do equipamento, pegada/apoio.
2. **Execução** — passos numerados (3 a 5), com o ritmo sugerido de forma qualitativa ("controlado").
3. **Respiração** — quando inspirar e expirar.
4. **Erros comuns** — até 3, no formato "Evite…".
5. **Cuidados** — resumo das áreas de cuidado (`observacoes_seguranca`) e quando buscar orientação profissional.

Cada passo é compatível com a aba **Execução** da tela de exercício; "Músculos" vem de `exercicios_musculos`; "Dicas" de `observacoes_seguranca`.

### 4.3 Padrões de nomenclatura

- Formato: **Exercício + variação + equipamento** ("Supino inclinado com halteres").
- pt-BR, sem marca comercial, sem abreviação, sem caixa alta.
- Nomes **iguais a outro exercício, ainda que com sinônimo diferente**, não são permitidos.
- Termos populares e em inglês entram em `exercicios_sinonimos` (normalizados: minúsculas, sem acento), por exemplo `pulldown`, `hip thrust`, `leg press`.
- `nome_normalizado` é gerado pela aplicação com a mesma função usada na busca.

### 4.4 Dados que o catálogo **não** guarda (decisões)

Sem estimativa de gasto calórico, sem comparação de "melhor exercício" e sem imagens de pessoas reais sem cessão de direitos.

## 5. Catálogo piloto

### 5.1 Critérios de seleção

Cobrir os 16 grupos; incluir os padrões necessários aos modelos de sugestão (§7.3); oferecer ao menos uma opção de **máquina ou peso corporal** por padrão principal (acessível ao iniciante); mínimo de movimentos de alto risco (`avancado`); priorizar exercícios universais de academia. **Fora do piloto:** levantamentos olímpicos, exercícios balísticos, exercícios com carga sobre a cabeça em barra livre, variações de alta complexidade e qualquer movimento que dependa de equipamento raro.

### 5.2 Conjunto (54 exercícios)

Todos entram como `rascunho` no seed. **Onda** = ordem de produção da mídia da Capi (§8): 1 = primeira onda (20 exercícios), 2 = segunda.

| # | Exercício | Equipamento | Primário | Secundários | Modalidade | Dificuldade | Padrão | Onda |
|---|---|---|---|---|---|---|---|---|
| 1 | Supino reto com barra | Barra livre | Peitoral | Tríceps, Deltoides anterior | `reps_carga` | intermediario | `empurrar_horizontal` | 1 |
| 2 | Supino reto com halteres | Halteres | Peitoral | Tríceps, Deltoides anterior | `reps_carga` | iniciante | `empurrar_horizontal` | 1 |
| 3 | Supino inclinado com halteres | Halteres | Peitoral | Deltoides anterior, Tríceps | `reps_carga` | intermediario | `empurrar_horizontal` | 1 |
| 4 | Supino reto na máquina | Máquina | Peitoral | Tríceps | `reps_carga` | iniciante | `empurrar_horizontal` | 2 |
| 5 | Crucifixo na máquina | Máquina | Peitoral | Deltoides anterior | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 6 | Crossover na polia | Polia | Peitoral | Deltoides anterior | `reps_carga` | intermediario | `isolamento_superior` | 2 |
| 7 | Flexão de braços | Peso corporal | Peitoral | Tríceps, Deltoides anterior | `reps_peso_corporal` | iniciante | `empurrar_horizontal` | 1 |
| 8 | Puxada na frente | Polia | Dorsais | Bíceps, Trapézio | `reps_carga` | iniciante | `puxar_vertical` | 1 |
| 9 | Remada baixa na polia | Polia | Dorsais | Bíceps, Deltoides posterior | `reps_carga` | iniciante | `puxar_horizontal` | 1 |
| 10 | Remada curvada com barra | Barra livre | Dorsais | Bíceps, Lombar, Deltoides posterior | `reps_carga` | avancado | `puxar_horizontal` | 2 |
| 11 | Remada unilateral com halter *(unilateral)* | Halteres | Dorsais | Bíceps | `reps_carga` | iniciante | `puxar_horizontal` | 1 |
| 12 | Remada na máquina | Máquina | Dorsais | Bíceps | `reps_carga` | iniciante | `puxar_horizontal` | 2 |
| 13 | Barra fixa pronada | Barra fixa | Dorsais | Bíceps | `reps_peso_corporal` | avancado | `puxar_vertical` | 2 |
| 14 | Barra fixa assistida | Máquina | Dorsais | Bíceps | `reps_assistido` | iniciante | `puxar_vertical` | 2 |
| 15 | Desenvolvimento com halteres | Halteres | Deltoides anterior | Deltoides lateral, Tríceps | `reps_carga` | intermediario | `empurrar_vertical` | 1 |
| 16 | Desenvolvimento na máquina | Máquina | Deltoides anterior | Tríceps | `reps_carga` | iniciante | `empurrar_vertical` | 2 |
| 17 | Elevação lateral com halteres | Halteres | Deltoides lateral | Trapézio | `reps_carga` | iniciante | `isolamento_superior` | 1 |
| 18 | Elevação lateral na polia *(unilateral)* | Polia | Deltoides lateral | — | `reps_carga` | intermediario | `isolamento_superior` | 2 |
| 19 | Crucifixo inverso na máquina | Máquina | Deltoides posterior | Trapézio | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 20 | Face pull na polia | Polia | Deltoides posterior | Trapézio | `reps_carga` | intermediario | `isolamento_superior` | 2 |
| 21 | Encolhimento com halteres | Halteres | Trapézio | Antebraço | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 22 | Rosca direta com barra | Barra livre | Bíceps | Antebraço | `reps_carga` | iniciante | `isolamento_superior` | 1 |
| 23 | Rosca alternada com halteres *(unilateral)* | Halteres | Bíceps | Antebraço | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 24 | Rosca martelo | Halteres | Bíceps | Antebraço | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 25 | Rosca na polia | Polia | Bíceps | — | `reps_carga` | iniciante | `isolamento_superior` | 2 |
| 26 | Tríceps na polia com corda | Polia | Tríceps | — | `reps_carga` | iniciante | `isolamento_superior` | 1 |
| 27 | Tríceps testa com barra | Barra livre | Tríceps | — | `reps_carga` | intermediario | `isolamento_superior` | 2 |
| 28 | Tríceps francês com halter | Halteres | Tríceps | — | `reps_carga` | intermediario | `isolamento_superior` | 2 |
| 29 | Mergulho em paralelas | Paralelas | Tríceps | Peitoral, Deltoides anterior | `reps_peso_corporal` | avancado | `empurrar_vertical` | 2 |
| 30 | Mergulho assistido na máquina | Máquina | Tríceps | Peitoral | `reps_assistido` | iniciante | `empurrar_vertical` | 2 |
| 31 | Agachamento livre com barra | Barra livre | Quadríceps | Glúteos, Posteriores de coxa, Lombar | `reps_carga` | avancado | `agachar` | 1 |
| 32 | Agachamento na barra guiada | Barra guiada | Quadríceps | Glúteos | `reps_carga` | intermediario | `agachar` | 2 |
| 33 | Agachamento goblet | Halteres | Quadríceps | Glúteos | `reps_carga` | iniciante | `agachar` | 2 |
| 34 | Leg press 45° | Máquina | Quadríceps | Glúteos, Posteriores de coxa | `reps_carga` | iniciante | `agachar` | 1 |
| 35 | Cadeira extensora | Máquina | Quadríceps | — | `reps_carga` | iniciante | `isolamento_inferior` | 1 |
| 36 | Mesa flexora | Máquina | Posteriores de coxa | Panturrilhas | `reps_carga` | iniciante | `isolamento_inferior` | 1 |
| 37 | Cadeira flexora | Máquina | Posteriores de coxa | — | `reps_carga` | iniciante | `isolamento_inferior` | 2 |
| 38 | Levantamento terra romeno com halteres | Halteres | Posteriores de coxa | Glúteos, Lombar | `reps_carga` | iniciante | `dobradica_quadril` | 2 |
| 39 | Stiff com barra | Barra livre | Posteriores de coxa | Glúteos, Lombar | `reps_carga` | intermediario | `dobradica_quadril` | 1 |
| 40 | Afundo estático com halteres *(unilateral)* | Halteres | Quadríceps | Glúteos | `reps_carga` | iniciante | `avanco` | 2 |
| 41 | Avanço com halteres *(unilateral)* | Halteres | Quadríceps | Glúteos | `reps_carga` | intermediario | `avanco` | 1 |
| 42 | Agachamento búlgaro *(unilateral)* | Halteres | Quadríceps | Glúteos | `reps_carga` | avancado | `avanco` | 2 |
| 43 | Elevação pélvica com barra | Barra livre | Glúteos | Posteriores de coxa | `reps_carga` | intermediario | `ponte_quadril` | 1 |
| 44 | Elevação pélvica no solo | Peso corporal | Glúteos | Posteriores de coxa | `reps_peso_corporal` | iniciante | `ponte_quadril` | 2 |
| 45 | Cadeira abdutora | Máquina | Glúteos | — | `reps_carga` | iniciante | `isolamento_inferior` | 2 |
| 46 | Cadeira adutora | Máquina | Adutores | — | `reps_carga` | iniciante | `isolamento_inferior` | 2 |
| 47 | Panturrilha em pé na máquina | Máquina | Panturrilhas | — | `reps_carga` | iniciante | `panturrilha` | 1 |
| 48 | Panturrilha sentado na máquina | Máquina | Panturrilhas | — | `reps_carga` | iniciante | `panturrilha` | 2 |
| 49 | Abdominal no solo | Peso corporal | Abdômen | — | `reps_peso_corporal` | iniciante | `core` | 2 |
| 50 | Prancha isométrica | Peso corporal | Abdômen | Lombar, Deltoides anterior | `tempo` | iniciante | `core` | 1 |
| 51 | Elevação de pernas deitado | Peso corporal | Abdômen | — | `reps_peso_corporal` | intermediario | `core` | 2 |
| 52 | Abdominal na polia com corda | Polia | Abdômen | — | `reps_carga` | intermediario | `core` | 2 |
| 53 | Extensão lombar no banco | Peso corporal | Lombar | Glúteos, Posteriores de coxa | `reps_peso_corporal` | intermediario | `core` | 2 |
| 54 | Prancha lateral *(unilateral)* | Peso corporal | Abdômen | Glúteos | `tempo` | intermediario | `core` | 2 |

### 5.3 Cobertura por grupo e equipamento (primários)

| Grupo (primário) | Barra livre | Halteres | Máquina | Polia | Peso corporal | Outros | Total |
|---|---|---|---|---|---|---|---|
| Peitoral | 1 | 2 | 2 | 1 | 1 | — | **7** |
| Dorsais | 1 | 1 | 2 | 2 | — | 1 | **7** |
| Deltoides anterior | — | 1 | 1 | — | — | — | **2** |
| Deltoides lateral | — | 1 | — | 1 | — | — | **2** |
| Deltoides posterior | — | — | 1 | 1 | — | — | **2** |
| Trapézio | — | 1 | — | — | — | — | **1** |
| Bíceps | 1 | 2 | — | 1 | — | — | **4** |
| Tríceps | 1 | 1 | 1 | 1 | — | 1 | **5** |
| Antebraço | — | — | — | — | — | — | **0** |
| Abdômen | — | — | — | 1 | 4 | — | **5** |
| Lombar | — | — | — | — | 1 | — | **1** |
| Glúteos | 1 | — | 1 | — | 1 | — | **3** |
| Quadríceps | 1 | 4 | 2 | — | — | 1 | **8** |
| Posteriores de coxa | 1 | 1 | 2 | — | — | — | **4** |
| Adutores | — | — | 1 | — | — | — | **1** |
| Panturrilhas | — | — | 2 | — | — | — | **2** |

**Totais:** 54 exercícios, 7 unilaterais, 2 por tempo, 77 sinônimos, 106 áreas de cuidado marcadas (provisórias), 20 exercícios na onda 1.

### 5.4 Alternativas e substituição

O seed propõe **33 pares** (66 vínculos bidirecionais). Regras para uma alternativa ser válida (revisor confirma):

1. Mesmo **padrão de movimento** ou mesmo grupo primário.
2. Dificuldade da alternativa **≤** a do exercício original, ou o revisor justifica o contrário.
3. Equipamento **diferente** (a razão de existir da alternativa é trocar de aparelho).
4. Mesma **modalidade** de registro, ou aviso de conversão (ex.: `reps_assistido` ↔ `reps_peso_corporal`).
5. Cuidados da alternativa não ampliam as áreas do original sem o aviso correspondente.

A troca durante a sessão usa `POST /me/sessoes/{uuid}/exercicios/{ex}/substituir` e preserva o exercício prescrito (Doc 06 §8.1).

## 6. Convenção de carga e unilaterais (decisão)

Resolve a pendência 6 do Doc 06 §14. Cada exercício declara em `convencao_carga` **o que o número digitado significa**; o app mostra o rótulo ao lado do campo.

| `convencao_carga` | Significado | Rótulo na UI | Exercícios do piloto |
|---|---|---|---|
| `total` | Barra + anilhas | "kg (total)" | Barra livre e barra guiada |
| `por_halter` | Peso de **cada** halter | "kg por halter" | Halteres (inclui unilaterais) |
| `por_lado` | Carga de cada lado | "kg por lado" | Reservado |
| `selecao_maquina` | Valor do pino/placa | "kg (máquina)" | Máquinas e polias |
| `adicional_corporal` | Carga extra ao peso do corpo | "kg extra" | Peso corporal, barra fixa, paralelas |
| `assistencia` | Auxílio da máquina | "kg de assistência" | Assistidos |

**Unilaterais:** a série registra as repetições **por lado** (as mesmas nos dois lados). Para registrar lados diferentes, o app usa duas séries com anotação (decisão de interface para o Doc 03).

**Volume:** `carga × repetições`, **como registrado**. Não é comparável entre exercícios de convenções diferentes; a evolução compara **o mesmo exercício** entre sessões (Doc 01 §6.5). O app não soma volume de supino com halteres (por halter) com supino na barra (total) em um mesmo "volume por exercício" — somente no resumo geral da sessão, rotulado "volume total registrado" (indicador operacional).

## 7. Padrões de prescrição

> **Referências iniciais conservadoras.** Valores abaixo são o ponto de partida do motor e dos modelos; o revisor técnico pode alterá-los, e cada alteração gera nova versão do modelo e do motor (`rules-1.x`).

### 7.1 Parâmetros por objetivo

| Objetivo | Compostos | Isoladores/acessórios | Descanso (compostos / acessórios) | Esforço indicado |
|---|---|---|---|---|
| **Hipertrofia** | 3–4 séries × 8–12 | 2–3 séries × 10–15 | 90 s / 60 s | RIR 2–3 (iniciante: 3) |
| **Força** | 3–5 séries × 4–6 | 2–3 séries × 8–12 | 150 s / 90 s | RIR 2–3; sem falha |
| **Condicionamento** | 2–3 séries × 12–15 | 2 séries × 12–15 | 45 s | RIR 3+ |

- **Iniciante:** 2–3 séries por exercício e 4–6 exercícios por sessão; RIR 3; preferir máquinas, polias, halteres e peso corporal; evitar barra livre e exercícios `avancado`.
- **Volume semanal por grupo** (séries efetivas): iniciante 6–10; intermediário 10–16. Valores acima ficam fora do MVP.
- **Aquecimento:** 5 min fixos na estimativa de duração; série de aquecimento (`tipo=aquecimento`) só para o 1º composto da ficha, se o modelo pedir. Não conta no volume.
- **RIR** é opcional no registro; quando prescrito, é meta, não exigência.
- **Exercícios `tempo`:** 2–3 séries de 20–45 s (iniciante).

### 7.2 Divisões por frequência (base dos modelos)

| Dias/semana | Divisão proposta | Observação |
|---|---|---|
| 2 | Corpo inteiro A/B | Condicionamento ou hipertrofia inicial |
| 3 | Corpo inteiro A/B/C (iniciante) ou Empurrar/Puxar/Pernas (intermediário) | Distribui os padrões ao longo da semana |
| 4 | Superior/Inferior A/B | Hipertrofia ou força (intermediário) |
| 5–7 | **Fora do MVP** | Exige regras de recuperação e periodização |

### 7.3 Modelos de sugestão (6 em `rascunho` no seed)

| Código | Objetivo | Nível | Dias | Minutos | Fichas |
|---|---|---|---|---|---|
| `fullbody_3d_iniciante_hipertrofia` | hipertrofia | iniciante | 3 | 45–65 | Corpo inteiro A (6 slots); Corpo inteiro B (6 slots); Corpo inteiro C (6 slots) |
| `fullbody_2d_iniciante_condicionamento` | condicionamento | iniciante | 2 | 35–55 | Corpo inteiro A (6 slots); Corpo inteiro B (6 slots) |
| `fullbody_3d_iniciante_condicionamento` | condicionamento | iniciante | 3 | 25–45 | Corpo inteiro A (4 slots); Corpo inteiro B (4 slots); Corpo inteiro C (4 slots) |
| `upperlower_4d_intermediario_hipertrofia` | hipertrofia | intermediario | 4 | 55–75 | Superior A (6 slots); Inferior A (6 slots); Superior B (6 slots); Inferior B (6 slots) |
| `ppl_3d_intermediario_hipertrofia` | hipertrofia | intermediario | 3 | 50–70 | Empurrar (5 slots); Puxar (5 slots); Pernas (6 slots) |
| `upperlower_4d_intermediario_forca` | forca | intermediario | 4 | 60–80 | Superior A (5 slots); Inferior A (5 slots); Superior B (5 slots); Inferior B (5 slots) |

**Esquema de `estrutura_json` (`modelo-sugestao/1`):**

```json
{
  "schema": "modelo-sugestao/1",
  "fichas": [
    { "codigo": "A", "titulo": "Corpo inteiro A",
      "slots": [
        { "padrao": "agachar", "series": 3, "reps_min": 8, "reps_max": 12, "descanso_segundos": 90, "prioridade": 1 },
        { "padrao": "isolamento_superior", "grupo": "Bíceps", "series": 2, "reps_min": 10, "reps_max": 15, "descanso_segundos": 60, "prioridade": 3 }
      ] } ],
  "regras": { "rotacao_entre_fichas": true,
              "estimativa": { "aquecimento_minutos": 5, "execucao_segundos_por_serie": 40, "fator_transicao": 1.2 } }
}
```

**`minutos_min`** = duração estimada da ficha mais longa do modelo completo, arredondada para cima em múltiplos de 5; **`minutos_max`** = `minutos_min + 20` (informativo). Os valores do seed são **calculados** pela mesma fórmula do motor.

### 7.4 Algoritmo do motor `rules-1.0` (determinístico)

Entrada: `SugestaoRequest` (Doc 07) + perfil. Saída: programa em rascunho `origem=app` + justificativas. **Mesma entrada + mesma versão do motor + mesmo catálogo/modelos = mesma saída** (RG-004).

1. **Triagem de segurança** (antes de qualquer geração) — o estado vira `bloqueada` e **nenhum programa é gerado** (a UI oferece criação manual e orientação profissional) se `restricoes` indicar: dor atual, lesão recente, pós-cirúrgico, gestação, condição cardiovascular declarada ou "outra condição". Entradas obrigatórias ausentes (objetivo, nível, dias, minutos) → solicitar o dado; nunca assumir.
2. **Escolha do modelo:** `status=aprovado`, mesmo `objetivo` e `nivel`, `dias_semana` igual ao informado (se não houver, o mais próximo **menor**; nunca maior que o declarado). Sem modelo → bloquear com explicação e oferecer o editor manual.
3. **Preenchimento dos slots**, ficha a ficha e em ordem de `prioridade`: candidatos = exercícios `publicado` com o `padrao` (e `grupo` primário, se houver), `dificuldade ≤ nível`, equipamento dentro de `equipamentos_disponiveis`, fora de `evitar_exercicios_ids` e **sem `exercicios_cuidados` em área declarada como restrição**. Ordenação: `prioridade_motor`, depois `nome`. **Rotação:** se `rotacao_entre_fichas`, evitar repetir exercício já escolhido em outra ficha quando houver alternativa.
4. **Slot sem candidato:** tentar o próximo na prioridade; se nenhum, **omitir o slot** e registrar na justificativa. Se mais da metade dos slots de uma ficha for omitida → bloquear.
5. **Ajuste de tempo:** estimativa = 5 + 1,2 × Σ(séries × (40 s + descanso)) / 60. Se exceder `minutos_sessao`, remover slots de **maior valor de `prioridade`** (menos importantes) até caber; nunca reduzir abaixo de 3 exercícios por ficha.
6. **Registro:** `sugestoes_treino` com `motor_versao`, `modelo_id`, entradas e justificativas (frases de modelo, sem texto livre gerado).
7. **Revisão obrigatória:** o aluno revisa, edita e só então ativa (Doc 01 §4.3, UX-07).

**Justificativas (templates):** "Divisão em {n} dias conforme sua disponibilidade", "Escolhi {exercício} para trabalhar {grupo} usando {equipamento}", "Removi {exercício} porque você informou {restrição}" (sem expor detalhes sensíveis em logs), "Ajustei para caber em {minutos} min".

**Testes obrigatórios do motor:** reprodutibilidade (100 execuções iguais), bloqueio por restrição, respeito a equipamentos, rotação, ajuste de tempo, entrada insuficiente (CA-04-07).

### 7.5 Progressão assistida (Fase 2)

Regra de **sugestão** (nunca automática; Doc 01 §8.2–8.3):

- **Dupla progressão:** se o usuário atingir `reps_max` em **todas** as séries de trabalho, em **duas sessões consecutivas**, sem relato de dor ou fadiga e com RIR ≥ meta, sugerir aumento de carga no menor incremento disponível e **voltar a `reps_min`**.
- **Estagnação:** após 3 sessões sem melhora de carga ou repetições, sugerir revisão (técnica, descanso, volume) em vez de aumentar carga.
- **Bloqueios:** dor registrada, sessão cancelada ou muito abaixo do previsto, exercício substituído em uma das sessões.
- Toda sugestão mostra **motivo, dados usados, efeito esperado, opção de recusa** e registra quem decidiu (tabela `recomendacoes_progressao`, futura).
- Programas de coach só recebem sugestão se o coach habilitar.

## 8. Produção de mídia e conteúdo

### 8.1 Ordem

**Onda 1 (20 exercícios):** os mais usados pelos modelos iniciantes e os exibidos na prancha de conceito (supino e agachamento): supino reto com barra, supino reto e inclinado com halteres, flexão, puxada na frente, remada baixa e unilateral, desenvolvimento e elevação lateral, rosca direta, tríceps na polia, agachamento livre, leg press, extensora, mesa flexora, stiff, avanço, elevação pélvica, panturrilha em pé e prancha. **Onda 2:** os 34 restantes, por demanda de uso e revisão.

### 8.2 Pacote por exercício (para aprovação)

1. Ficha de referência biomecânica (posição inicial/final, trajetória, ângulos-chave, respiração, erros comuns).
2. Texto de instrução (§4.2) e texto alternativo da mídia.
3. Vídeo(s) conforme Doc 08 §11.1 (frontal + lateral) e mídia complementar quando exigida (Doc 08 §10.6).
4. Áreas de cuidado, alternativas e sinônimos revisados.

### 8.3 Dependências

Revisor técnico definido; equipe de mídia com rig técnico (Doc 08 §16); processo de upload com `storage_key` (Doc 07 C-09).

## 9. Critérios de aceitação

| ID | Critério | Verificação |
|---|---|---|
| CAT-01 | Todo exercício publicado tem instrução textual, grupo primário, modalidade, dificuldade, `convencao_carga` (exceto `tempo`) e áreas de cuidado revisadas | Query de conformidade + revisão |
| CAT-02 | Nenhum exercício ou mídia não aprovada aparece nas rotas públicas | CT-70, CT-71 |
| CAT-03 | Busca por sinônimo retorna o exercício correto (ex.: "pulldown", "hip thrust") | Teste de integração |
| CAT-04 | O motor, com mesma entrada e versão, gera programas idênticos | Teste de reprodutibilidade |
| CAT-05 | Entrada com restrição de risco gera `bloqueada` e **nenhum programa** | Teste do motor |
| CAT-06 | Exercício com cuidado em área restrita não é sugerido | Teste do motor |
| CAT-07 | Modelo `aprovado` não pode ser editado nem apagado (trigger) | Teste de banco (`MODEL_IMMUTABLE`) |
| CAT-08 | Toda sessão de iniciante gerada cabe em `minutos_sessao` pela fórmula do §7.4 | Teste do motor |
| CAT-09 | Nenhum nome de exercício duplicado ou ambíguo por sinônimo | Verificação do seed/CI |
| CAT-10 | Rótulo de carga exibido corresponde a `convencao_carga` | Teste de UI |
| CAT-11 | Alternativas cumprem as regras do §5.4 | Revisão do curador |

**Métricas de qualidade do catálogo (Doc 01 §14):** % de exercícios publicados com instrução e mídia aprovadas; tempo médio de revisão; % de buscas sem resultado (alimenta novos sinônimos).

## 10. Pendências

1. Definir o **profissional revisor** e o fluxo contratual (Doc 06 §14.3).
2. Revisar e aprovar: instruções, áreas de cuidado, alternativas, dificuldades e os 6 modelos (todos em `rascunho`).
3. Confirmar a triagem de segurança do §7.4 (itens que bloqueiam) com o revisor e com assessoria jurídica.
4. Decidir se unilaterais com lados diferentes terão registro nativo por lado (impacta Doc 03/07).
5. Definir quando entram 5–7 dias/semana e periodização (fora do MVP).
6. Tabela `recomendacoes_progressao` e política de dados para a Fase 2.
7. Atualizar o OpenAPI (Doc 07) para expor `padrao_movimento`, `convencao_carga` e sinônimos na busca, e a Matriz TEL→API se necessário.
8. ~~Rodar a Migration 002 e o seed em MySQL 8 real~~ — feito no CI (22/10/2026).

## 11. Próximo documento

**Documento 10 — Backlog, Roadmap por fase e Plano de Testes** (consome os critérios `CAT-*`, `CT-*`, `DS-*`, `CA-*` e `UX-*`).

---

### Registro de versão

| Versão | Data | Resumo |
|---|---|---|
| 1.0 | 21/10/2026 | Taxonomia, governança, Migration 002, catálogo piloto (54), convenção de carga, padrões de prescrição, 6 modelos em rascunho, algoritmo `rules-1.0`, progressão assistida e critérios CAT-01…CAT-11 |
