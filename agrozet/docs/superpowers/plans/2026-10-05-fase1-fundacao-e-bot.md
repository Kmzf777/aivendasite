# CRM Agrozet — Fase 1: Fundação e Bot de Botão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um cliente manda mensagem no WhatsApp do Agrozet, recebe um menu de botões, escolhe o serviço, recebe a resposta pronta, e o atendente vê a conversa etiquetada e responde por texto ou imagem.

**Architecture:** Next.js 16 App Router na Vercel. O webhook da Meta é o único ponto de entrada automático: valida assinatura HMAC, grava a mensagem de forma idempotente, chama `decidirBot` (lógica pura, zero I/O) e executa a decisão. Supabase guarda tudo; um número só de WhatsApp e todos os atendentes veem todas as conversas, o que torna o RLS trivial.

**Tech Stack:** Next.js 16.2.6 · React 19.2.4 · TypeScript 5 · Tailwind 4 · `@base-ui/react` (sem `asChild`) · TanStack Query 5 · Supabase (Auth + Postgres + Storage) · sharp · Zod · Vitest

**Spec:** `docs/superpowers/specs/2026-10-05-agrozet-crm-design.md`

**Raiz do projeto:** `C:\Users\rafae\OneDrive\Desktop\PetShop-coldcall\agrozet`. Todo caminho abaixo é relativo a ela.

**Fonte de cópia:** `../mar-azul-system-main`. Onde o plano diz "copiar de", é cópia literal salvo o que o passo mandar mudar.

---

## Contratos compartilhados — LEIA ANTES DE QUALQUER TASK

Vários agentes trabalham em paralelo. Estas assinaturas são **lei**: não renomeie, não acrescente parâmetro, não mude ordem. Se o seu task precisa de algo que não está aqui, pare e reporte em vez de inventar.

### `src/lib/botTypes.ts` — criado na Onda 0 (Task 3)

Estes tipos moram num arquivo **próprio**, criado antes das ondas paralelas, porque
`bot.ts` (Agente A) e `metaApi.ts` (Agente B) precisam dos dois na **mesma onda**.
Se `BotMenu` morasse em `bot.ts`, o Agente B importaria um arquivo que o Agente A
ainda está escrevendo — e nenhum dos dois compilaria.

```ts
export type BotStage = 'awaiting_choice' | 'done'

/** Menu pronto para a Meta: `button` até 3 opções, `list` de 4 a 10. */
export type BotMenu =
  | { formato: 'button'; corpo: string; rodape: string | null; botoes: { id: string; titulo: string }[] }
  | { formato: 'list'; corpo: string; rodape: string | null; rotulo: string; itens: { id: string; titulo: string }[] }
```

`bot.ts` e `metaApi.ts` reexportam/importam daqui. Ninguém redefine `BotMenu`.

### `src/lib/bot.ts`

```ts
import type { BotStage, BotMenu } from './botTypes'
export type { BotStage, BotMenu }

export type BotOpcao = {
  botao_id: string
  titulo: string
  resposta: string
  ordem: number
  ativo: boolean
}

export type BotConfig = {
  ativo: boolean
  saudacao: string
  rodape: string | null
  fecho: string
}

export type BotAcao = 'start' | 'capture_choice' | 'remenu' | 'giveup' | 'none'

export type BotEntrada = {
  clienteExiste: boolean
  stage: BotStage | null
  config: BotConfig
  opcoes: BotOpcao[]
  /** id do botão/item quando a mensagem é interactive; null para texto ou mídia. */
  botaoId: string | null
  /** Quantas mensagens interactive outbound saíram para este telefone na última hora. */
  menusEnviadosNaUltimaHora: number
  /** Quantas respostas do bot saíram para este telefone na última hora. */
  respostasNaUltimaHora: number
  /** Segundos entre a última fala do bot e esta mensagem; undefined se o bot nunca falou. */
  segundosDesdeUltimaFala?: number
}

export type BotSaida = {
  acao: BotAcao
  /** Texto simples a enviar (capture_choice). Mutuamente exclusivo com `menu`. */
  texto?: string
  /** Menu interativo a enviar (start, remenu). Mutuamente exclusivo com `texto`. */
  menu?: BotMenu
  /** Novo bot_stage a gravar. Ausente = não mexe no stage. */
  proximoStage?: BotStage
  /** bot_stage exigido no UPDATE condicional. Ausente = sem condição. */
  stageEsperado?: BotStage | null
  /** botao_id escolhido, só em capture_choice. Grava em clientes.ultimo_servico. */
  servico?: string
  /** Erro operacional a registrar, se houver. Não impede a ação. */
  erro?: string
}

export function montarMenu(config: BotConfig, opcoes: BotOpcao[]): { menu: BotMenu | null; erro?: string }
export function decidirBot(entrada: BotEntrada): BotSaida

export const BOT_TETO_RESPOSTAS_POR_HORA = 6
export const BOT_JANELA_LEITURA_SEGUNDOS = 10
```

### `src/lib/botLimites.ts`

```ts
export const LIMITE_TITULO_BOTAO = 20
export const LIMITE_CORPO = 1024
export const LIMITE_RODAPE = 60
export const MAX_REPLY_BUTTONS = 3
export const MAX_ITENS_LISTA = 10

/** Mensagens de erro em pt-BR, vazio = válido. Usado no form e antes do envio. */
export function validarOpcao(o: { titulo: string; resposta: string }): string[]
export function validarConfig(c: { saudacao: string; rodape: string | null; fecho: string }): string[]
```

### `src/lib/metaApi.ts`

```ts
import type { BotMenu } from './botTypes'

export type MediaType = 'image' | 'audio' | 'document' | 'sticker' | 'video'
export type TemplateComponent = { type: string; parameters?: unknown[]; sub_type?: string; index?: string }

export async function sendWhatsAppMessage(to: string, text: string, replyToMessageId?: string): Promise<string | null>
export async function sendWhatsAppMedia(to: string, mediaId: string, type: MediaType, caption?: string): Promise<string | null>
export async function sendWhatsAppInteractive(to: string, menu: BotMenu): Promise<string | null>
export async function uploadMetaMedia(file: Blob, mime: string): Promise<string>
export async function getMetaMediaUrl(mediaId: string): Promise<{ url: string; mime: string }>
export async function downloadMetaMedia(url: string): Promise<ArrayBuffer>

/** Payload puro, exportado para teste sem rede. */
export function buildInteractivePayload(to: string, menu: BotMenu): Record<string, unknown>
```

### `src/lib/waIdentity.ts` e `src/lib/phoneUtils.ts`

```ts
// phoneUtils.ts
export function onlyDigits(s: string): string
export function toBrazilPhone(s: string): string
/** Todas as grafias plausíveis (com e sem 9o dígito, com e sem 55). */
export function getPhoneVariants(s: string): string[]

// waIdentity.ts
export function buildRecipient(to: string): { to: string }
```

### `src/lib/mediaStorage.ts`

```ts
export const BUCKET = 'media'
/** Redimensiona para <=1280px no maior lado e devolve WebP q80. Puro, testável. */
export async function comprimirImagem(entrada: ArrayBuffer): Promise<{ buffer: Buffer; mime: 'image/webp' }>
/** Caminho determinístico no bucket. */
export function caminhoMidia(messageId: string, mime: string): string
/** Baixa da Meta, comprime se imagem, grava no Storage. Devolve o path ou null. */
export async function armazenarMidia(mediaId: string, messageId: string): Promise<{ path: string; mime: string } | null>
```

### `src/lib/errorLog.ts`

```ts
/** origem no formato 'modulo.funcao'. NUNCA lança: erro aqui não pode derrubar o chamador. */
export async function logOperationalError(origem: string, mensagem: string, contexto?: unknown): Promise<void>
```

### Tabelas e colunas

Use exatamente os nomes do spec. Em especial: `clientes.bot_stage`, `clientes.ultimo_servico`, `clientes.ultima_interacao_at`, `messages.message_id`, `messages.direction`, `messages.message_type`, `messages.media_path`, `messages.delivery_status`, `bot_opcoes.botao_id`.

### Regras que nenhum agente pode violar

1. **`META_TOKEN` nunca recebe o prefixo `NEXT_PUBLIC_`.** O Next inlina a variável no bundle do browser e publica o token do WhatsApp Business.
2. **O webhook nunca faz upsert em `clientes`.** O trigger `sync_cliente_from_message` é o dono único do cadastro base. Dois escritores foi a causa do clobber de nome no Mar Azul.
3. **O webhook nunca retorna 500 por erro não-fatal.** Vai para `operational_errors` e devolve 200. 500 faz a Meta reentregar em loop.
4. **Nenhum teste mocka Supabase ou rede.** Testa-se lógica pura. Rota e componente são verificados por `npm run build` + `npm run lint` + smoke manual.
5. **Base UI não usa `asChild`.** Composição é por `render` prop.

