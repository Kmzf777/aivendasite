# CRM Agrozet — árvore do projeto

Gerada do disco em 2026-10-05 (`find`), não de memória. `node_modules/`, `.next/`
e `.git/` ficam de fora. O número entre parênteses é a contagem de linhas, para
dar noção de peso.

```
agrozet/
├── README.md                      o que é o produto, como rodar, estado atual
├── SETUP.md                       colocar de pé do zero (Supabase, Meta, Vercel)
├── CLAUDE.md                      as 18 regras do projeto, com o motivo de cada uma
├── TREE.md                        este arquivo
│
├── package.json                   deps e os 5 scripts (dev/build/start/lint/test)
├── package-lock.json              lockfile do npm
├── tsconfig.json                  TS strict, alias `@/*` -> `src/*`
├── next.config.ts                 vazio de propósito — nenhum override necessário
├── middleware.ts            (63)  sessão nas PÁGINAS; o matcher exclui api/webhook,
│                                  api/cron, login e estáticos — leia o comentário
│                                  antes de editar o regex
├── vitest.config.ts               ambiente node, inclui `src/**/*.test.ts`
├── eslint.config.mjs              eslint-config-next
├── postcss.config.mjs             @tailwindcss/postcss
├── tailwind.config.cjs            content globs; tema real mora no globals.css (v4)
├── components.json                config do shadcn/Base UI (style `base-nova`)
├── .env.local.example             as 9 variáveis, com o aviso do META_TOKEN
├── .env.local                     local, ignorado pelo git
├── .gitignore                     ignora .env* (exceto o .example), .next, tsbuildinfo
├── next-env.d.ts                  gerado pelo Next; ignorado pelo git
├── tsconfig.tsbuildinfo           cache do tsc; ignorado pelo git
│
├── public/
│   └── agrozet-logo.png           logo da loja (usada na Sidebar e no login)
│
├── docs/superpowers/
│   ├── specs/
│   │   └── 2026-10-05-agrozet-crm-design.md    O SPEC APROVADO: decisões,
│   │                                           restrições de plataforma, modelo
│   │                                           de dados, as 3 fases
│   └── plans/
│       └── 2026-10-05-fase1-fundacao-e-bot.md  o plano da Fase 1, task a task
│
├── supabase/migrations/
│   ├── 20261005000000_baseline_agrozet.sql       (535) A ÚNICA migration: 8 tabelas,
│   │                                             5 índices, is_admin(),
│   │                                             sync_cliente_from_message() +
│   │                                             trigger, set_updated_at(), RLS e
│   │                                             policies, seed do menu (3 opções).
│   │                                             Idempotente. NUNCA FOI APLICADA.
│   └── 20261005000000_baseline_agrozet.down.sql  rollback; apaga as tabelas
│
└── src/
    ├── app/
    │   ├── layout.tsx                 root layout: Fraunces + Karla, <Providers>
    │   ├── providers.tsx              QueryClient no state (não no módulo, para não
    │   │                              vazar cache entre requisições no SSR)
    │   ├── globals.css                Tailwind 4 + tokens da marca: --brand-laranja
    │   │                              #f4601c, --brand-laranja-escuro #c2410c (para
    │   │                              TEXTO), --brand-amarelo, --brand-vermelho,
    │   │                              --ink #2b1206 e as notas de contraste AA
    │   │
    │   ├── (app)/                     grupo autenticado
    │   │   ├── layout.tsx             Sidebar + segunda tranca de sessão no
    │   │   │                          servidor, redundante com o middleware de
    │   │   │                          propósito (matcher mal editado não avisa)
    │   │   ├── page.tsx               `/` -> redirect('/conversas')
    │   │   └── conversas/page.tsx     casca da tela; renderiza <Conversations />
    │   │
    │   ├── (auth)/                    grupo público
    │   │   ├── layout.tsx             só centraliza no fundo creme, sem Sidebar
    │   │   └── login/page.tsx         e-mail + senha (Supabase Auth). Sem cadastro
    │   │                              e sem "esqueci a senha": contas nascem no
    │   │                              dashboard
    │   │
    │   └── api/
    │       ├── webhook/route.ts       (439) A ÚNICA porta de entrada do cliente.
    │       │                          GET = handshake da Meta. POST = assinatura
    │       │                          HMAC -> statuses -> upsert idempotente ->
    │       │                          mídia -> decidirBot -> transição condicional
    │       │                          -> envia e grava com campaign_id='bot'.
    │       │                          Nunca devolve 500 por erro não-fatal
    │       ├── send-message/route.ts  (87) composer de texto. Valida sessão NA
    │       │                          ROTA; Meta primeiro, banco depois
    │       ├── upload-media/route.ts  (137) composer de imagem: valida sessão,
    │       │                          aceita JPEG/PNG/WebP até 5 MB, comprime
    │       │                          (WebP 1280px) e manda o MESMO buffer para a
    │       │                          Meta e para o bucket
    │       └── media-url/route.ts     (52) troca `messages.media_path` por URL
    │                                  assinada de 7 dias. Allowlist de path
    │                                  (anti-traversal) e 404 para mídia expirada
    │
    ├── components/
    │   ├── Sidebar.tsx                navegação; `/clientes`, `/disparos`, `/bot` e
    │   │                              `/erros` marcados "em breve"; os dois últimos
    │   │                              só para admin (useIsAdmin)
    │   ├── Conversations.tsx    (119) a tela de atendimento: lista à esquerda,
    │   │                              conversa à direita. Caixa ÚNICA por decisão
    │   │                              de produto
    │   └── conversations/
    │       ├── ConversationList.tsx  (167) lista; pendentes no topo, hora para hoje
    │       │                               e data curta para o resto
    │       ├── ChatHeader.tsx         (61) cabeçalho da conversa (usa `render` prop
    │       │                               do Base UI, nunca `asChild`)
    │       ├── MessageTimeline.tsx   (137) timeline com separadores Hoje/Ontem/data
    │       ├── MessageBubble.tsx     (282) balão; a imagem só pede URL assinada
    │       │                               quando entra em viewport
    │       │                               (IntersectionObserver), para não gastar
    │       │                               o egress de 5 GB/mês
    │       ├── MessageComposer.tsx   (204) envio de texto e imagem, com erro legível
    │       │                               (401 "faça login" ≠ falha da Meta)
    │       └── ServicoChip.tsx        (85) etiqueta do `ultimo_servico`: traduz o
    │                                       `botao_id` cru para o título, por
    │                                       useQuery própria em `bot_opcoes`
    │   └── ui/                        primitivos sobre @base-ui/react
    │       ├── button.tsx             CVA; `default` = laranja com texto --ink
    │       ├── badge.tsx              EXPORT DEFAULT; pill de contador, devolve null
    │       │                          quando count <= 0. NÃO é o Badge com variant
    │       ├── alert.tsx  avatar.tsx  card.tsx  dialog.tsx  dropdown-menu.tsx
    │       ├── input.tsx  scroll-area.tsx  separator.tsx  skeleton.tsx
    │       └── sonner.tsx  table.tsx  tooltip.tsx
    │
    ├── hooks/
    │   ├── useConversas.ts      (66) lista de conversas por polling; 90 dias de
    │   │                             histórico, limite explícito de linhas, e NÃO
    │   │                             seleciona `media_path`
    │   ├── useMensagens.ts      (63) mensagens da conversa aberta; aqui `media_path`
    │   │                             É selecionado, porque só a conversa aberta
    │   │                             pode baixar mídia
    │   └── useIsAdmin.ts        (17) `user_metadata.role === 'admin'` — a MESMA
    │                                 fonte que a função is_admin() do banco lê
    │
    └── lib/
        ├── bot.ts             (235) ★ O CORAÇÃO. `decidirBot` e `montarMenu`,
        │                             lógica PURA (zero I/O). Teto de 6 respostas/h
        │                             e janela de leitura de 10 s moram aqui
        ├── bot.test.ts        (204) 24 testes: toda a tabela de decisão, as duas
        │                             guardas, botão x lista, opções inativas
        ├── botTypes.ts         (15) `BotStage` e `BotMenu` num arquivo próprio para
        │                             bot.ts e metaApi.ts não dependerem um do outro
        ├── botLimites.ts       (91) limites da Meta (20/1024/60/3/10) + validarOpcao
        │                             e validarConfig, que acumulam todos os erros
        ├── botLimites.test.ts  (48) 9 testes
        ├── metaApi.ts         (234) cliente do Graph v22.0: sendWhatsAppMessage,
        │                             sendWhatsAppMedia, sendWhatsAppInteractive,
        │                             buildInteractivePayload, uploadMetaMedia,
        │                             getMetaMediaUrl, downloadMetaMedia
        ├── metaApi.test.ts     (50) 3 testes (só o builder de payload — zero rede)
        ├── metaSignature.ts    (21) verifica o X-Hub-Signature-256 sobre o corpo
        │                             BRUTO, em tempo constante
        ├── metaSignature.test.ts (43) 8 testes
        ├── mediaStorage.ts     (88) BUCKET='media', comprimirImagem (sharp, 1280px,
        │                             WebP q80), caminhoMidia (sanitiza o wamid) e
        │                             armazenarMidia, que NUNCA lança
        ├── mediaStorage.test.ts (66) 9 testes, incluindo compressão real com sharp
        ├── webhookPayload.ts  (228) leitura defensiva do payload da Meta. NENHUMA
        │                             função lança: extrairMensagens, extrairStatuses,
        │                             extrairConteudo, extrairBotaoId, extrairMediaId,
        │                             tipoDaMensagem
        ├── webhookPayload.test.ts (100) 17 testes
        ├── phoneUtils.ts       (83) normalizePhone (só dígitos) e o DDI 55 brasileiro
        ├── phoneUtils.test.ts  (25) 3 testes
        ├── waIdentity.ts       (26) distingue telefone de BSUID ("BR.xxxx"), para
        │                             nunca passar um BSUID pela normalização
        ├── waIdentity.test.ts  (52) 12 testes
        ├── listaConversas.ts  (143) monta a lista a partir de messages+clientes;
        │                             "pendente" = última mensagem é inbound. Puro
        ├── listaConversas.test.ts (77) 10 testes
        ├── janela24h.ts        (89) status da janela de 24 h da Meta (verde/amarelo,
        │                             tempo restante) e auxiliares de reativação
        ├── janela24h.test.ts  (129) 16 testes
        ├── errorLog.ts         (22) logOperationalError(); grava em
        │                             `operational_errors` e NUNCA lança
        ├── supabaseAdmin.ts    (13) getAdminSupabase(): service_role, fonte ÚNICA.
        │                             Nunca para checar sessão
        ├── supabase-server.ts  (27) getSupabaseServerClient(): anon + cookie. É ESTE
        │                             que valida sessão nas rotas
        ├── supabase-browser.ts (13) cliente do browser, singleton
        ├── database.types.ts  (457) tipos do banco — ESCRITO À MÃO, provisório.
        │                             Regenerar pelo CLI (CLAUDE.md, item 16)
        └── utils.ts            (24) `cn()` (clsx + tailwind-merge) e Title Case
```

**Arquivos que não existem, e isso é de propósito:** `vercel.json` (declarar cron
mais frequente que diário quebra o deploy no plano Hobby — o cron é `pg_cron`,
`CLAUDE.md` item 9) e as rotas `/api/cron/*`, `/api/schedule-disparo`, as telas
`/clientes`, `/disparos`, `/bot` e `/erros` (Fases 2 e 3).

## Resumo por número

| | |
|---|---|
| Testes | 10 arquivos, **111 testes**, todos passando |
| Rotas de API | 4 (`webhook`, `send-message`, `upload-media`, `media-url`) |
| Telas | 3 (`/` → redirect, `/login`, `/conversas`) |
| Migrations | 1 (+1 de rollback) |
| Tabelas | 8, todas com RLS |
| Módulos puros testados | `bot`, `botLimites`, `metaApi` (builder), `metaSignature`, `mediaStorage`, `webhookPayload`, `phoneUtils`, `waIdentity`, `listaConversas`, `janela24h` |
