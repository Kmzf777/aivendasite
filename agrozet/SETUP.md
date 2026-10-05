# CRM Agrozet — SETUP

Passo a passo para colocar o sistema de pé **do zero**. Este documento assume o
estado real de hoje: **nada foi criado ainda** — não existe projeto Supabase, não
existe app na Meta, não existe deploy. Nenhum passo aqui foi executado contra
infraestrutura real; o roteiro foi derivado do código e da migration.

Cada passo está marcado:

- **[F1]** — necessário agora, para a Fase 1 funcionar.
- **[F3]** — Fase 3, ainda **não implementada**. Documentado para quando chegar a
  hora (e para ninguém reintroduzir cron na Vercel por reflexo).

Ordem importa: o passo 3 depende do 2, o 7 depende do 1 e do 6.

---

## 1. [F1] Criar o projeto Supabase

1. Entre em <https://supabase.com> → **New project**. Plano **Free** basta.
2. Região: a mais próxima do Brasil disponível.
3. Guarde a senha do banco num gerenciador — ela não é mostrada de novo.
4. Em **Project Settings → API**, copie:
   - **Project URL** → vira `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → vira `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → vira `SUPABASE_SERVICE_ROLE_KEY`
5. Anote o **project ref** (o subdomínio da Project URL,
   `https://<ref>.supabase.co`) — o passo 3 precisa dele.

> A `service_role` **ignora o RLS**. Ela nunca vai para o browser, nunca para o
> repositório, e nunca para um arquivo com prefixo `NEXT_PUBLIC_`.

**Limites do free que o design já leva em conta:** 500 MB de banco, 1 GB de
Storage, 5 GB de egress/mês, 50k MAU, 2 projetos ativos, e **pausa após 1 semana
de inatividade** (ver passo 10).

## 2. [F1] Aplicar a migration

Arquivo: `supabase/migrations/20261005000000_baseline_agrozet.sql` (535 linhas).
Cria 8 tabelas, 5 índices, `is_admin()`, o trigger
`messages_sync_cliente` + `set_updated_at`, as policies de RLS e o seed do menu.

A migration é **idempotente** (`IF NOT EXISTS` / `CREATE OR REPLACE` /
`DROP POLICY IF EXISTS` / `ON CONFLICT DO NOTHING`): reaplicar sobre um banco já
migrado é no-op e **não sobrescreve texto de bot já editado**.

Pré-requisito: um projeto Postgres do Supabase limpo. Ela não depende de
`pg_cron`/`pg_net`, nem de bucket, nem de nenhum usuário pré-existente.

**Opção A — SQL Editor (mais simples):** Dashboard → **SQL Editor** → **New
query** → cole o conteúdo inteiro do arquivo → **Run**.

**Opção B — CLI:**

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

### Verificar que deu certo