---

## Mapa de arquivos e ondas

| Onda | Task | Agente | Arquivos (sem sobreposição entre tasks da mesma onda) |
|---|---|---|---|
| 0 | 1 | serial | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.cjs`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `.gitignore`, `.env.local.example` |
| 0 | 2 | serial | `supabase/migrations/20261005000000_baseline_agrozet.sql` + `.down.sql` |
| 0 | 3 | serial | `src/lib/botTypes.ts`, `src/lib/database.types.ts`, `src/lib/supabase-browser.ts`, `src/lib/supabase-server.ts`, `src/lib/supabaseAdmin.ts`, `src/lib/utils.ts`, `src/lib/errorLog.ts` |
| 0 | 4 | serial | `src/app/globals.css`, `src/app/layout.tsx`, `src/app/providers.tsx`, `src/components/ui/*` |
| 1 | 5 | **A** | `src/lib/botLimites.ts`, `src/lib/botLimites.test.ts`, `src/lib/bot.ts`, `src/lib/bot.test.ts` |
| 1 | 6 | **B** | `src/lib/phoneUtils.ts(+test)`, `src/lib/waIdentity.ts(+test)`, `src/lib/janela24h.ts(+test)`, `src/lib/metaSignature.ts(+test)`, `src/lib/metaApi.ts(+test)` |
| 1 | 7 | **C** | `middleware.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/Sidebar.tsx`, `src/hooks/useIsAdmin.ts` |
| 1 | 8 | **D** | `src/lib/mediaStorage.ts`, `src/lib/mediaStorage.test.ts` |
| 2 | 9 | **E** | `src/lib/webhookPayload.ts(+test)`, `src/app/api/webhook/route.ts` |
| 2 | 10 | **F** | `src/lib/listaConversas.ts(+test)`, `src/hooks/useConversas.ts`, `src/hooks/useMensagens.ts`, `src/components/conversations/*`, `src/components/Conversations.tsx`, `src/app/(app)/conversas/page.tsx` |
| 2 | 11 | **G** | `src/app/api/send-message/route.ts`, `src/app/api/upload-media/route.ts`, `src/app/api/media-url/route.ts` |
| 3 | 12 | serial | integração, build, lint, test, commit final |

Agentes da mesma onda **não compartilham nenhum arquivo**. Quem precisar tocar arquivo de outro agente deve parar e reportar.

---

## Onda 0 — fundação serial

### Task 1: Scaffold e configuração

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.cjs`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `.gitignore`, `.env.local.example`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "agrozet-crm",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "@base-ui/react": "^1.6.0",
    "@hookform/resolvers": "^5.4.0",
    "@supabase/ssr": "^0.10.3",
    "@supabase/supabase-js": "^2.106.2",
    "@tanstack/react-query": "^5.101.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.3.0",
    "lucide-react": "^1.16.0",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-hook-form": "^7.77.0",
    "sharp": "^0.34.2",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^2.1.9"
  }
}
```

Sem `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@dnd-kit/*`, `next-themes`, `shadcn`. Áudio é só recebido, nunca gravado (spec, "Fora de escopo"), e o tema é claro fixo.

- [ ] **Step 2: Copiar as configs do Mar Azul sem alteração**

Copiar literalmente de `../mar-azul-system-main/`: `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.cjs`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `.gitignore`.

- [ ] **Step 3: Criar `.env.local.example`**

```sh
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Meta WhatsApp Cloud API v22.0
# ATENCAO: META_TOKEN e server-only. Com o prefixo NEXT_PUBLIC_ o Next.js
# inlina o valor no bundle do browser e publica o token do WhatsApp Business.
META_TOKEN=
NEXT_PUBLIC_META_PHONE_ID=
META_WABA_ID=
META_VERIFY_TOKEN=
META_APP_SECRET=

# Cron (mesmo valor no Vault do Supabase)
CRON_SECRET=
```

- [ ] **Step 4: Instalar e verificar**

Run: `npm install && npx tsc --noEmit`
Expected: instalação sem erro; `tsc` sem arquivo para checar ainda (ou nenhum erro).

- [ ] **Step 5: Commit**

```bash
git add agrozet/package.json agrozet/package-lock.json agrozet/tsconfig.json agrozet/next.config.ts agrozet/postcss.config.mjs agrozet/tailwind.config.cjs agrozet/eslint.config.mjs agrozet/vitest.config.ts agrozet/components.json agrozet/.gitignore agrozet/.env.local.example
git commit -m "chore(agrozet): scaffold do projeto Next.js"
```

---

### Task 2: Migration baseline

**Files:**
- Create: `supabase/migrations/20261005000000_baseline_agrozet.sql`
- Create: `supabase/migrations/20261005000000_baseline_agrozet.down.sql`

- [ ] **Step 1: Escrever o schema**

Uma migration só, nesta ordem: extensões -> tabelas -> índices -> `is_admin()` -> trigger -> RLS -> seed do bot.

Tabelas e colunas exatamente como o spec define. Pontos que não podem sair errados:

- `messages.message_id text UNIQUE NOT NULL` — é o gate de idempotência do webhook. Sem o UNIQUE, a reentrega da Meta duplica a mensagem e o bot responde duas vezes.
- `clientes.phone text UNIQUE NOT NULL` — chave canônica (`wa_id` da Meta).
- `bot_config` com `id int PRIMARY KEY CHECK (id = 1)` — singleton garantido pelo banco.
- `bot_opcoes.titulo` com `CHECK (char_length(titulo) <= 20)` e `resposta` com `CHECK (char_length(resposta) <= 1024)` — os limites da Meta viram constraint, porque a linha pode entrar por SQL e passar por fora do formulário.
- `is_admin()` com `SECURITY DEFINER` e `SET search_path = ''`, lendo o papel do `user_metadata` do JWT.

- [ ] **Step 2: Escrever o trigger**

```sql
CREATE OR REPLACE FUNCTION public.sync_cliente_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.clientes (phone, primeiro_contato_at, ultima_interacao_at)
  VALUES (NEW.phone, COALESCE(NEW.created_at, now()), COALESCE(NEW.created_at, now()))
  ON CONFLICT (phone) DO UPDATE
    SET ultima_interacao_at = GREATEST(
          public.clientes.ultima_interacao_at,
          COALESCE(NEW.created_at, now())
        ),
        updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_sync_cliente
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_from_message();
```

O trigger **não escreve `nome`**: o nome de exibição do WhatsApp chega no webhook, não na linha de `messages`, e o spec manda o webhook não tocar `clientes`. O nome entra só pela tela de clientes (Fase 2) — na Fase 1 a conversa é identificada pelo telefone. Isso é deliberado e evita o clobber: nada sobrescreve um nome digitado à mão.

- [ ] **Step 3: Escrever o RLS**

`ENABLE ROW LEVEL SECURITY` em todas as 8 tabelas. Policies conforme o spec: SELECT para `authenticated` em tudo menos `operational_errors`; INSERT/UPDATE/DELETE para `authenticated` em `clientes`, `pets`, `messages`, `scheduled_disparos`, `blocked_numbers`; escrita em `bot_config`/`bot_opcoes` só com `is_admin()`; `operational_errors` com SELECT só `is_admin()` e nenhuma policy de INSERT (só `service_role`, que ignora RLS).

- [ ] **Step 4: Semear o menu do Agrozet**

```sql
INSERT INTO public.bot_config (id, ativo, saudacao, rodape, fecho) VALUES (
  1, true,
  'Olá! Bem-vindo ao Pet Shop Agrozet. Em que podemos ajudar hoje?',
  'Pet Shop Agrozet - Segismundo Pereira, Uberlândia',
  'Perfeito! Em instantes um de nossos atendentes vai te responder por aqui.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bot_opcoes (ordem, botao_id, titulo, resposta, ativo) VALUES
  (1, 'banho_tosa', 'Banho e Tosa',
   'Trabalhamos com banho, tosa higiênica e tosa na máquina, para todos os portes. Atendemos de segunda a sábado, com hora marcada.', true),
  (2, 'racoes', 'Rações e Produtos',
   'Temos rações das principais marcas, petiscos, brinquedos, coleiras e acessórios. Também fazemos entrega no bairro.', true),
  (3, 'atendente', 'Falar com atendente',
   'Claro! Já estou te encaminhando.', true)
ON CONFLICT (botao_id) DO NOTHING;
```

Três opções = o bot usa `interactive button` (reply buttons), dentro do limite de 3 da Meta.

- [ ] **Step 5: Escrever o `.down.sql`**

Dropar na ordem inversa: trigger, função do trigger, `is_admin()`, tabelas (`pets` antes de `clientes` por causa da FK; `messages` por último pelo trigger).

- [ ] **Step 6: Aplicar e verificar**

Aplicar via Supabase MCP ou dashboard. Verificar:

Run: no SQL editor, `SELECT count(*) FROM bot_opcoes WHERE ativo;`
Expected: `3`

Run: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';`
Expected: `rowsecurity = true` nas 8 tabelas.

- [ ] **Step 7: Commit**

```bash
git add agrozet/supabase/migrations/
git commit -m "feat(agrozet): schema baseline com RLS, trigger de cliente e menu do bot"
```

---

### Task 3: Tipos e clientes Supabase

**Files:**
- Create: `src/lib/botTypes.ts`, `src/lib/database.types.ts`, `src/lib/supabase-browser.ts`, `src/lib/supabase-server.ts`, `src/lib/supabaseAdmin.ts`, `src/lib/utils.ts`, `src/lib/errorLog.ts`

- [ ] **Step 1: Gerar os tipos**

Run: `npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/lib/database.types.ts`
Expected: arquivo com `Database` exportado e as 8 tabelas.

Se o CLI não estiver autenticado, usar o dashboard (Settings -> API -> TypeScript) e colar o conteúdo. **Regenerar os tipos é obrigatório depois de qualquer DDL** — tipo defasado vira erro de build no agente seguinte.

- [ ] **Step 2: Copiar os clientes e o `cn`**

Copiar de `../mar-azul-system-main/src/lib/`: `supabase-browser.ts`, `supabase-server.ts`, `supabaseAdmin.ts`, `utils.ts`. Nenhuma alteração além do import de `database.types`.

- [ ] **Step 3: Escrever `errorLog.ts`**

```ts
import { getAdminSupabase } from './supabaseAdmin'

/**
 * Erro operacional: falha não-fatal num caminho que não pode abortar (webhook,
 * cron). NUNCA lança — um erro ao registrar erro não pode derrubar o chamador,
 * senão o webhook devolve 500 e a Meta reentrega em loop.
 */
