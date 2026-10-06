# CRM Agrozet — Reativação

**Para quem abre este projeto numa sessão nova.** Leia isto primeiro; ele diz
onde o projeto parou, o que é real, o que é maquete, e qual é o próximo passo.

**Última atualização:** 2026-10-05

---

## 1. O que é

CRM de atendimento WhatsApp do **Pet Shop Agrozet** (banho e tosa, rações,
agropecuária — Segismundo Pereira, Uberlândia). Um número na API oficial da Meta,
atendido por humanos, com um **bot de botão** que faz a triagem inicial: o cliente
escolhe o serviço num menu, recebe uma resposta pronta, e cai na fila do atendente
já etiquetado pelo assunto.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Base UI ·
TanStack Query 5 · Supabase (Auth + Postgres + Storage) · Meta Graph API v22.0 ·
Vitest. Hospedagem pretendida: Vercel Hobby + Supabase free.

Nasceu de `../mar-azul-system-main` (CRM de promotora de crédito, mesmo autor,
35.141 linhas e 298 migrations), **reconstruído enxuto** em vez de copiado — a
peça que o Agrozet cortou (multi-instância) estava tecida em 40 arquivos.

**Documentos, em ordem de leitura:**

| Arquivo | O quê |
|---|---|
| `docs/superpowers/specs/2026-10-05-agrozet-crm-design.md` | O spec aprovado. A fonte de verdade das decisões. |
| `CLAUDE.md` | 18 regras com o porquê. **Leia antes de mexer no código.** |
| `docs/superpowers/plans/2026-10-05-fase1-fundacao-e-bot.md` | O plano da Fase 1, já executado. |
| `SETUP.md` | Como pôr de pé do zero (Supabase, Meta, Vercel). |
| `TREE.md` | Árvore comentada. |

---

## 2. Estado atual, sem maquiagem

**Fase 1 implementada e verificada: 129 testes, `tsc`/`lint`/`build` limpos.**

Mas: **o sistema nunca rodou contra um Supabase real.** Não existe projeto, a
migration nunca foi aplicada, não existe app na Meta, nenhum número foi aprovado,
e o smoke de ponta a ponta nunca aconteceu. Tudo que está verificado é teste de
unidade sobre lógica pura, type-check e build.

| Área | Estado |
|---|---|
| Schema (8 tabelas, RLS, 3 triggers) | Escrito, **nunca aplicado** |
| `database.types.ts` | **Escrito à mão** a partir do SQL. Regenerar assim que houver projeto. |
| Bot de botão (`src/lib/bot.ts`) | Pronto, puro, 33 testes |
| Webhook da Meta | Pronto, com assinatura HMAC, idempotência e guardas |
| Tela de conversas | Pronta |
| Auth Supabase | Pronta |
| Mídia com compressão WebP | Pronta (21,7x medidos) |
| Telas `/clientes`, `/disparos`, `/bot`, `/erros` | **Maquete** (modo mock) |
| Disparos agendados, crons, retenção | **Não implementado** (Fase 3) |

### Modo mock — como o projeto roda hoje

Para mostrar o CRM à dona do petshop antes de existir infraestrutura, o projeto
roda **desacoplado do Supabase e com login desativado**, atrás de uma flag:

```sh
# .env.local
NEXT_PUBLIC_MOCK=1
```

```bash
npm run dev     # http://localhost:3000 -> entra direto no CRM
```

- **A flag é `false` por padrão.** Sem a variável, o app exige sessão e usa o
  Supabase de verdade, exatamente como em produção. Um deploy que esqueça a
  variável é seguro, não exposto.
- **A flag não olha `NODE_ENV`**, de propósito: preview da Vercel roda como
  produção, e amarrar o modo demonstração ao ambiente abriria o CRM num preview.
- Os dados vivem em `src/lib/mock/store.ts` (memória, zero I/O), semeados de
  `src/lib/demo/dados.ts` — 6 conversas realistas de petshop.
- Uma faixa no topo deixa explícito que é demonstração.