```sql
-- Esperado: 3
SELECT count(*) FROM bot_opcoes WHERE ativo;

-- Esperado: rowsecurity = true nas 8 linhas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

As 8 tabelas são: `blocked_numbers`, `bot_config`, `bot_opcoes`, `clientes`,
`messages`, `operational_errors`, `pets`, `scheduled_disparos`.

Convém também abrir **Advisors → Security** e conferir que não sobrou aviso de
tabela sem RLS.

**Rollback:** existe `supabase/migrations/20261005000000_baseline_agrozet.down.sql`.
Ele apaga as tabelas — não rode num banco com conversas reais.

## 3. [F1] Regenerar `database.types.ts` — obrigatório

```bash
npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
```

**Por que é obrigatório e não "nice to have":** o arquivo atual foi **escrito à
mão**, transcrito coluna por coluna da migration, porque na hora de escrever não
existia projeto Supabase para gerar nada. Enquanto não for regenerado, esses
tipos são uma *afirmação* sobre o banco, não um fato — se a migration e o arquivo
divergirem, o TypeScript continua aprovando escritas que o Postgres rejeita, e o
erro só aparece em runtime, no webhook, com um cliente esperando resposta.

Depois de rodar, confira `npx tsc --noEmit` e `npm run build`.

**Repita este comando depois de qualquer DDL.** Sem exceção.

## 4. [F1] Criar o bucket `media` — privado

Dashboard → **Storage** → **New bucket**:

- **Name:** `media` (exatamente isso — é o valor de `BUCKET` em
  `src/lib/mediaStorage.ts`)
- **Public bucket:** **desligado**. O bucket é **privado**.

Público seria um vazamento: as fotos são de conversas de clientes, e um bucket
público entrega qualquer objeto a quem souber o caminho. O acesso correto é pela
rota `/api/media-url`, que exige sessão e devolve uma **URL assinada de 7 dias**
(longa de propósito, para o cache do browser absorver as releituras e não gastar
o egress de 5 GB/mês).

## 5. [F1] Criar o usuário atendente

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*.
E-mail + senha; marque "Auto Confirm User" se não quiser lidar com e-mail de
confirmação.

> **Nunca crie usuário por `INSERT INTO auth.users`.** O formato de hash de senha,
> as colunas e os triggers do GoTrue são detalhe interno: um INSERT na mão produz
> uma linha que parece certa e simplesmente não autentica.

### Tornar alguém admin

No usuário → **User Metadata** (o `raw_user_meta_data`) → acrescente:

```json
{ "role": "admin" }
```

É a **mesma fonte** que os dois lados leem:

- banco: `public.is_admin()` →
  `coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'`
- front: `useIsAdmin()` (`src/hooks/useIsAdmin.ts`) →
  `data.user?.user_metadata?.role === 'admin'`

Se você puser o papel em outro lugar (`app_metadata`, uma tabela própria), a
Sidebar mostra itens que o RLS recusa — ou o contrário.

Na Fase 1 nenhuma tela é exclusiva de admin (`/bot` e `/erros` são Fase 2 e
aparecem na Sidebar como "em breve"), mas as policies de `bot_config`,
`bot_opcoes` e `operational_errors` já exigem admin — então crie pelo menos um.

## 6. [F1] Criar o app na Meta (WhatsApp Business)

1. <https://developers.facebook.com> → **My Apps** → **Create App** → tipo
   **Business**.
2. Adicione o produto **WhatsApp**.
3. Cadastre/registre o **número de telefone** do petshop (ou use o número de teste
   para o primeiro smoke).
4. Colete:

| Onde | Vira |
|---|---|
| WhatsApp → API Setup → **Phone number ID** | `NEXT_PUBLIC_META_PHONE_ID` |
| WhatsApp → API Setup → **WhatsApp Business Account ID** | `META_WABA_ID` |
| App Settings → Basic → **App Secret** | `META_APP_SECRET` |
| Token de acesso (ver abaixo) | `META_TOKEN` |
| Você inventa uma string aleatória longa | `META_VERIFY_TOKEN` |

**O `META_TOKEN` tem de ser permanente, de System User** — não o token temporário
de 24 h da tela de API Setup. Business Settings → **System Users** → crie um
system user → **Add Assets** (o app do WhatsApp, com acesso total) → **Generate
new token** → escopos `whatsapp_business_messaging` e
`whatsapp_business_management` → *Never expires*.

> Lembrete do `CLAUDE.md`, item 1: `META_TOKEN` é **server-only**. Com prefixo
> `NEXT_PUBLIC_` o Next inlina o valor no bundle do browser e publica o token.

O `META_VERIFY_TOKEN` é só um segredo compartilhado do handshake: você escolhe o
valor e repete o mesmo nos dois lados (`.env` e o campo da Meta no passo 8).

## 7. [F1] Montar o `.env.local`

```bash
cp .env.local.example .env.local
```

E preencha as variáveis (nove no total; o `CRON_SECRET` só é usado na Fase 3):