export async function logOperationalError(
  origem: string,
  mensagem: string,
  contexto?: unknown
): Promise<void> {
  try {
    await getAdminSupabase().from('operational_errors').insert({
      origem,
      mensagem: mensagem.slice(0, 2000),
      contexto: contexto === undefined ? null : JSON.parse(JSON.stringify(contexto)),
    })
  } catch (e) {
    console.error('[errorLog] falhou ao registrar', origem, mensagem, e)
  }
}
```

- [ ] **Step 4: Criar `botTypes.ts`**

Exatamente o bloco da secao "Contratos compartilhados". Este arquivo existe para
que `bot.ts` (Agente A) e `metaApi.ts` (Agente B) possam ser escritos na MESMA
onda sem um importar o arquivo que o outro ainda esta escrevendo.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add agrozet/src/lib/
git commit -m "feat(agrozet): tipos do banco, clientes Supabase e log de erro operacional"
```

---

### Task 4: Identidade visual e primitivos de UI

**Files:**
- Create: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/providers.tsx`
- Create: `src/components/ui/{alert,avatar,badge,button,card,dialog,dropdown-menu,input,scroll-area,separator,skeleton,sonner,table,tooltip}.tsx`

- [ ] **Step 1: Copiar os 14 primitivos**

Copiar de `../mar-azul-system-main/src/components/ui/` sem alteração. Todos usam `@base-ui/react` + `cn`, já disponíveis.

- [ ] **Step 2: Escrever `globals.css` com os tokens do Agrozet**

Partir do `globals.css` do Mar Azul e trocar a paleta pelos valores amostrados da logo real (`site-agrozet/README.md`):

```css
:root {
  --brand-laranja: #f4601c;
  --brand-amarelo: #ffc133;
  --brand-vermelho: #8b1005;
  --primary: var(--brand-laranja);
  --ring: var(--brand-laranja);
}
```

Fontes: Fraunces (display) e Karla (texto), via `next/font/google` no `layout.tsx`. **Tema claro fixo** — sem `next-themes`, sem bloco `prefers-color-scheme`.

- [ ] **Step 3: Escrever `layout.tsx` e `providers.tsx`**

`layout.tsx`: html lang `pt-BR`, as duas fontes, `<Toaster />` do sonner, `metadata.title = 'CRM Agrozet'`.
`providers.tsx`: copiar do Mar Azul (QueryClientProvider do TanStack Query).

- [ ] **Step 4: Verificar**

Run: `npm run build`
Expected: build passa. Sem rota ainda, só o layout raiz.

- [ ] **Step 5: Commit**

```bash
git add agrozet/src/app/globals.css agrozet/src/app/layout.tsx agrozet/src/app/providers.tsx agrozet/src/components/ui/
git commit -m "feat(agrozet): identidade visual e primitivos de UI"
```

---

## Onda 1 — quatro agentes em paralelo

### Task 5 — AGENTE A: O bot de botão (lógica pura)

**Files:**
- Create: `src/lib/botLimites.ts`, `src/lib/botLimites.test.ts`
- Create: `src/lib/bot.ts`, `src/lib/bot.test.ts`

Zero I/O. Nenhum import de Supabase, nenhum `fetch`. É o coração do produto e o único módulo com cobertura de teste completa.

- [ ] **Step 1: Escrever os testes de `botLimites`**

```ts
import { describe, it, expect } from 'vitest'
import { validarOpcao, validarConfig } from './botLimites'

describe('validarOpcao', () => {
  it('aceita opcao dentro dos limites', () => {
    expect(validarOpcao({ titulo: 'Banho e Tosa', resposta: 'Fazemos banho e tosa.' })).toEqual([])
  })

  it('recusa titulo com mais de 20 caracteres', () => {
    const erros = validarOpcao({ titulo: 'Banho, Tosa e Hidratacao Completa', resposta: 'ok' })
    expect(erros).toHaveLength(1)
    expect(erros[0]).toContain('20')
  })

  it('recusa titulo vazio', () => {
    expect(validarOpcao({ titulo: '   ', resposta: 'ok' })).toContainEqual(
      expect.stringContaining('título')
    )
  })

  it('recusa resposta com mais de 1024 caracteres', () => {
    const erros = validarOpcao({ titulo: 'ok', resposta: 'x'.repeat(1025) })
    expect(erros).toContainEqual(expect.stringContaining('1024'))
  })

  it('acumula os dois erros de uma vez', () => {
    expect(validarOpcao({ titulo: 'x'.repeat(21), resposta: 'x'.repeat(1025) })).toHaveLength(2)
  })
})

