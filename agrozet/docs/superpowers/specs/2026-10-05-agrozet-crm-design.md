# CRM Agrozet — Design

**Data:** 2026-10-05
**Status:** Aprovado
**Origem:** derivado do `mar-azul-system` (35.141 linhas, 298 migrations), reconstruído enxuto.

## Objetivo

CRM de atendimento WhatsApp para o **Pet Shop Agrozet** (banho e tosa, rações,
agropecuária — Segismundo Pereira, Uberlândia). Um número de WhatsApp na API
oficial da Meta, atendido por humanos, com um **bot de botão** que faz a triagem
inicial: o cliente escolhe o serviço num menu de botões, recebe uma resposta
pronta e cai na fila do atendente já etiquetado pelo assunto.

**Fora de escopo:** relatórios, dashboards analíticos, cobrança, copiloto de IA,
bridge de Telegram, múltiplas instâncias de número, gravação/envio de áudio.

## Decisões aprovadas

| # | Decisão | Consequência |
|---|---|---|
| 1 | Bot = menu de serviços -> resposta pronta -> passa pro atendente com etiqueta | Sem sub-fluxos, sem coleta de CPF, sem agendamento no bot |
| 2 | **Um número**, todos os atendentes veem todas as conversas | Mata `phone_instances`, RLS por instância, transferência de conversa, dashboard por operadora |
| 3 | Disparo agendado por **seleção manual** na tela de clientes | Sem RPC de reativação, sem caps de rampa, sem supressão |
| 4 | Menu do bot **editável em tela de admin** (tabela no Supabase) | Tabelas `bot_config` + `bot_opcoes`, tela de CRUD, validação dos limites da Meta em dois pontos |
| 5 | Cadastro = cliente **+ pets** | Tabelas `clientes` e `pets`; sem histórico de serviços na Fase 1 |
| 6 | Hospedagem **Vercel Hobby** + **Supabase free**, assumindo o risco de termos | Cron sai do Vercel (limite de 1x/dia) e vira `pg_cron` no Supabase |
| 7 | Projeto **novo** importando peças do Mar Azul, não cópia podada | Schema próprio em 1 migration; nada de código morto |

### Por que projeto novo e não cópia (decisão 7)

A peça cortada na decisão 2 — `phone_instances` — aparece em **40 arquivos** entre
código e SQL, e o isolamento por `phone_id` está tecido **dentro** das funções que
seriam reaproveitadas (`listar_conversas`, `contar_conversas`, `fila_atendimento`,
policies de `messages`). Arrancar isso custa mais que reescrever as três funções
que sobram. Monorepo com pacote compartilhado foi descartado como abstração
antecipada para dois produtos que vão divergir (promotora de crédito x petshop).

## Restrições de plataforma (pesquisadas, não presumidas)

**Vercel Hobby:** cron roda **no máximo 1x por dia**; expressão mais frequente
falha no *deploy*, não em runtime. Termos restringem a plano pessoal/não-comercial
— risco assumido na decisão 6 e registrado aqui para a rota de saída (Pro, ou
Cloudflare/Netlify que permitem uso comercial no free).

**Supabase free:** 500 MB de banco, 1 GB de Storage, 5 GB de egress/mês, 50k MAU,
2 projetos ativos, **pausa após 1 semana de inatividade**.

**Meta Cloud API:** cobrança por mensagem. A partir de 01/10/2026 cada número tem
1.000 mensagens de serviço grátis/mês (sem acumular) e o excedente é cobrado;
template de marketing é cobrado em toda entrega. **Todo disparo agendado tem custo
por mensagem** — não é problema de código, é expectativa a alinhar com o cliente.

**Reply buttons:** máximo **3** por mensagem interativa. Acima disso a Meta exige
`interactive list` (até 10 itens). Ver "Botões x lista".

## Estratégia de capacidade (o "não lotar a memória")

O gargalo **não é o banco**: uma linha de mensagem de texto é ~400 bytes, logo
500 MB cabem ~1,2 milhão de mensagens; 100 mensagens/dia gastam 36 mil/ano.
O gargalo é **Storage (1 GB)** e **egress (5 GB/mês)**, por causa de mídia.

1. **Comprimir na entrada.** Imagem recebida passa por `sharp`: redimensiona para
   no máximo 1280px no maior lado e grava **WebP q80**. Foto de celular de 3 MB
   cai para ~60–120 KB (fator ~25x). Áudio (ogg/opus) é gravado como veio — já é
   pequeno (~1 KB/s) e recodificar exigiria ffmpeg, que fica fora do projeto.