**Ao desligar o modo mock**, confira: `NEXT_PUBLIC_MOCK` fora do ambiente, login
voltando a pedir senha, e `/clientes`, `/disparos`, `/bot`, `/erros` voltando a
aparecer desabilitados na Sidebar (são maquete, não existem no backend).

### `/demo` — a vitrine

Existe também `/demo` e `/demo/crm`: uma página de apresentação com um
**simulador de WhatsApp** que roda a lógica real do bot no browser (`bot.ts` é
pura, então `decidirBot` executa client-side sem infraestrutura). É pública por
construção, isolada do CRM real.

Foi construída antes da mudança de rumo para "o CRM em si como mockup". **Pode
ser apagada sem efeito colateral** (`src/app/demo/`, `src/components/demo/`,
`src/lib/demo/simulador*`), desde que `src/lib/demo/dados.ts` fique — o store do
modo mock é semeado dele.

---

## 3. O que falta para sair do mockup

Em ordem de dependência. Os passos 1 a 4 destravam tudo o mais.

1. **Criar o projeto Supabase** (free). Pegar URL, `anon key`, `service_role key`.
2. **Aplicar** `supabase/migrations/20261005000000_baseline_agrozet.sql`.
   Conferir: `SELECT count(*) FROM bot_opcoes WHERE ativo` → `3`; e
   `rowsecurity = true` nas 8 tabelas.
3. **Regenerar os tipos** — obrigatório, e de novo após **qualquer** DDL:
   ```bash
   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
   ```
4. **Criar o bucket `media`**, privado (não público).
5. **Criar usuário** pelo dashboard (Authentication → Users → Add user).
   **Nunca por INSERT em `auth.users`.** Admin = `{"role":"admin"}` no
   `user_metadata`.
6. **App na Meta**: `META_TOKEN` (System User, permanente), `phone_id`,
   `META_WABA_ID`, `META_APP_SECRET`, e um `META_VERIFY_TOKEN` seu.
7. **`.env.local`** a partir do `.env.local.example`, **sem** `NEXT_PUBLIC_MOCK`.
8. **Webhook na Meta**: `https://<dominio>/api/webhook`, assinar o campo
   `messages`. Local: `ngrok http 3000`.
9. **Deploy na Vercel** e **desativar Deployment Protection** — com ela ativa a
   Meta recebe 401 no webhook.
10. **Smoke de ponta a ponta** (o passo que nunca aconteceu): mandar "oi" de um
    número novo → receber o menu → tocar um botão → receber a resposta → conferir
    no banco que `bot_stage = 'done'` e `ultimo_servico` foi gravado → responder
    pela tela e ver chegar no WhatsApp.

Detalhe de cada passo em `SETUP.md`.

---

## 4. Próximas fases

Cada fase ganha spec e plano próprios antes de implementar.

**Fase 2 — cadastro e admin do bot.** `/clientes` com pets, `/bot` com CRUD e
preview, `/erros`. Hoje são maquete; falta backend, persistência e RLS de escrita.

**Fase 3 — disparos e capacidade.** `/disparos`, `POST /api/schedule-disparo`,
`POST /api/cron/process-disparos` com reaper, retenção de mídia, e os dois jobs
de `pg_cron`. **Disparo custa dinheiro por mensagem na Meta** — alinhar com a
cliente antes de prometer.

---

## 5. Riscos e decisões em aberto

**Egress do plano free (achado da revisão, não resolvido).** O polling de 15 s da
lista de conversas gasta ~360 MB por aba num turno de 8 h — **~8 GB/mês com uma
aba só**, contra os 5 GB do free. Todo o cuidado de egress foi gasto em mídia e
ninguém multiplicou o custo da consulta que roda sem parar. Precisa de decisão
antes de fechar o primeiro mês real: polling de 30–60 s, `limit` menor, colunas
mais estreitas, ou Realtime. **Medir o egress real na primeira semana.**