describe('validarConfig', () => {
  it('aceita config valida', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: 'Agrozet', fecho: 'Já chamamos alguém.' })).toEqual([])
  })

  it('aceita rodape nulo', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: null, fecho: 'ok' })).toEqual([])
  })

  it('recusa rodape com mais de 60 caracteres', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: 'x'.repeat(61), fecho: 'ok' }))
      .toContainEqual(expect.stringContaining('60'))
  })

  it('recusa saudacao vazia', () => {
    expect(validarConfig({ saudacao: '', rodape: null, fecho: 'ok' })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/botLimites.test.ts`
Expected: FAIL — `Cannot find module './botLimites'`.

- [ ] **Step 3: Implementar `botLimites.ts`**

Constantes do contrato + as duas funções, acumulando mensagens em pt-BR num array. Validação de tamanho usa `.trim().length` para campo obrigatório e `.length` para o teto.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/botLimites.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Escrever os testes de `montarMenu`**

```ts
import { describe, it, expect } from 'vitest'
import { montarMenu } from './bot'
import type { BotConfig, BotOpcao } from './bot'

const config: BotConfig = {
  ativo: true,
  saudacao: 'Olá! Em que podemos ajudar?',
  rodape: 'Pet Shop Agrozet',
  fecho: 'Já chamamos um atendente.',
}

const opcao = (n: number, ativo = true): BotOpcao => ({
  botao_id: `op${n}`, titulo: `Opcao ${n}`, resposta: `Resposta ${n}`, ordem: n, ativo,
})

describe('montarMenu', () => {
  it('usa reply buttons com 3 opcoes', () => {
    const { menu, erro } = montarMenu(config, [opcao(1), opcao(2), opcao(3)])
    expect(erro).toBeUndefined()
    expect(menu).toEqual({
      formato: 'button',
      corpo: config.saudacao,
      rodape: 'Pet Shop Agrozet',
      botoes: [
        { id: 'op1', titulo: 'Opcao 1' },
        { id: 'op2', titulo: 'Opcao 2' },
        { id: 'op3', titulo: 'Opcao 3' },
      ],
    })
  })

  it('usa reply buttons com 1 opcao', () => {
    expect(montarMenu(config, [opcao(1)]).menu?.formato).toBe('button')
  })

  // A Meta RECUSA 4 reply buttons. Sem este degrau o cliente ficaria sem
  // resposta nenhuma quando um admin cadastrasse a 4a opcao pela tela.
  it('vira lista com 4 opcoes', () => {
    const { menu } = montarMenu(config, [opcao(1), opcao(2), opcao(3), opcao(4)])
    expect(menu?.formato).toBe('list')
    if (menu?.formato !== 'list') throw new Error('esperava list')
    expect(menu.itens).toHaveLength(4)
    expect(menu.rotulo).toBe('Ver serviços')
  })

  it('ignora opcoes inativas na contagem de formato', () => {
    const opcoes = [opcao(1), opcao(2), opcao(3), opcao(4, false)]
    const { menu } = montarMenu(config, opcoes)
    expect(menu?.formato).toBe('button')
    if (menu?.formato !== 'button') throw new Error('esperava button')
    expect(menu.botoes.map((b) => b.id)).toEqual(['op1', 'op2', 'op3'])
  })

  it('ordena por ordem, nao pela posicao no array', () => {
    const { menu } = montarMenu(config, [opcao(3), opcao(1), opcao(2)])
    if (menu?.formato !== 'button') throw new Error('esperava button')
    expect(menu.botoes.map((b) => b.id)).toEqual(['op1', 'op2', 'op3'])
  })

  it('trunca em 10 itens e reporta erro', () => {
    const opcoes = Array.from({ length: 12 }, (_, i) => opcao(i + 1))
    const { menu, erro } = montarMenu(config, opcoes)
    if (menu?.formato !== 'list') throw new Error('esperava list')
    expect(menu.itens).toHaveLength(10)
    expect(menu.itens.map((i) => i.id)).toEqual(
      ['op1','op2','op3','op4','op5','op6','op7','op8','op9','op10']
    )
    expect(erro).toContain('10')
  })

  it('sem opcao ativa devolve menu nulo e erro', () => {
    const { menu, erro } = montarMenu(config, [opcao(1, false)])
    expect(menu).toBeNull()
    expect(erro).toBeTruthy()
  })

  it('preserva rodape nulo', () => {
    const { menu } = montarMenu({ ...config, rodape: null }, [opcao(1)])
    expect(menu?.rodape).toBeNull()
  })
})
```

- [ ] **Step 6: Escrever os testes de `decidirBot`**

Cobrir a tabela de decisão inteira do spec mais as duas guardas. Base comum:

```ts
import { describe, it, expect } from 'vitest'
import { decidirBot, BOT_TETO_RESPOSTAS_POR_HORA, BOT_JANELA_LEITURA_SEGUNDOS } from './bot'
import type { BotEntrada } from './bot'

const base: BotEntrada = {
  clienteExiste: true,
  stage: 'awaiting_choice',
  config: { ativo: true, saudacao: 'Olá!', rodape: null, fecho: 'Já chamamos alguém.' },
  opcoes: [
    { botao_id: 'banho_tosa', titulo: 'Banho e Tosa', resposta: 'Fazemos banho e tosa.', ordem: 1, ativo: true },
    { botao_id: 'racoes', titulo: 'Rações', resposta: 'Temos rações.', ordem: 2, ativo: true },
  ],
  botaoId: null,
  menusEnviadosNaUltimaHora: 1,
  respostasNaUltimaHora: 1,
  segundosDesdeUltimaFala: 120,
}
```

Casos obrigatórios:

```ts
it('contato novo recebe saudacao com menu', () => {
  const s = decidirBot({ ...base, clienteExiste: false, stage: null, menusEnviadosNaUltimaHora: 0, respostasNaUltimaHora: 0, segundosDesdeUltimaFala: undefined })
  expect(s.acao).toBe('start')
  expect(s.menu?.formato).toBe('button')
  expect(s.proximoStage).toBe('awaiting_choice')
  expect(s.stageEsperado).toBeNull()
  expect(s.texto).toBeUndefined()
})

it('escolha valida grava o servico e responde com a resposta da opcao', () => {
  const s = decidirBot({ ...base, botaoId: 'racoes' })
  expect(s.acao).toBe('capture_choice')
  expect(s.servico).toBe('racoes')
  expect(s.texto).toBe('Temos rações.\n\nJá chamamos alguém.')
  expect(s.proximoStage).toBe('done')
  expect(s.stageEsperado).toBe('awaiting_choice')
  expect(s.menu).toBeUndefined()
})

it('botao desconhecido reenvia o menu', () => {
  const s = decidirBot({ ...base, botaoId: 'nao_existe' })
  expect(s.acao).toBe('remenu')
  expect(s.menu).toBeTruthy()
  expect(s.proximoStage).toBeUndefined()
})

it('opcao inativa nao pode ser escolhida', () => {
  const opcoes = base.opcoes.map((o) => o.botao_id === 'racoes' ? { ...o, ativo: false } : o)
  expect(decidirBot({ ...base, opcoes, botaoId: 'racoes' }).acao).toBe('remenu')
})

it('texto livre na primeira vez reenvia o menu', () => {
  const s = decidirBot({ ...base, menusEnviadosNaUltimaHora: 1 })
  expect(s.acao).toBe('remenu')
})

it('texto livre na segunda vez desiste e passa pro humano', () => {
  const s = decidirBot({ ...base, menusEnviadosNaUltimaHora: 2 })
  expect(s.acao).toBe('giveup')
  expect(s.proximoStage).toBe('done')
  expect(s.texto).toBeUndefined()
  expect(s.menu).toBeUndefined()
})

it('contato existente fora do fluxo nao recebe nada', () => {
  expect(decidirBot({ ...base, stage: 'done' }).acao).toBe('none')
  expect(decidirBot({ ...base, stage: null }).acao).toBe('none')
})

it('bot desligado nao responde nem para contato novo', () => {
  const s = decidirBot({ ...base, clienteExiste: false, stage: null, config: { ...base.config, ativo: false } })
  expect(s.acao).toBe('none')
})

it('sem opcao ativa nao responde e reporta erro', () => {
  const opcoes = base.opcoes.map((o) => ({ ...o, ativo: false }))
  const s = decidirBot({ ...base, clienteExiste: false, stage: null, opcoes })
  expect(s.acao).toBe('none')
  expect(s.erro).toBeTruthy()
})
```

Guardas — cada uma com o caso que cala **e** o caso que não cala:

```ts
// Teto por hora: no Mar Azul um bot alheio respondeu cada mensagem automatica
// com o proprio menu; os dois trocaram 182 mensagens em 7 minutos.
it('acima do teto de respostas por hora o bot fica mudo', () => {
  const s = decidirBot({ ...base, respostasNaUltimaHora: BOT_TETO_RESPOSTAS_POR_HORA })
  expect(s.acao).toBe('none')
})

it('no teto menos um o bot ainda responde', () => {
  const s = decidirBot({ ...base, respostasNaUltimaHora: BOT_TETO_RESPOSTAS_POR_HORA - 1 })
  expect(s.acao).toBe('remenu')
})

// O teto nao pode calar uma escolha legitima de botao: o cliente apertou, ele
// merece resposta. So silencia o caminho de repergunta.
it('o teto nao bloqueia uma escolha valida', () => {
  const s = decidirBot({ ...base, respostasNaUltimaHora: 99, botaoId: 'racoes' })
  expect(s.acao).toBe('capture_choice')
})

// Janela de leitura: resposta que chega em menos de 10s foi escrita antes de o
// cliente ler o menu. O menu ja esta na tela.
it('resposta invalida dentro da janela de leitura nao gera remenu', () => {
  const s = decidirBot({ ...base, segundosDesdeUltimaFala: BOT_JANELA_LEITURA_SEGUNDOS - 1 })
  expect(s.acao).toBe('none')
})

it('resposta invalida depois da janela gera remenu', () => {
  const s = decidirBot({ ...base, segundosDesdeUltimaFala: BOT_JANELA_LEITURA_SEGUNDOS })
  expect(s.acao).toBe('remenu')
})

it('a janela nao bloqueia escolha valida de botao', () => {
  const s = decidirBot({ ...base, segundosDesdeUltimaFala: 1, botaoId: 'racoes' })
  expect(s.acao).toBe('capture_choice')
})

it('contato novo sem fala anterior do bot nao cai na janela', () => {
  const s = decidirBot({ ...base, clienteExiste: false, stage: null, segundosDesdeUltimaFala: undefined })
  expect(s.acao).toBe('start')
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run src/lib/bot.test.ts`
Expected: FAIL — `Cannot find module './bot'`.

- [ ] **Step 8: Implementar `bot.ts`**

Ordem de avaliação em `decidirBot`, que é o que faz os testes das guardas passarem:

1. `config.ativo === false` -> `none`.
2. Monta o menu. Se `menu === null` -> `none` com `erro`.
3. `clienteExiste === false` -> `start`, `proximoStage: 'awaiting_choice'`, `stageEsperado: null`.
4. `stage !== 'awaiting_choice'` -> `none`.
5. `botaoId` casa com opção **ativa** -> `capture_choice`. **Antes** das guardas: quem apertou o botão merece resposta.
6. Guarda do teto: `respostasNaUltimaHora >= BOT_TETO_RESPOSTAS_POR_HORA` -> `none`.
7. Guarda da janela: `segundosDesdeUltimaFala !== undefined && < BOT_JANELA_LEITURA_SEGUNDOS` -> `none`.
8. `menusEnviadosNaUltimaHora >= 2` -> `giveup` (`proximoStage: 'done'`, `stageEsperado: 'awaiting_choice'`).
9. Senão -> `remenu`.

Texto do `capture_choice`: `` `${opcao.resposta}\n\n${config.fecho}` ``.

- [ ] **Step 9: Rodar tudo e ver passar**

Run: `npx vitest run src/lib/bot.test.ts src/lib/botLimites.test.ts`
Expected: PASS, 9 + 9 + 17 testes.

- [ ] **Step 10: Commit**

```bash
git add agrozet/src/lib/bot.ts agrozet/src/lib/bot.test.ts agrozet/src/lib/botLimites.ts agrozet/src/lib/botLimites.test.ts
git commit -m "feat(agrozet): decisao do bot de botao e limites da Meta"
```

---

### Task 6 — AGENTE B: Meta API, telefone e assinatura

**Files:**
- Create: `src/lib/phoneUtils.ts(+.test.ts)`, `src/lib/waIdentity.ts(+.test.ts)`, `src/lib/janela24h.ts(+.test.ts)`, `src/lib/metaSignature.ts(+.test.ts)`, `src/lib/metaApi.ts(+.test.ts)`

- [ ] **Step 1: Copiar os quatro módulos puros com seus testes**

Copiar de `../mar-azul-system-main/src/lib/`, sem alteração: `phoneUtils.ts`, `waIdentity.ts`, `janela24h.ts`, `metaSignature.ts` e os `.test.ts` correspondentes. São lógica pura e já testada.

- [ ] **Step 2: Rodar os testes copiados**

Run: `npx vitest run src/lib/phoneUtils.test.ts src/lib/waIdentity.test.ts src/lib/janela24h.test.ts src/lib/metaSignature.test.ts`
Expected: PASS. Se algum teste importar algo que não copiamos (`manutencao`, `instances`), **apague aquele caso de teste** — não traga a dependência.

- [ ] **Step 3: Escrever o teste de `buildInteractivePayload`**

```ts
import { describe, it, expect } from 'vitest'
import { buildInteractivePayload } from './metaApi'
import type { BotMenu } from './botTypes'

describe('buildInteractivePayload', () => {
  it('monta reply buttons', () => {
    const menu: BotMenu = {
      formato: 'button',
      corpo: 'Em que podemos ajudar?',
      rodape: 'Agrozet',
      botoes: [{ id: 'banho_tosa', titulo: 'Banho e Tosa' }],
    }
    expect(buildInteractivePayload('5534999990000', menu)).toEqual({
      messaging_product: 'whatsapp',
      to: '5534999990000',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Em que podemos ajudar?' },
        footer: { text: 'Agrozet' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'banho_tosa', title: 'Banho e Tosa' } }],
        },
      },
    })
  })

  it('omite o footer quando o rodape e nulo', () => {
    const menu: BotMenu = { formato: 'button', corpo: 'oi', rodape: null, botoes: [{ id: 'a', titulo: 'A' }] }
    const payload = buildInteractivePayload('5534999990000', menu)
    expect((payload.interactive as Record<string, unknown>).footer).toBeUndefined()
  })

  it('monta lista com uma secao', () => {
    const menu: BotMenu = {
      formato: 'list',
      corpo: 'Escolha:',
      rodape: null,
      rotulo: 'Ver serviços',
      itens: [{ id: 'a', titulo: 'A' }, { id: 'b', titulo: 'B' }],
    }
    const payload = buildInteractivePayload('5534999990000', menu)
    const interactive = payload.interactive as Record<string, unknown>
    expect(interactive.type).toBe('list')
    expect(interactive.action).toEqual({
      button: 'Ver serviços',
      sections: [{ rows: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }],
    })
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/lib/metaApi.test.ts`
Expected: FAIL — `buildInteractivePayload is not a function`.

- [ ] **Step 5: Escrever `metaApi.ts`**

Partir de `../mar-azul-system-main/src/lib/metaApi.ts` e:

- **Remover** o import e a checagem de `emManutencao`/`ManutencaoError`, o parâmetro `phoneId` de toda função (há um número só, vem sempre de `NEXT_PUBLIC_META_PHONE_ID`), `sendWhatsAppReaction`, `sendWhatsAppContact`, e tudo de template de disparo (volta na Fase 3).
- **Manter** `GRAPH_BASE = 'https://graph.facebook.com/v22.0'`, `metaPost`, `extractMessageId`, e o comentário sobre `META_TOKEN` ser server-only.
- **Acrescentar** `buildInteractivePayload` (puro, exportado) e `sendWhatsAppInteractive` (chama o payload e faz o POST).
- **Acrescentar** `uploadMetaMedia`, `getMetaMediaUrl`, `downloadMetaMedia` — `GET /{media-id}` devolve `{ url, mime_type }` e a URL só vale uns minutos e **exige o header `Authorization`** para o download.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/`
Expected: PASS em todos.

- [ ] **Step 7: Commit**

```bash
git add agrozet/src/lib/phoneUtils.* agrozet/src/lib/waIdentity.* agrozet/src/lib/janela24h.* agrozet/src/lib/metaSignature.* agrozet/src/lib/metaApi.*
git commit -m "feat(agrozet): cliente da Meta API com mensagem interativa"
```

---

### Task 7 — AGENTE C: Autenticação e navegação

**Files:**
- Create: `middleware.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/Sidebar.tsx`, `src/hooks/useIsAdmin.ts`

- [ ] **Step 1: Copiar e adaptar o middleware**

Copiar `../mar-azul-system-main/middleware.ts`. Manter o refresh de sessão do `@supabase/ssr` e o redirect para `/login` quando não há sessão. **Remover** qualquer referência a instância ou a `user_phone_ids`. O `matcher` deve excluir `/api/webhook` e `/api/cron/*`: a Meta e o `pg_cron` não têm cookie de sessão, e um redirect ali derruba o webhook.

- [ ] **Step 2: Login**

`src/app/(auth)/login/page.tsx`: e-mail + senha via `signInWithPassword` do cliente browser, `react-hook-form` + `zod`, erro em `toast.error`, sucesso -> `router.replace('/conversas')`. Logo em `../site-agrozet/assets/logo/agrozet-logo-web.png`, copiada para `public/agrozet-logo.png`.

- [ ] **Step 3: Sidebar e layout autenticado**

`Sidebar.tsx`: links para `/conversas`, `/clientes`, `/disparos`, e `/bot` + `/erros` **só quando admin**. Item ativo destacado com o laranja da marca. Na Fase 1 `/clientes`, `/disparos`, `/bot` e `/erros` ainda não existem — renderize os links já, **desabilitados**, com `title="Em breve"`. Isso evita que a Fase 2 precise editar este arquivo (ele pertence a este agente).

`src/app/(app)/layout.tsx`: checa sessão no servidor, redireciona para `/login` se não houver, e renderiza Sidebar + conteúdo.
`src/app/(app)/page.tsx`: `redirect('/conversas')`.

- [ ] **Step 4: `useIsAdmin`**

```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { getBrowserSupabase } from '@/lib/supabase-browser'

/** admin = role 'admin' no user_metadata, a mesma fonte que a funcao is_admin() do banco le. */
export function useIsAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ['is-admin'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await getBrowserSupabase().auth.getUser()
      return data.user?.user_metadata?.role === 'admin'
    },
  })
  return { isAdmin: data ?? false, isLoading }
}
```

- [ ] **Step 5: Verificar**

Run: `npm run build && npm run lint`
Expected: ambos passam.

Smoke manual: `npm run dev`, abrir `/conversas` sem sessão -> redireciona para `/login`. Criar um usuário pelo dashboard (Authentication -> Users -> Add user; **nunca** por INSERT em `auth.users`) e logar -> cai em `/conversas`.

- [ ] **Step 6: Commit**

```bash
git add agrozet/middleware.ts agrozet/src/app/\(auth\)/ agrozet/src/app/\(app\)/ agrozet/src/components/Sidebar.tsx agrozet/src/hooks/useIsAdmin.ts agrozet/public/agrozet-logo.png
git commit -m "feat(agrozet): autenticacao Supabase e navegacao"
```

---

### Task 8 — AGENTE D: Mídia com compressão

**Files:**
- Create: `src/lib/mediaStorage.ts`, `src/lib/mediaStorage.test.ts`

É aqui que mora a defesa do 1 GB de Storage do plano free.

- [ ] **Step 1: Criar o bucket**

No dashboard do Supabase: Storage -> New bucket -> nome `media`, **privado** (não público). Acesso só por URL assinada.

- [ ] **Step 2: Escrever os testes**

`comprimirImagem` usa `sharp` de verdade sobre um PNG gerado em memória — é CPU local, não rede, então o teste é legítimo e não mocka nada.

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { comprimirImagem, caminhoMidia } from './mediaStorage'

async function pngDe(largura: number, altura: number): Promise<ArrayBuffer> {
  const buf = await sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 90, b: 30 } },
  }).png().toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('comprimirImagem', () => {
  it('devolve webp', async () => {
    const { buffer, mime } = await comprimirImagem(await pngDe(400, 300))
    expect(mime).toBe('image/webp')
    expect((await sharp(buffer).metadata()).format).toBe('webp')
  })

  it('reduz o maior lado para 1280', async () => {
    const { buffer } = await comprimirImagem(await pngDe(4000, 3000))
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(1280)
    expect(meta.height).toBe(960)
  })

  it('reduz o maior lado tambem no retrato', async () => {
    const { buffer } = await comprimirImagem(await pngDe(3000, 4000))
    const meta = await sharp(buffer).metadata()
    expect(meta.height).toBe(1280)
    expect(meta.width).toBe(960)
  })

  // Sem isso, uma foto pequena sairia ESTICADA do "redimensionamento".
  it('nao amplia imagem menor que 1280', async () => {
    const { buffer } = await comprimirImagem(await pngDe(300, 200))
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(300)
    expect(meta.height).toBe(200)
  })

  // A razao de existir do modulo: o Storage free tem 1 GB.
  it('encolhe bastante uma foto grande', async () => {
    const entrada = await pngDe(4000, 3000)
    const { buffer } = await comprimirImagem(entrada)
    expect(buffer.byteLength).toBeLessThan(entrada.byteLength / 5)
  })
})

describe('caminhoMidia', () => {
  it('usa extensao webp para imagem', () => {
    expect(caminhoMidia('wamid.ABC', 'image/webp')).toBe('wamid.ABC.webp')
  })

  it('usa ogg para audio', () => {
    expect(caminhoMidia('wamid.ABC', 'audio/ogg')).toBe('wamid.ABC.ogg')
  })

  it('cai em bin para mime desconhecido', () => {
    expect(caminhoMidia('wamid.ABC', 'application/zip')).toBe('wamid.ABC.bin')
  })

  // message_id da Meta tem ponto e pode ter = e /; o path do Storage nao aceita.
  it('sanitiza caracteres invalidos de path', () => {
    expect(caminhoMidia('wamid.A/B=C', 'image/webp')).toBe('wamid.A_B_C.webp')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/mediaStorage.test.ts`
Expected: FAIL — `Cannot find module './mediaStorage'`.

- [ ] **Step 4: Implementar**

```ts
import sharp from 'sharp'

export const BUCKET = 'media'
export const MAX_LADO = 1280
export const QUALIDADE_WEBP = 80

/**
 * Storage do Supabase free tem 1 GB. Foto de celular de 3 MB vira ~60-120 KB
 * aqui (fator ~25x), o que e a diferenca entre o bucket durar meses ou anos.
 * `withoutEnlargement` evita esticar foto pequena.
 */
export async function comprimirImagem(entrada: ArrayBuffer) {
  const buffer = await sharp(Buffer.from(entrada))
    .rotate() // respeita o EXIF antes de redimensionar
    .resize({ width: MAX_LADO, height: MAX_LADO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALIDADE_WEBP })
    .toBuffer()
  return { buffer, mime: 'image/webp' as const }
}

const EXTENSAO: Record<string, string> = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'video/mp4': 'mp4', 'application/pdf': 'pdf',
}

export function caminhoMidia(messageId: string, mime: string): string {
  const base = messageId.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${base}.${EXTENSAO[mime.split(';')[0]] ?? 'bin'}`
}
```

`armazenarMidia` encadeia `getMetaMediaUrl` -> `downloadMetaMedia` -> comprime se `mime` começa com `image/` (senão grava como veio) -> `upload` no bucket com `upsert: true`. Qualquer falha -> `logOperationalError('mediaStorage.armazenarMidia', ...)` e devolve `null`: mídia que não baixou **não pode derrubar o webhook**.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/mediaStorage.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add agrozet/src/lib/mediaStorage.ts agrozet/src/lib/mediaStorage.test.ts
git commit -m "feat(agrozet): armazenamento de midia com compressao webp"
```

---

## Onda 2 — três agentes em paralelo

Depende da Onda 1 inteira estar commitada.

### Task 9 — AGENTE E: Webhook

**Files:**
- Create: `src/lib/webhookPayload.ts`, `src/lib/webhookPayload.test.ts`, `src/app/api/webhook/route.ts`

- [ ] **Step 1: Escrever os testes de `webhookPayload`**

Toda a extração de dados do payload da Meta é pura e vai para `webhookPayload.ts`, para que a rota fique só com I/O.

```ts
import { describe, it, expect } from 'vitest'
import { extrairMensagens, extrairConteudo, extrairBotaoId, extrairStatuses, tipoDaMensagem } from './webhookPayload'

const envelope = (message: unknown) => ({
  entry: [{ changes: [{ value: { contacts: [{ wa_id: '5534999990000', profile: { name: 'Rafael' } }], messages: [message] } }] }],
})

describe('extrairBotaoId', () => {
  it('le button_reply', () => {
    expect(extrairBotaoId({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'racoes', title: 'Rações' } } })).toBe('racoes')
  })

  it('le list_reply', () => {
    expect(extrairBotaoId({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'banho_tosa', title: 'Banho' } } })).toBe('banho_tosa')
  })

  it('devolve null para texto', () => {
    expect(extrairBotaoId({ type: 'text', text: { body: 'oi' } })).toBeNull()
  })

  // Botao de template (quick reply) chega como type 'button', nao 'interactive'.
  it('devolve null para botao de template', () => {
    expect(extrairBotaoId({ type: 'button', button: { payload: 'x', text: 'Parar' } })).toBeNull()
  })
})

describe('extrairConteudo', () => {
  it('le texto', () => {
    expect(extrairConteudo({ type: 'text', text: { body: 'bom dia' } })).toBe('bom dia')
  })

  it('le o titulo do botao apertado', () => {
    expect(extrairConteudo({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'racoes', title: 'Rações' } } })).toBe('Rações')
  })

  it('le a legenda da imagem', () => {
    expect(extrairConteudo({ type: 'image', image: { id: '1', caption: 'olha o Thor' } })).toBe('olha o Thor')
  })

  it('devolve null para imagem sem legenda', () => {
    expect(extrairConteudo({ type: 'image', image: { id: '1' } })).toBeNull()
  })
})