2. **Purgar com retenção.** Job diário apaga **arquivo** de mídia com mais de
   **90 dias** (a linha de `messages` fica, com `media_path` nulo e a UI
   mostrando "mídia expirada") e **linhas** de `messages` com mais de **2 anos**.
3. **Não guardar payload cru** do webhook. Só os campos que a UI consome.
4. **Egress:** a lista de conversas nunca baixa imagem (só o rótulo "Foto");
   a mídia é buscada no clique, via URL assinada de 7 dias para o browser cachear.

### Anti-pausa + cron, numa tacada

`pg_cron` + `pg_net` **dentro do Supabase**, com o `CRON_SECRET` no Vault:

| Job | Frequência | Faz |
|---|---|---|
| `processa_disparos` | `*/5 * * * *` | `POST /api/cron/process-disparos` |
| `retencao` | `0 7 * * *` (04:00 BRT) | `POST /api/cron/retencao` |

O job de 5 minutos resolve o limite de 1x/dia do Vercel **e** garante atividade
contínua no Supabase, impedindo a pausa por inatividade. O `vercel.json` **não
declara crons** — declarar um mais frequente que diário quebra o deploy.

## Arquitetura

```
Cliente WhatsApp
      |
      v
Meta Cloud API v22.0 --webhook--> /api/webhook --> bot.ts (puro)
      ^                               |               |
      |                               v               v
      +---sendInteractive/Text---  messages      clientes.bot_stage
                                  (Supabase)
                                      ^
Atendente --> /conversas -------------+
          --> /clientes --> clientes + pets
          --> /disparos --> scheduled_disparos
                                 ^
Supabase pg_cron --> /api/cron/process-disparos --> Meta (template)
                 --> /api/cron/retencao
```

### Stack

Next.js 16.2.6 (App Router) · React 19.2.4 · TypeScript 5 · Tailwind 4 ·
Base UI (`@base-ui/react`, **sem `asChild`**) · TanStack Query 5 ·
Supabase (Auth + Postgres + Storage) · `sharp` · Zod · Vitest.

**Sem** `ffmpeg`/`fluent-ffmpeg`, `dnd-kit`, LLM, Telegram.

### Variável de ambiente que não admite erro

`META_TOKEN` é **server-only**. Com o prefixo `NEXT_PUBLIC_` o Next.js inlina o
valor no bundle do browser e publica o token do WhatsApp Business. Nunca
reintroduzir o prefixo nessa variável.

| Variável | Onde |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | server |
| `META_TOKEN` | **server-only** |
| `NEXT_PUBLIC_META_PHONE_ID`, `META_WABA_ID` | phone id público, WABA server |
| `META_VERIFY_TOKEN`, `META_APP_SECRET` | server (handshake e assinatura) |
| `CRON_SECRET` | server + Vault do Supabase |

## Modelo de dados — 1 migration

```sql
-- clientes: 1 linha por telefone canônico (wa_id da Meta)
clientes(id uuid pk, phone text unique not null, nome text,
         ultimo_servico text,              -- botao_id escolhido no bot
         bot_stage text,                   -- null | awaiting_choice | done
         observacoes text,
         primeiro_contato_at timestamptz, ultima_interacao_at timestamptz,
         created_at, updated_at)

pets(id uuid pk, cliente_id uuid fk->clientes on delete cascade,
     nome text not null, especie text, porte text, raca text,
     created_at, updated_at)

messages(id uuid pk, message_id text unique not null,   -- id da Meta: idempotência
         phone text not null, direction text not null,  -- inbound | outbound
         content text, message_type text not null,      -- text|image|audio|document|interactive|template
         media_path text, media_mime text,
         delivery_status text,                           -- sent|delivered|read|failed
         campaign_id text,
         created_at timestamptz not null default now())

bot_config(id int pk check (id = 1),                     -- singleton
           ativo boolean not null default true,
           saudacao text not null, rodape text,
           fecho text not null,                          -- apos a escolha
           updated_at)

bot_opcoes(id uuid pk, ordem int not null,
           botao_id text unique not null,                -- slug estavel; grava em ultimo_servico
           titulo text not null,                         -- <= 20 chars (limite Meta)
           resposta text not null,                       -- <= 1024 chars
           ativo boolean not null default true,
           updated_at)

scheduled_disparos(id uuid pk, phone text not null, cliente_id uuid fk,
                   template_name text not null, template_lang text not null,
                   components jsonb, scheduled_for timestamptz not null,
                   status text not null default 'pending',  -- pending|processing|sent|failed|canceled
                   campaign_id text, message_id text, error text,
                   attempts int not null default 0,
                   created_at, sent_at)

blocked_numbers(phone text pk, motivo text, created_at)

operational_errors(id uuid pk, origem text not null, mensagem text not null,
                   contexto jsonb, created_at)
```