| Variável | De onde vem | Exposição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | passo 1 | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | passo 1 | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | passo 1 | **server** |
| `META_TOKEN` | passo 6 | **server-only** |
| `NEXT_PUBLIC_META_PHONE_ID` | passo 6 | browser (é só um id) |
| `META_WABA_ID` | passo 6 | server |
| `META_VERIFY_TOKEN` | você inventa | server |
| `META_APP_SECRET` | passo 6 | server |
| `CRON_SECRET` | você inventa (passo 10) | server + Vault |

`.gitignore` já ignora `.env*` e versiona só o `.env.local.example`.

Então:

```bash
npm install
npm run dev     # http://localhost:3000 -> redireciona para /login
```

Entre com o usuário do passo 5. `/` redireciona para `/conversas`.

## 8. [F1] Assinar o webhook na Meta

A rota é **`POST|GET /api/webhook`**.

**Para testar local**, exponha o dev server:

```bash
ngrok http 3000
```

Depois, no app da Meta → **WhatsApp → Configuration → Webhook** → *Edit*:

- **Callback URL:** `https://<dominio-ou-ngrok>/api/webhook`
- **Verify token:** exatamente o `META_VERIFY_TOKEN` do `.env.local`
- **Verify and save** — a Meta faz um `GET` com `hub.mode=subscribe` e espera o
  `hub.challenge` de volta. Se der erro, 99% das vezes é o verify token
  divergente ou a app não estar rodando.
- **Webhook fields:** assine **`messages`**. É o único campo que o código trata
  (mensagens de entrada e `statuses[]` de entrega).

O `POST` exige **`X-Hub-Signature-256`** válido (HMAC-SHA256 do corpo bruto contra
o `META_APP_SECRET`) — se o `META_APP_SECRET` estiver errado, toda entrega da Meta
volta **401** e nada chega no banco. É o primeiro lugar para olhar quando "o
webhook não funciona".

### Smoke de ponta a ponta (ainda não executado)

1. Mande "oi" de um número que nunca escreveu → chega o menu com 3 botões.
2. Aperte **Rações e Produtos** → chega a resposta da opção + o fecho.
3. `SELECT phone, bot_stage, ultimo_servico FROM clientes WHERE phone = '<numero>';`
   → `done` e `racoes`.
4. Mande "oi" de novo → **nada** do bot (stage `done`); a conversa aparece
   pendente em `/conversas`.
5. Responda pela tela → chega no WhatsApp e a conversa sai da pendência.
6. Mande uma foto → aparece na timeline; no bucket, o objeto é `.webp` e tem bem
   menos de 200 KB.

## 9. [F1] Deploy na Vercel

1. Importe o repositório. **Root Directory: `agrozet`** (o repo tem outros
   projetos ao lado).
2. **Environment Variables:** as mesmas do passo 7, nos ambientes Production (e
   Preview, se for usar). O Next **não** lê `.env.local` na Vercel.
3. Deploy. Depois, aponte o webhook do passo 8 para
   `https://<seu-dominio>/api/webhook`.

> **Desative a Deployment Protection** (Project Settings → Deployment Protection),
> ou restrinja-a **apenas a Preview**. Com ela ativa em Production, a Meta recebe
> **401** no webhook, considera a entrega falha e reentrega em loop — e nenhuma
> mensagem de cliente chega.

**Não adicione `crons` no `vercel.json`.** O plano Hobby limita cron a 1x/dia e
uma expressão mais frequente **falha no deploy**. O cron deste projeto é o do
passo 10.

**Termos:** o plano Hobby restringe uso comercial. Risco assumido pelo dono
(decisão 6 do spec), com rota de saída registrada: Vercel Pro, ou
Cloudflare/Netlify, que permitem uso comercial no free.

## 10. [F3] `pg_cron` + `pg_net` no Supabase