describe('extrairMensagens', () => {
  it('traz wa_id, nome de perfil e a mensagem', () => {
    const [m] = extrairMensagens(envelope({ id: 'wamid.1', type: 'text', text: { body: 'oi' }, timestamp: '1760000000' }))
    expect(m.waId).toBe('5534999990000')
    expect(m.profileName).toBe('Rafael')
    expect(m.messageId).toBe('wamid.1')
  })

  it('devolve lista vazia para payload sem mensagem', () => {
    expect(extrairMensagens({ entry: [{ changes: [{ value: {} }] }] })).toEqual([])
  })

  it('nao explode com payload malformado', () => {
    expect(extrairMensagens({})).toEqual([])
    expect(extrairMensagens(null)).toEqual([])
  })
})

describe('extrairStatuses', () => {
  it('le o status de entrega', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] }
    expect(extrairStatuses(payload)).toEqual([{ messageId: 'wamid.1', status: 'delivered' }])
  })
})

describe('tipoDaMensagem', () => {
  it('mapeia os tipos que a UI conhece', () => {
    expect(tipoDaMensagem({ type: 'text' })).toBe('text')
    expect(tipoDaMensagem({ type: 'interactive' })).toBe('interactive')
    expect(tipoDaMensagem({ type: 'image' })).toBe('image')
    expect(tipoDaMensagem({ type: 'audio' })).toBe('audio')
  })

  it('cai em text para tipo desconhecido', () => {
    expect(tipoDaMensagem({ type: 'sticker_pack_v7' })).toBe('text')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/webhookPayload.test.ts`
Expected: FAIL — `Cannot find module './webhookPayload'`.

- [ ] **Step 3: Implementar `webhookPayload.ts`**

Funções puras com acesso defensivo (`?.`, `Array.isArray`). Nenhuma lança: payload malformado devolve vazio/`null`, nunca exceção, porque uma exceção aqui viraria 500 e a Meta reentregaria em loop.

- [ ] **Step 4: Implementar a rota — `GET`**

```ts
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}
```

- [ ] **Step 5: Implementar a rota — `POST`**

Exatamente na ordem do spec. Os quatro pontos onde errar custa caro:

```ts
export async function POST(request: NextRequest) {
  // 1. Assinatura. A URL do webhook nao e secreta: sem HMAC qualquer um
  // escreve no banco com service_role.
  const raw = await request.text()
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET ?? '')) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  try {
    await processar(JSON.parse(raw))
  } catch (e) {
    // 3. NUNCA 500 por erro nao-fatal: 500 faz a Meta reentregar em loop.
    await logOperationalError('webhook.POST', e instanceof Error ? e.message : String(e))
  }
  return NextResponse.json({ ok: true })
}
```

Dentro de `processar`, **por mensagem e sequenciado** (não `Promise.all`):

```ts
// 2. wa_id e a identidade canonica. No Mar Azul o 9o digito do cadastro
// divergiu do WhatsApp em 32 de 50 disparos; usar o numero enviado em vez do
// wa_id racha a conversa em dois cards.
const phone = m.waId

// 4. Gate de idempotencia. Array vazio = reentrega da Meta -> sai sem nenhum
// efeito de bot. Sem isso o bot responde duas vezes.
const { data: inserida } = await admin
  .from('messages')
  .upsert({ message_id: m.messageId, phone, direction: 'inbound', content: extrairConteudo(m.raw), message_type: tipoDaMensagem(m.raw) },
          { onConflict: 'message_id', ignoreDuplicates: true })
  .select('id')
if (!inserida?.length) return
```

Depois: carrega `clientes` (`phone, bot_stage`) — **sem upsert, o trigger é o dono**; conta `menusEnviadosNaUltimaHora` e `respostasNaUltimaHora` e calcula `segundosDesdeUltimaFala` em uma consulta a `messages` (outbound da última hora, `created_at desc`); lê `bot_config` + `bot_opcoes`; chama `decidirBot`; aplica o `UPDATE` condicional em `clientes` (`.eq('bot_stage', stageEsperado)` ou `.is('bot_stage', null)`); envia pela Meta (`sendWhatsAppInteractive` ou `sendWhatsAppMessage`) e grava o `outbound`; se houver mídia, `armazenarMidia` e preenche `media_path`; se `saida.erro`, `logOperationalError('webhook.decidirBot', saida.erro)`.

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/lib/webhookPayload.test.ts && npm run build && npm run lint`
Expected: 13 testes PASS, build e lint limpos.

Smoke do handshake:
Run: `curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=42"`
Expected: `42`

Smoke da assinatura (deve recusar):
Run: `curl -i -X POST http://localhost:3000/api/webhook -H 'content-type: application/json' -d '{}'`
Expected: `401`

- [ ] **Step 7: Commit**

```bash
git add agrozet/src/lib/webhookPayload.* agrozet/src/app/api/webhook/
git commit -m "feat(agrozet): webhook da Meta com assinatura, idempotencia e bot"
```

---

### Task 10 — AGENTE F: Tela de conversas

**Files:**
- Create: `src/lib/listaConversas.ts`, `src/lib/listaConversas.test.ts`
- Create: `src/hooks/useConversas.ts`, `src/hooks/useMensagens.ts`
- Create: `src/components/conversations/{ConversationList,ChatHeader,MessageTimeline,MessageBubble,MessageComposer}.tsx`
- Create: `src/components/Conversations.tsx`, `src/app/(app)/conversas/page.tsx`

Consome `/api/send-message`, `/api/upload-media` e `/api/media-url`, que são do Agente G e podem não existir ainda. **Programe contra o contrato, não contra o arquivo** — a integração é a Task 12.

| Rota | Body | Resposta |
|---|---|---|
| `POST /api/send-message` | `{ phone, text }` | `{ messageId }` |
| `POST /api/upload-media` | `FormData` com `file` e `phone` | `{ messageId }` |
| `GET /api/media-url?path=...` | — | `{ url }` |

- [ ] **Step 1: Escrever os testes de `listaConversas`**

```ts
import { describe, it, expect } from 'vitest'
import { montarLista, estaPendente } from './listaConversas'

const msg = (phone: string, direction: 'inbound' | 'outbound', iso: string, content = 'oi') =>
  ({ phone, direction, created_at: iso, content, message_type: 'text' })

describe('estaPendente', () => {
  // Pendente e DERIVADO: a ultima mensagem e inbound. Com um numero so e todos
  // vendo tudo, "lida por quem?" nao tem resposta util, entao nao existe
  // conversation_reads nem contador por usuario.
  it('e pendente quando a ultima mensagem e do cliente', () => {
    expect(estaPendente([msg('1', 'outbound', '2026-10-05T10:00:00Z'), msg('1', 'inbound', '2026-10-05T11:00:00Z')])).toBe(true)
  })

  it('nao e pendente quando nos respondemos por ultimo', () => {
    expect(estaPendente([msg('1', 'inbound', '2026-10-05T10:00:00Z'), msg('1', 'outbound', '2026-10-05T11:00:00Z')])).toBe(false)
  })

  it('ignora a ordem do array e olha o timestamp', () => {
    expect(estaPendente([msg('1', 'inbound', '2026-10-05T11:00:00Z'), msg('1', 'outbound', '2026-10-05T10:00:00Z')])).toBe(true)
  })

  it('conversa vazia nao e pendente', () => {
    expect(estaPendente([])).toBe(false)
  })
})

describe('montarLista', () => {
  it('agrupa por telefone e traz a ultima mensagem', () => {
    const lista = montarLista([
      msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z', 'primeira'),
      msg('5534999990000', 'inbound', '2026-10-05T12:00:00Z', 'ultima'),
    ], [])
    expect(lista).toHaveLength(1)
    expect(lista[0].ultimaMensagem).toBe('ultima')
  })

  it('poe pendentes antes de respondidas, mesmo sendo mais antigas', () => {
    const lista = montarLista([
      msg('AAA', 'inbound', '2026-10-05T08:00:00Z'),
      msg('BBB', 'inbound', '2026-10-05T12:00:00Z'),
      msg('BBB', 'outbound', '2026-10-05T12:05:00Z'),
    ], [])
    expect(lista.map((c) => c.phone)).toEqual(['AAA', 'BBB'])
  })

  it('entre pendentes, a mais recente primeiro', () => {
    const lista = montarLista([
      msg('AAA', 'inbound', '2026-10-05T08:00:00Z'),
      msg('BBB', 'inbound', '2026-10-05T12:00:00Z'),
    ], [])
    expect(lista.map((c) => c.phone)).toEqual(['BBB', 'AAA'])
  })

  it('traz nome e etiqueta de servico do cliente', () => {
    const lista = montarLista(
      [msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z')],
      [{ phone: '5534999990000', nome: 'Rafael', ultimo_servico: 'banho_tosa' }]
    )
    expect(lista[0].nome).toBe('Rafael')
    expect(lista[0].ultimoServico).toBe('banho_tosa')
  })

  it('cliente sem cadastro ainda aparece na lista', () => {
    const lista = montarLista([msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z')], [])
    expect(lista[0].nome).toBeNull()
  })

  // Egress do free tier e 5 GB/mes: a lista nunca carrega imagem.
  it('rotula imagem sem legenda em vez de expor o path', () => {
    const lista = montarLista(
      [{ phone: '1', direction: 'inbound', created_at: '2026-10-05T10:00:00Z', content: null, message_type: 'image' }],
      []
    )
    expect(lista[0].ultimaMensagem).toBe('Foto')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/listaConversas.test.ts`
Expected: FAIL — `Cannot find module './listaConversas'`.

- [ ] **Step 3: Implementar `listaConversas.ts`**

Puro. `estaPendente` olha a mensagem de maior `created_at`. `montarLista` agrupa por `phone`, junta com os clientes por `phone`, e ordena por `(pendente desc, ultimaEm desc)`. Rótulo de mídia sem legenda: `Foto`, `Áudio`, `Documento`, `Vídeo`.

- [ ] **Step 4: Hooks**

`useConversas`: `useQuery` lendo `messages` (últimos 90 dias, campos da lista — **nunca `media_path`**) + `clientes`, passando por `montarLista`. `refetchInterval: 15000`.
`useMensagens(phone)`: `useQuery` da timeline daquele telefone, `enabled: !!phone`.

Realtime do Supabase fica para a Fase 2: um `refetchInterval` de 15 s resolve a Fase 1 sem o custo de conexão aberta e do egress de uma subscrição por aba.

- [ ] **Step 5: Componentes**

`ConversationList`: coluna esquerda, badge laranja de pendente, `Badge` com a etiqueta do `ultimoServico`.
`ChatHeader`: nome ou telefone formatado + etiqueta do serviço.
`MessageTimeline` + `MessageBubble`: `inbound` à esquerda, `outbound` à direita; `message_type: 'interactive'` renderiza o corpo mais os botões como chips desabilitados, para o atendente ver o que o cliente viu; imagem só busca `/api/media-url` **quando o balão entra em viewport**, e mídia com `media_path` nulo mostra "mídia expirada".
`MessageComposer`: textarea + envio por Enter + anexo de imagem. Desabilitado com aviso quando a janela de 24 h estiver fechada (`janela24h.ts`) — fora dela a Meta só aceita template.

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/lib/listaConversas.test.ts && npm run build && npm run lint`
Expected: 11 testes PASS, build e lint limpos.

- [ ] **Step 7: Commit**

```bash
git add agrozet/src/lib/listaConversas.* agrozet/src/hooks/ agrozet/src/components/conversations/ agrozet/src/components/Conversations.tsx agrozet/src/app/\(app\)/conversas/
git commit -m "feat(agrozet): tela de conversas com timeline e composer"
```

---

### Task 11 — AGENTE G: Rotas de envio e mídia

**Files:**
- Create: `src/app/api/send-message/route.ts`, `src/app/api/upload-media/route.ts`, `src/app/api/media-url/route.ts`

Honre o contrato da tabela da Task 10 **ao pé da letra** — o Agente F já está programando contra ele.

- [ ] **Step 1: `POST /api/send-message`**

Valida sessão pelo cliente server-side (não `service_role`: quem manda mensagem é um atendente logado, e sem a checagem a rota é um proxy público para o número do petshop). Zod em `{ phone: string, text: string }` com `text` entre 1 e 4096. Chama `sendWhatsAppMessage`, grava o `outbound` em `messages` (`message_type: 'text'`, `direction: 'outbound'`, `message_id` da Meta com fallback `outbound_${crypto.randomUUID()}`). Devolve `{ messageId }`.

- [ ] **Step 2: `POST /api/upload-media`**

Sessão validada. `FormData` com `file` e `phone`. Aceita só `image/jpeg|png|webp` e no máximo 5 MB — o limite é do Storage free, não da Meta. Fluxo: `comprimirImagem` -> `uploadMetaMedia` (para a Meta entregar) -> `sendWhatsAppMedia` -> grava no bucket `media` com `caminhoMidia` -> insere o `outbound` com `media_path` e `media_mime`. Devolve `{ messageId }`.

Comprime **antes** de subir para os dois lados: o cliente recebe mais rápido e o bucket gasta ~25x menos.

- [ ] **Step 3: `GET /api/media-url`**

Sessão validada. `?path=` é obrigatório e precisa casar `^[A-Za-z0-9._-]+$` — sem isso o parâmetro permite escapar do prefixo do bucket. `createSignedUrl(path, 604800)` (7 dias, para o browser cachear e poupar o egress de 5 GB/mês). Devolve `{ url }`, ou 404 quando o objeto não existe.

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint`
Expected: ambos passam.

Run: `curl -i -X POST http://localhost:3000/api/send-message -H 'content-type: application/json' -d '{"phone":"5534999990000","text":"teste"}'`
Expected: `401` sem cookie de sessão.

- [ ] **Step 5: Commit**

```bash
git add agrozet/src/app/api/send-message/ agrozet/src/app/api/upload-media/ agrozet/src/app/api/media-url/
git commit -m "feat(agrozet): rotas de envio de mensagem e midia"
```

---

## Onda 3 — integração serial

### Task 12: Fechar a Fase 1

**Files:**
- Modify: o que a integração exigir
- Create: `README.md`, `SETUP.md`, `CLAUDE.md`, `TREE.md`

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm run test`
Expected: PASS em todos (≈70 testes entre as tasks 5, 6, 8, 9, 10).

- [ ] **Step 2: Build e lint**

Run: `npm run build && npm run lint`
Expected: limpos. Conflito de tipo entre o que o Agente F presumiu e o que o Agente G entregou aparece **aqui** — corrigir a favor do contrato da Task 10.

- [ ] **Step 3: Smoke de ponta a ponta**

Com `ngrok http 3000` e o webhook apontado para `<url>/api/webhook` no app da Meta:

1. Mandar "oi" de um número que nunca escreveu -> chega o menu com 3 botões.
2. Apertar "Rações e Produtos" -> chega a resposta da opção + o fecho.
3. Verificar no banco: `SELECT phone, bot_stage, ultimo_servico FROM clientes WHERE phone = '<seu numero>'` -> `done` e `racoes`.
4. Mandar "oi" de novo -> **nada** do bot (stage `done`). A conversa aparece pendente na `/conversas`.
5. Responder pela tela -> chega no WhatsApp e a conversa sai da pendência.
6. Mandar uma foto -> aparece na timeline; conferir no bucket que o objeto é `.webp` e tem menos de 200 KB.

- [ ] **Step 4: Documentar**

`SETUP.md`: criar projeto Supabase, aplicar a migration, criar o bucket `media` privado, criar o usuário pelo dashboard (**nunca** por INSERT em `auth.users`), configurar o app da Meta e o webhook, variáveis na Vercel.

`CLAUDE.md` do Agrozet, com as armadilhas que já conhecemos: `META_TOKEN` é server-only; o webhook não faz upsert em `clientes` (o trigger é o dono); o gate de idempotência é o `select('id')` vazio; webhook nunca devolve 500; o cron é `pg_cron` no Supabase porque o Vercel Hobby só roda 1x/dia; disparo (Fase 3) se enfileira só pela rota. **Vercel Hobby é não-comercial** — risco assumido, rota de saída no spec.

`README.md` e `TREE.md`: visão geral e a árvore real do projeto.

- [ ] **Step 5: Verificação antes de declarar pronto**

REQUIRED SUB-SKILL: use `superpowers:verification-before-completion`. Nada de "Fase 1 concluída" sem a saída dos comandos colada.

- [ ] **Step 6: Commit**

```bash
git add agrozet/
git commit -m "feat(agrozet): fecha a Fase 1 com documentacao e smoke de ponta a ponta"
```

---

## Depois da Fase 1

Fases 2 e 3 do spec ganham planos próprios, escritos quando a Fase 1 estiver verificada:

- **Fase 2** — `docs/superpowers/plans/<data>-fase2-cadastro-e-admin-do-bot.md`: `/clientes` com pets, `/bot` com CRUD e preview, `/erros`.
- **Fase 3** — `docs/superpowers/plans/<data>-fase3-disparos-e-capacidade.md`: `/disparos`, `schedule-disparo`, `process-disparos` com reaper, retenção, `pg_cron`.

Escrever esses planos em detalhe TDD agora seria chute sobre assinaturas que ainda não existem.