**Índices:** `messages(phone, created_at desc)`, `messages(created_at)` (retenção),
`scheduled_disparos(status, scheduled_for)`, `clientes(ultima_interacao_at desc)`,
`pets(cliente_id)`.

### RLS — simples por construção da decisão 2

- `clientes`, `pets`, `messages`, `bot_config`, `bot_opcoes`, `scheduled_disparos`,
  `blocked_numbers`: **SELECT** para qualquer usuário autenticado.
- **INSERT/UPDATE/DELETE** em `clientes`, `pets`, `messages`, `scheduled_disparos`:
  autenticado. Em `bot_config`/`bot_opcoes`: **só `admin`**.
- `operational_errors`: SELECT só `admin`; INSERT só `service_role`.
- Webhook e crons escrevem com `service_role`, fora do RLS.
- `admin` = papel `admin` no `user_metadata` do JWT, encapsulado na função
  `is_admin()` com `search_path` fixado.

**Usuário nunca é criado por INSERT em `auth.users`.** Dashboard -> Authentication
-> Users -> Add user. (Lição herdada do Mar Azul.)

### Trigger: `messages` é o dono do cadastro base

`AFTER INSERT ON messages` -> `sync_cliente_from_message()`: para
`direction='inbound'`, faz upsert em `clientes` por `phone` preenchendo o nome
com **`COALESCE(clientes.nome, EXCLUDED.nome)`** e
`ultima_interacao_at = GREATEST(...)`.

O `COALESCE` nessa ordem é deliberado: preenche o nome só enquanto está nulo,
depois fica fixo. Invertido, cada mensagem nova reverteria um nome corrigido à
mão pelo atendente para o nome de exibição do WhatsApp. **O webhook não faz
upsert de cliente** — um segundo escritor foi exatamente a causa do clobber no
Mar Azul.

## O bot de botão — `src/lib/bot.ts`

Lógica **pura**, sem I/O, inteiramente testável. O webhook executa a decisão.

### Fluxo

| Situação | Ação | `bot_stage` resultante | Resposta |
|---|---|---|---|
| Contato novo (sem cliente) e bot ativo | `start` | `awaiting_choice` | saudação + menu |
| `awaiting_choice` + `button_reply`/`list_reply` com `botao_id` conhecido | `capture_choice` (grava `ultimo_servico`) | `done` | resposta da opção + fecho |
| `awaiting_choice` + texto livre, 1a vez | `remenu` | `awaiting_choice` | menu de novo |
| `awaiting_choice` + texto livre, 2a vez | `giveup` | `done` | — (silêncio; humano assume) |
| `awaiting_choice` + `botao_id` desconhecido | `remenu` | `awaiting_choice` | menu de novo |
| `bot_stage='done'` ou nulo em contato existente | `none` | — | — |
| `bot_config.ativo = false` | `none` | — | — |

Mídia (foto/áudio) com `bot_stage='awaiting_choice'` é tratada como texto livre:
alguém que manda foto do pet quer falar com gente. Vai pro caminho
`remenu`/`giveup`, nunca trava.

**"1a vez" x "2a vez" é contado**, não inferido do estado: `decidirBot` recebe
`menusEnviadosNaUltimaHora` (quantas mensagens `outbound` de `message_type`
`interactive` saíram para este telefone na última hora). Zero ou um -> `remenu`;
dois ou mais -> `giveup`. Sem esse contador explícito, "texto livre de novo" e
"texto livre a primeira vez" seriam indistinguíveis, já que ambos têm
`bot_stage='awaiting_choice'`.

### Duas guardas copiadas do Mar Azul (ambas pagas com sangue lá)

