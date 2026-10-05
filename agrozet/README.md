# CRM Agrozet

CRM de atendimento WhatsApp para o **Pet Shop Agrozet** — banho e tosa, rações e
agropecuária, na Segismundo Pereira, em Uberlândia.

Um número de WhatsApp na API oficial da Meta, atendido por pessoas, com um **bot
de botão** que faz a triagem inicial: o cliente escolhe o serviço num menu de
botões, recebe uma resposta pronta e cai na fila do atendente **já etiquetado
pelo assunto**. O bot não agenda, não pede CPF e não tenta conversar — ele
etiqueta e sai da frente.

**Para quem:** os atendentes do petshop. Um número só, e todos veem todas as
conversas — é por isso que o RLS deste projeto é trivial de propósito, e por isso
não existe "dono da conversa" nem contador de não-lidas por usuário.

**Fora de escopo:** relatórios, dashboards analíticos, cobrança, copiloto de IA,
bridge de Telegram, múltiplas instâncias de número, gravação/envio de áudio.

## Stack

Next.js 16.2.6 (App Router) · React 19.2.4 · TypeScript 5 · Tailwind 4 ·
[Base UI](https://base-ui.com) (`@base-ui/react`, **sem `asChild`** — composição
por `render` prop) · TanStack Query 5 · Supabase (Auth + Postgres + Storage) ·
`sharp` · Zod · Vitest.

Meta WhatsApp Cloud API **v22.0**. Hospedagem pensada para Vercel Hobby +
Supabase free (ver a ressalva de termos no `CLAUDE.md`, item 10).

**Sem** `ffmpeg`, `dnd-kit`, LLM, Telegram.

## Rodar local

```bash
npm install
cp .env.local.example .env.local   # e preencha
npm run dev                        # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `npm run dev` | dev server em `localhost:3000` |
| `npm run build` | build de produção + type-check |
| `npm run lint` | ESLint |
| `npm run test` | `vitest run` |

`http://localhost:3000` redireciona para `/login`; depois de autenticar, `/` leva
a `/conversas`.

**Preencher o `.env.local` não é opcional** e exige um projeto Supabase e um app
na Meta, que ainda não existem. O roteiro completo está no `SETUP.md`.

## Documentação

- **[`SETUP.md`](./SETUP.md)** — colocar de pé do zero: Supabase, migration,
  bucket, usuário, app na Meta, webhook, Vercel, `pg_cron`.
- **[`CLAUDE.md`](./CLAUDE.md)** — **leia antes de mexer no código.** As 18 regras
  que este projeto segue, cada uma com o motivo: `META_TOKEN` server-only, rota de
  API que valida sessão sozinha, o dono único do cadastro de clientes, o gate de
  idempotência do webhook, as duas guardas do bot, os limites da Meta.
- **[`TREE.md`](./TREE.md)** — a árvore do projeto, com uma linha por arquivo.
- **Spec:** [`docs/superpowers/specs/2026-10-05-agrozet-crm-design.md`](./docs/superpowers/specs/2026-10-05-agrozet-crm-design.md)
- **Plano da Fase 1:** [`docs/superpowers/plans/2026-10-05-fase1-fundacao-e-bot.md`](./docs/superpowers/plans/2026-10-05-fase1-fundacao-e-bot.md)

## Como o fluxo funciona, em cinco linhas

1. A Meta entrega o webhook em `POST /api/webhook`, que **confere a assinatura
   HMAC** antes de qualquer coisa.
2. A mensagem é gravada em `messages` com `ignoreDuplicates` + `select('id')` —
   **array vazio significa reentrega**, e aí a rota sai sem efeito nenhum.
3. Esse INSERT dispara o trigger `messages_sync_cliente`, **único** escritor do
   cadastro base em `clientes`.
4. `decidirBot()` (`src/lib/bot.ts`, lógica pura, zero I/O) devolve uma decisão; o
   webhook executa: envia o menu, captura a escolha em `clientes.ultimo_servico`,
   ou fica calado.
5. O atendente abre `/conversas`, vê a conversa com a etiqueta do serviço, e
   responde texto ou imagem por `/api/send-message` e `/api/upload-media`.

## Estado atual

**Fase 1 — fundação e bot: implementada e verificada.** Scaffold, migration com
RLS, autenticação, webhook com verificação de assinatura, `bot.ts` completo, menu
interativo (botões até 3 opções, lista de 4 a 10), e a tela de conversas lendo e
respondendo texto e imagem.

Verificação executada em 2026-10-05:

```
npm run test   -> 10 arquivos, 111 testes, todos passando
npx tsc --noEmit -> sem erros
npm run lint   -> sem erros
npm run build  -> compila; rotas: /, /login, /conversas,
                  /api/webhook, /api/send-message, /api/upload-media, /api/media-url
```

### O que ainda não foi feito, e você precisa saber

> **Este sistema nunca rodou contra um Supabase real.** Não existe projeto
> Supabase, não existem credenciais, não existe app na Meta. A migration foi
> validada **por leitura, não por execução**; `src/lib/database.types.ts` foi
> **escrito à mão** a partir dela e tem de ser regenerado pelo CLI antes de
> qualquer coisa séria (`CLAUDE.md`, item 16).
>
> **Nenhum smoke de ponta a ponta foi feito** — nenhuma mensagem de WhatsApp real
> entrou ou saiu. O roteiro dos 6 passos está no `SETUP.md`, item 8, pronto para
> ser executado quando a infraestrutura existir. Os 111 testes cobrem **lógica
> pura**: eles provam que `decidirBot` decide certo, não que o banco aceita a
> escrita.

### Pendente (conforme o spec)

**Fase 2 — cadastro e admin do bot.** `/clientes` com busca e CRUD de cliente +
pets; `/bot` (admin) com edição de `bot_config` e CRUD de `bot_opcoes` com preview
de como a Meta vai renderizar; `/erros` (admin) listando `operational_errors`. Na
Sidebar esses itens já aparecem marcados como "em breve".
*Pronto quando:* um admin troca o texto de um botão pela tela e o próximo cliente
vê o novo.

**Fase 3 — disparos e capacidade.** `/disparos`; `POST /api/schedule-disparo`;
`POST /api/cron/process-disparos` com a RPC `claim_scheduled_disparos` e o reaper
de linhas presas em `processing`; `POST /api/cron/retencao` (mídia > 90 dias,
mensagens > 2 anos); os dois jobs de `pg_cron`; compressão de imagem no caminho
**inbound** do webhook.
*Pronto quando:* um disparo agendado pela tela sai na hora marcada via `pg_cron`.

As tabelas `scheduled_disparos`, `blocked_numbers` e `pets` já existem na
migration, sem código que as use.

### Registrado, não planejado

Histórico de serviços por cliente (porta de entrada para disparo por
recorrência: "banho há 30 dias, não voltou"), dono da conversa (`atendente_id`)
se a equipe crescer, gravação e envio de áudio (exige ffmpeg), e a rota de saída
de hospedagem (Vercel Pro, ou Cloudflare/Netlify no free, que permitem uso
comercial).

## Identidade visual

Laranja `#f4601c`, amarelo `#ffc133`, vermelho `#8b1005`; Fraunces (display) +
Karla (texto); tema claro. O laranja **não** carrega texto branco — ver
`CLAUDE.md`, item 15, antes de mexer em cor.

---

Derivado do `mar-azul-system` (35.141 linhas, 298 migrations), reconstruído
enxuto como projeto novo: o schema aqui é **uma** migration e não há código
morto.