**Vercel Hobby proíbe uso comercial** nos termos, e isto é um CRM de uma loja que
vende. Risco assumido pelo dono (decisão 6 do spec). Rota de saída registrada:
Vercel Pro, ou Cloudflare/Netlify, que permitem uso comercial no free.

**Cron na Vercel Hobby roda 1x/dia** e expressão mais frequente **falha no
deploy**. Por isso os jobs vivem no `pg_cron` do Supabase — que de quebra é o
anti-pausa do projeto free (pausa após 1 semana de inatividade).

**Custo por mensagem na Meta.** Desde 01/10/2026 cada número tem 1.000 mensagens
de serviço grátis por mês; o excedente é cobrado, e template de marketing é
cobrado em toda entrega.

### Bugs conhecidos, não corrigidos

| Onde | O quê |
|---|---|
| `/demo` (simulador) | Tocar um reply button **rola a página** para fora da seção. Reproduzido, causa não diagnosticada (o `scrollTo` do container está correto; não é `scrollIntoView`). Só afeta a vitrine. |
| `MessageBubble` | Vídeo recebido renderiza **balão vazio** — `TIPOS_DE_MIDIA` inclui `video`, mas a cadeia de render não tem ramo para ele. |
| `MessageComposer` × `/api/upload-media` | O composer aceita qualquer `image/*`; a rota só aceita `jpeg/png/webp`. Foto `image/heic` do iPhone é aceita na tela e recusada na rota. |
| Trigger `sync_cliente_from_message` | `primeiro_contato_at` fica **NULL para sempre** em cliente criado à mão que depois manda mensagem (o `DO UPDATE` não toca a coluna). Inócuo hoje; corrigir junto com a Fase 2. |
| Código morto | `janela24h.ts` (`reativacaoJaEnviada`, `nuncaRespondeu`), `phoneUtils.ts` (`telNorm11`), `waIdentity.ts` (ramo BSUID) referenciam um sistema que não é este. Maior fonte de confusão para quem ler esses arquivos. |

---

## 6. As armadilhas que custaram caro

Cada uma foi paga com um incidente, aqui ou no sistema de referência. O
`CLAUDE.md` tem as 18 com detalhe; estas são as que mais mordem:

1. **`META_TOKEN` é server-only.** Com o prefixo `NEXT_PUBLIC_` o Next inlina o
   valor no bundle e publica o token do WhatsApp Business.
2. **No Next 16 o middleware NÃO intercepta Route Handlers** — verificado
   empiricamente: páginas levam 307, rotas de API chegam ao handler. A checagem
   de sessão dentro da rota **é a única defesa**, não defesa em profundidade.
3. **O webhook nunca faz upsert em `clientes`.** O trigger é o dono único; dois
   escritores causaram clobber de nome no sistema de referência.
4. **`clienteExiste` é `bot_stage IS NULL`**, não `!!cliente` — o trigger já criou
   a linha, então `!!cliente` é sempre `true` e o bot nunca saudaria ninguém.
5. **O `.select()` no UPDATE condicional não é decorativo.** O supabase-js não
   informa linhas afetadas sem ele, e sem isso o bot envia a mensagem mesmo
   quando o `WHERE` não casou — duas saudações para o mesmo cliente.
6. **O webhook nunca devolve 500** por erro não-fatal: a Meta reentrega em loop.
7. **Enfileirar disparo só pela rota.** No sistema de referência um SQL na mão
   custou 89 de 103 leads disparáveis, de forma irreversível.

---

## 7. Como retomar

```bash
cd agrozet
npm install
npm run test     # 129 testes
npm run build
npm run dev      # com NEXT_PUBLIC_MOCK=1 no .env.local: entra direto no CRM
```

Git: branch `master`, histórico do projeto em `git log --oneline -- agrozet/`.

**Se o objetivo for mostrar o sistema a alguém:** já está pronto, é só subir com
a flag.

**Se o objetivo for fazer funcionar de verdade:** siga a seção 3 na ordem. O
passo 10 (smoke de ponta a ponta) é o que nunca foi feito e o único que prova
que o sistema funciona.