**Teto de 6 respostas do bot por telefone por hora.** O fluxo completo gasta 2;
o resto é folga. Existe por causa de robô-a-robô: no Mar Azul um bot alheio
respondeu cada mensagem automática com o próprio menu e os dois trocaram 182
mensagens em 7 minutos. Acima do teto o bot fica **mudo**; a mensagem continua
gravada e o atendente vê a conversa normalmente.

**Janela de leitura de 10 segundos.** Resposta inválida que chega menos de 10 s
depois da última fala do bot foi escrita antes de o cliente ler o menu — o bot
cala, porque o menu já está na tela. De quebra, robô que responde em segundos
deixa de receber resposta.

### Botões x lista

`montarMenu(opcoes)` decide o formato pela quantidade de opções **ativas**:

- **1–3 ativas** -> `interactive` tipo `button` (reply buttons).
- **4–10 ativas** -> `interactive` tipo `list` (uma seção, "Ver serviços").
- **0 ativas** -> bot não responde (`none`); erro operacional registrado.
- **>10 ativas** -> usa as 10 primeiras por `ordem` e registra erro operacional.

Isso existe porque a decisão 4 deixa o menu editável: um admin pode cadastrar a
4a opção, e a Meta **recusa** a mensagem com 4 reply buttons. Sem esse degrau, o
cliente ficaria sem resposta nenhuma.

### Validação dos limites da Meta, nos dois lados

| Limite | Valor | Onde é validado |
|---|---|---|
| Título do botão | 20 chars | Zod no formulário **e** antes do envio |
| Corpo da mensagem | 1024 chars | idem |
| Rodapé | 60 chars | idem |
| Reply buttons | 3 | `montarMenu` escolhe `list` acima disso |
| Itens de lista | 10 | `montarMenu` trunca + erro operacional |

Validar só no formulário não basta: a linha pode ter entrado por SQL ou por uma
versão anterior da tela. Estourar o limite na Meta não dá erro de validação
amigável — dá mensagem não entregue, e o cliente fica sem resposta.

## Webhook — `src/app/api/webhook/route.ts` (~300 linhas)

`GET`: handshake da Meta (`hub.mode=subscribe` + `hub.verify_token`).

`POST`, nesta ordem (sequenciado, **não** `Promise.all`):

1. **Verifica `X-Hub-Signature-256`** (HMAC-SHA256 do corpo bruto, comparação em
   tempo constante) contra `META_APP_SECRET`. A URL do webhook não é secreta —
   sem isso o endpoint é forjável e escreve no banco com `service_role`.
2. Normaliza o telefone: o **`wa_id`** da Meta é a identidade canônica. O 9o
   dígito do cadastro divergiu do WhatsApp em 32 de 50 disparos no Mar Azul;
   usar o número enviado em vez do `wa_id` racha a conversa em dois cards.
3. Trata `statuses[]` -> atualiza `delivery_status` da mensagem.
4. Upsert em `messages` com `ignoreDuplicates` e `select('id')` —
   **array vazio = webhook repetido da Meta** -> encerra sem nenhum efeito de bot.
   Esse é o gate de idempotência; sem ele a Meta reentrega e o bot responde duas vezes.
5. Carrega cliente (`phone, bot_stage, nome`) e as contagens das guardas.
6. `decidirBot(...)` -> aplica a transição com **update condicional** (igualdade
   no `bot_stage` esperado), defesa extra contra reentrância.
7. Se houver resposta: envia pela Meta e grava o `outbound` com o `message_id`
   retornado (com fallback para um uuid local).
8. Mídia inbound: baixa da Meta, comprime, grava no Storage, preenche `media_path`.

**Erro não-fatal nunca aborta o webhook.** Vai para `operational_errors` via
`logOperationalError()` com `origem` no formato `webhook.<funcao>`. Um webhook que
retorna 500 faz a Meta reentregar em loop.

## Telas

| Rota | Quem | O quê |
|---|---|---|
| `/login` | público | e-mail + senha (Supabase Auth) |
| `/conversas` | autenticado | lista + timeline + composer (texto e imagem); etiqueta do `ultimo_servico`; pendentes no topo |
| `/clientes` | autenticado | busca, cadastro/edição de cliente e pets, seleção múltipla -> "Agendar disparo" |
| `/disparos` | autenticado | fila de `scheduled_disparos`, cancelar linha ou campanha |
| `/bot` | **admin** | editar `bot_config` e CRUD de `bot_opcoes`, com preview de como a Meta vai renderizar |
| `/erros` | **admin** | `operational_errors` |