**Nada disso é necessário para a Fase 1** — as rotas `/api/cron/process-disparos`
e `/api/cron/retencao` **ainda não existem**. Faça este passo quando a Fase 3 for
implementada. Está aqui documentado porque o job de 5 minutos tem um segundo
papel: ele é o **anti-pausa** do Supabase free, que pausa o projeto depois de 1
semana de inatividade.

O SQL abaixo **não foi executado** contra um projeto real. Trate como rascunho a
conferir, não como receita validada.

1. **Habilitar as extensões:** Dashboard → **Database → Extensions** → ligue
   `pg_cron` e `pg_net`.

2. **Guardar os segredos no Vault:** Dashboard → **Project Settings → Vault** →
   *New secret*. Crie dois:
   - `cron_secret` → o mesmo valor de `CRON_SECRET` nas variáveis da Vercel
   - `app_base_url` → `https://<seu-dominio>` (sem barra no fim)

   O Vault existe para o segredo não ficar em texto puro na definição do job,
   que qualquer um com acesso ao banco consegue ler em `cron.job`.

3. **Criar os dois jobs** (SQL Editor):

```sql
-- Fase 3. Rascunho: conferir nomes de segredo e a URL antes de rodar.
select cron.schedule(
  'processa_disparos',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/cron/process-disparos',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 0 7 * * * UTC = 04:00 BRT
select cron.schedule(
  'retencao',
  '0 7 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/cron/retencao',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

4. **Conferir:**

```sql
select jobid, jobname, schedule, active from cron.job order by jobname;
select jobid, status, start_time, return_message
from cron.job_run_details
order by start_time desc
limit 20;
```

Para remover: `select cron.unschedule('processa_disparos');`

Lembre que `/api/cron` está **fora do matcher do middleware** (`middleware.ts`),
porque o `pg_net` chama servidor-a-servidor e não manda cookie. A autenticação
dessas rotas é o `CRON_SECRET` no header `Authorization`, validado pela própria
rota.

---

## Checklist final da Fase 1

- [ ] Projeto Supabase criado, três chaves copiadas
- [ ] Migration aplicada; `bot_opcoes WHERE ativo` = 3; RLS `true` nas 8 tabelas
- [ ] `database.types.ts` **regenerado** pelo CLI
- [ ] Bucket `media` criado e **privado**
- [ ] Usuário atendente criado pelo Dashboard; ao menos um com
      `{"role":"admin"}` no `user_metadata`
- [ ] App na Meta com número, token permanente de System User, app secret
- [ ] `.env.local` completo; `npm run dev` abre `/login` e autentica
- [ ] Webhook assinado com o campo `messages`; handshake OK; `POST` com
      assinatura válida gravando em `messages`
- [ ] Deploy na Vercel com as variáveis e **sem** Deployment Protection em
      Production
- [ ] Smoke dos 6 passos do item 8 executado

## Diagnóstico rápido

| Sintoma | Primeiro suspeito |
|---|---|
| Handshake do webhook falha | `META_VERIFY_TOKEN` divergente entre `.env` e a Meta |
| Entregas da Meta voltam 401 | `META_APP_SECRET` errado, ou Deployment Protection ligada |
| Mensagem chega, bot não responde | `bot_config.ativo`; `bot_stage` já `done`; teto de 6/hora; janela de 10 s |
| Bot responde duas vezes | o `.select('id')` do upsert de `messages` foi removido (gate de idempotência) |
| Conversa rachada em dois cards | gravou outro número em vez do `wa_id` |
| Foto não aparece na timeline | bucket `media` inexistente ou com nome diferente; ver `operational_errors` |
| Escrita falha "muda" | `SUPABASE_SERVICE_ROLE_KEY` ausente/errada, ou RLS |
| Qualquer coisa estranha no webhook | `SELECT * FROM operational_errors ORDER BY created_at DESC LIMIT 50;` |