**Identidade visual** do `site-agrozet`: laranja `#f4601c`, amarelo `#ffc133`,
vermelho `#8b1005`; Fraunces (display) + Karla (texto); tema claro.

### "Pendente" é derivado, não armazenado

Conversa pendente = **a última mensagem daquele telefone é `inbound`**. Nada de
tabela `conversation_reads`, nada de contador de não-lidas por usuário: com um
número só e todos vendo tudo (decisão 2), "lida por quem?" não tem resposta
útil. A lista ordena pendentes primeiro, depois por `ultima_interacao_at` desc.
A conversa sai da pendência quando qualquer atendente responde.

## Disparo agendado

`POST /api/schedule-disparo` — recebe `cliente_ids`, `template_name`,
`template_lang`, `components`, `scheduled_for`, `campaign_id`. Valida janela de
expediente, resolve o telefone canônico de cada cliente, **filtra `blocked_numbers`**
e insere em `scheduled_disparos`. Aceita `dryRun: true`.

**Enfileirar só pela rota.** Nunca inserir direto em `scheduled_disparos` — no
Mar Azul um SQL na mão custou 89 de 103 leads disparáveis, de forma irreversível,
porque as regras vivem na rota e o banco não reclama.

`POST /api/cron/process-disparos` — exige `Authorization: Bearer` com o
`CRON_SECRET`. Chama a RPC `claim_scheduled_disparos(batch_size => 20)`, que
marca `processing` atomicamente, envia, e grava o resultado.
`export const maxDuration = 300`.

**A blocklist é reconsultada no envio**, não só no enfileiramento: horas separam
os dois momentos e o cliente pode pedir para sair nesse intervalo. Falha ao
consultar a blocklist **aborta o lote** — nunca vira "manda pra todo mundo".

**Reaper:** linha em `processing` por mais de 15 min volta a `pending` com
`attempts` incrementado; em 3 tentativas vira `failed`.

## Retenção — `POST /api/cron/retencao`

Mesmo `CRON_SECRET`. Diário:

1. Mídia de mensagens com mais de 90 dias: remove do Storage em lotes de 100,
   depois zera o `media_path`.
2. Apaga linhas de `messages` com mais de 2 anos.
3. Grava um resumo (bytes liberados, linhas apagadas) em `operational_errors`
   com `origem = 'retencao.resumo'` — é o único registro de capacidade que sobra
   sem tela de relatório.

## Testes

Vitest, só em **lógica pura**, sem mock de Supabase nem de rede:

`bot.ts` (toda a tabela de decisão, as duas guardas, botão x lista, opções
inativas) · `botLimites.ts` (limites da Meta) · `phoneUtils.ts`/`waIdentity.ts`
(variantes, 9o dígito, wa_id) · `scheduling.ts` (expediente, reaper, desfecho de
entrega) · `janela24h.ts` · `retencao.ts` (cálculo das datas de corte).

Rotas e componentes não têm teste automatizado na Fase 1 — a verificação é
`npm run build` (type-check) + `npm run lint` + smoke manual.

## Fases

**Fase 1 — fundação e bot.** Scaffold, migration, RLS, auth, webhook com
assinatura, `bot.ts`, menu interativo, conversas (ler/responder texto e imagem).
*Pronto quando:* cliente manda mensagem, recebe menu, aperta botão, recebe a
resposta, e o atendente vê a conversa etiquetada e responde.

**Fase 2 — cadastro e admin do bot.** `/clientes` com pets, `/bot` com CRUD e
preview, `/erros`.
*Pronto quando:* admin troca o texto de um botão pela tela e o próximo cliente vê o novo.

**Fase 3 — disparos e capacidade.** `/disparos`, `schedule-disparo`,
`process-disparos`, reaper, retenção, `pg_cron`, compressão de imagem.
*Pronto quando:* disparo agendado pela tela sai na hora marcada via `pg_cron`.

## Extensões registradas, não implementadas

- Histórico de serviços por cliente (data, tipo, valor) -> porta de entrada para
  disparo automático por recorrência ("banho há 30 dias, não voltou").
- Dono da conversa (`atendente_id`) se a equipe crescer.
- Gravação e envio de áudio (exige ffmpeg).
- Rota de saída da hospedagem: Vercel Pro, ou Cloudflare/Netlify no free tier,
  que permitem uso comercial.
