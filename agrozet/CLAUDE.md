# CRM Agrozet — CLAUDE.md

Diretrizes para quem for mexer neste código depois — humano ou agente. Cada regra
vem com **o porquê**, porque regra sem motivo é a primeira a ser "simplificada"
por alguém com pressa.

**Produto:** CRM de atendimento WhatsApp do **Pet Shop Agrozet** (banho e tosa,
rações, agropecuária — Segismundo Pereira, Uberlândia). Um número na API oficial
da Meta, atendido por humanos, com um bot de botão que faz a triagem inicial.

**Spec:** `docs/superpowers/specs/2026-10-05-agrozet-crm-design.md`
**Plano da Fase 1:** `docs/superpowers/plans/2026-10-05-fase1-fundacao-e-bot.md`
**Setup do zero:** `SETUP.md` · **Árvore comentada:** `TREE.md`
**Retomar numa sessão nova:** `docs/REATIVACAO.md`

---

## Como mexer no código

- Mínimo de código necessário. Sem abstração antecipada nem configuração que
  ninguém pediu.
- Altere só o necessário: nada de refatoração "de passagem" em código que não
  está quebrado.
- Siga o estilo do arquivo. Os arquivos deste projeto têm comentário de cabeçalho
  explicando a invariante que eles seguram — leia antes de editar e **atualize**
  se a invariante mudar.
- Diante de ambiguidade, apresente as leituras possíveis em vez de escolher uma
  em silêncio.

### Comandos essenciais

```bash
npm run dev      # dev server (localhost:3000)
npm run build    # build de produção + type-check
npm run lint     # ESLint
npm run test     # vitest run
```

Última execução verificada (2026-10-06): `npm run test` → **146 testes, 11
arquivos, todos passando**; `npx tsc --noEmit`, `npm run lint` e `npm run build`
limpos.

### Modo mock — o CRM rodando sem Supabase

```sh
# .env.local
NEXT_PUBLIC_MOCK=1
```

Com a flag, o app roda **inteiro sobre dados em memória** (`src/lib/mock/store.ts`,
semeado de `src/lib/demo/dados.ts`), **sem Supabase e sem login**. É o que se
mostra à dona do petshop enquanto não existe infraestrutura.

**A flag é `false` por padrão, e esse default é a segurança do arranjo.** Sem a
variável, middleware, layout, hooks e composer seguem o caminho de produção
inalterado — sessão exigida, Supabase de verdade. Um deploy que esqueça a
variável é seguro, não exposto.

**A flag NUNCA pode passar a olhar `NODE_ENV`.** Preview da Vercel roda como
produção; amarrar o modo demonstração ao ambiente abriria o CRM num preview.

As telas `/clientes`, `/disparos`, `/bot` e `/erros` são **maquete**: só aparecem
na Sidebar com a flag ligada, e cada uma diz na própria tela o que ainda não
existe. `/bot` é exceção parcial — a **validação dos limites da Meta é real**
(usa `validarOpcao`/`validarConfig` e `montarMenu` de produção); só a gravação
que não persiste.

Ao desligar o modo mock, confira: a variável fora do ambiente, o login voltando a
pedir senha, e as quatro telas voltando a aparecer desabilitadas na Sidebar.

Estado completo do projeto e o que falta para sair do mockup: **`docs/REATIVACAO.md`**.

---

## 1. `META_TOKEN` é server-only. Sem exceção.

Nunca renomeie para `NEXT_PUBLIC_META_TOKEN`, nem "só para testar no browser".
Com o prefixo `NEXT_PUBLIC_` o Next.js **inlina o valor no bundle do browser** —
o token do WhatsApp Business do petshop fica publicado em JavaScript estático,
legível por qualquer visitante, e quem o pegar manda mensagem paga pelo número da
loja. É irreversível no sentido que importa: o token tem de ser revogado e
trocado na Meta, e o bundle já saiu.

`NEXT_PUBLIC_META_PHONE_ID` **pode** ser público (é só um id de número, usado em
`src/lib/metaApi.ts` para montar a URL do Graph). `META_TOKEN`, `META_APP_SECRET`,
`META_WABA_ID`, `META_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET`
não.

## 2. Toda rota de API valida a sessão sozinha. O middleware não salva ninguém.

**Verificado empiricamente no Next.js 16** (dev server, 2026-10-05): o
`middleware.ts` intercepta **páginas** (`/` devolveu 307 para `/login`) mas **não**
intercepta Route Handlers, mesmo quando o `matcher` casa o caminho. As três rotas
de API da Fase 1 chegaram ao próprio handler e devolveram 401 por código próprio.
No build do Next 16 o middleware aparece como `ƒ Proxy (Middleware)`.

> A checagem de sessão dentro da rota **não é defesa em profundidade. É a única
> defesa.** Rota de API que confia no middleware está aberta na internet.

Padrão obrigatório, como em `src/app/api/send-message/route.ts`:

```ts
const supabase = await getSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
```

**Nunca** use `getAdminSupabase()` para checar sessão: ele usa a
`service_role`, ignora RLS e não tem usuário associado — logo sempre "autoriza".

Sem essa checagem, `POST /api/send-message` seria um proxy público para o
WhatsApp do petshop, `/api/upload-media` queimaria quota da Meta gravando no
Storage com `service_role`, e `/api/media-url` assinaria mídia de conversa de
cliente para anônimos.

**Exceções, ambas fora do matcher de propósito:** `/api/webhook` (autentica pela
assinatura HMAC da Meta) e `/api/cron/*` (autentica pelo `CRON_SECRET` no header).
Quem chama essas duas é servidor, e servidor não manda cookie.

## 3. O webhook nunca faz upsert em `clientes`.

O trigger `messages_sync_cliente` (`AFTER INSERT ON messages` →
`sync_cliente_from_message()`) é o **dono único** do cadastro base: ele cria a
linha por `phone` e mantém `primeiro_contato_at` / `ultima_interacao_at`.

O trigger **não escreve `nome`**, e isso é deliberado. No sistema de referência o
webhook e o trigger escreviam o nome os dois, e cada mensagem nova revertia a
correção manual do atendente para o nome de exibição do WhatsApp. Aqui existe um
escritor só. Por isso `src/app/api/webhook/route.ts` lê `profileName` do payload e
**não grava**: o `nome` entra só pela tela de clientes (Fase 2), digitado por gente.

Se você precisar de um campo novo no cliente a partir do webhook, pense duas
vezes antes de abrir um segundo escritor.

## 4. `clienteExiste` é decidido por `bot_stage IS NULL`, não por `!!cliente`.

O trigger do item 3 já criou a linha de `clientes` no INSERT da mensagem — então
quando o webhook lê o cliente, a linha **sempre existe**, inclusive para quem
está mandando a primeira mensagem da vida. `!!cliente` seria praticamente sempre
`true`, o `start` nunca disparava e **o bot nunca saudaria ninguém**: o produto
inteiro ficaria mudo.

O que "cliente novo" significa para `decidirBot` é "ainda não passou pelo fluxo do
bot", e o marcador disso é `bot_stage IS NULL` — coluna que o trigger não toca e
que, portanto, só o webhook mexe. Logo: `clienteExiste := stage !== null`.

Consequência aceita: cliente cadastrado à mão na tela de clientes (Fase 2) tem
`bot_stage` nulo e recebe a saudação na primeira mensagem que mandar. É o
comportamento desejado — ele nunca viu o menu.

## 5. O gate de idempotência é o `select('id')` vazio.

No upsert de `messages` dentro do webhook:

```ts
.upsert({ ... }, { onConflict: 'message_id', ignoreDuplicates: true })
.select('id')
```

`ignoreDuplicates` transforma a reentrega num no-op silencioso; o `select('id')`
é o que nos deixa **detectar** a reentrega. **Array vazio = o UNIQUE em
`message_id` recusou a linha = a Meta está reentregando algo que já processamos**
→ `if (!inserida?.length) return`, sem nenhum efeito de bot.

Sem isso, cada reentrega faria o bot responder de novo — e a Meta reentrega
bastante. Nunca remova o `.select('id')` "porque o retorno não é usado": ele é o
gate.

Esse mesmo INSERT é o que dispara o trigger do item 3. Daí a ordem do arquivo:
gravar a mensagem **antes** de ler o cliente.

## 6. O webhook nunca devolve 500 por erro não-fatal.

A Meta trata 500 como "não entreguei" e **reentrega em loop**, com backoff, por
horas — e a cada reentrega o bot tentaria responder outra vez. Erro não-fatal vai
para a tabela `operational_errors` via `logOperationalError()`
(`src/lib/errorLog.ts`), com `origem` no formato `webhook.<funcao>`, e a rota
devolve 200.

`logOperationalError` **nunca lança** — um erro ao registrar erro não pode
derrubar o chamador. O `JSON.parse` do corpo está dentro do `try`: corpo assinado
mas inválido é registro de erro, não 500.

Único 4xx legítimo é o **401 de assinatura inválida**, que vem antes de tudo.

## 7. Outbound do bot é marcado com `campaign_id = 'bot'`.

A constante é `MARCA_BOT = 'bot'` em `src/app/api/webhook/route.ts`, e os dois
lados usam a mesma: a **escrita** (`enviarEGravar`) e a **contagem**
(`contarFalasDoBot`, que filtra `.eq('campaign_id', MARCA_BOT)`).

Por que: `direction = 'outbound'` cobre tanto a fala do bot quanto a do
**atendente humano** (`/api/send-message`). As guardas do bot contam "respostas do
bot na última hora". Se a resposta digitada por um humano entrasse nessa conta,
um atendente ativo numa conversa — 6 mensagens em uma hora é uma conversa
**normal** — calaria o bot para o próximo cliente que escrevesse. A guarda, que
existe contra laço robô-a-robô, passaria a punir trabalho humano.

`campaign_id` é `text` livre, sem FK. Na Fase 3 os disparos gravam ali o UUID da
campanha; um literal `'bot'` não colide com UUID nenhum. `/api/send-message` e
`/api/upload-media` deixam a coluna nula (o default) — não mexa nisso.

### As duas guardas do bot (`src/lib/bot.ts`)

**`BOT_TETO_RESPOSTAS_POR_HORA = 6`.** O fluxo completo gasta 2 respostas; o resto
é folga. Existe por causa de robô-a-robô: no sistema de referência um bot alheio
respondeu cada mensagem automática com o próprio menu, e os dois trocaram **182
mensagens em 7 minutos** — cada uma paga e cada uma um ponto na reputação do
número na Meta, sem nenhum humano olhando. Um bot do outro lado não se cansa e
não pode ser convencido a parar; o teto é a única coisa que termina o laço. Acima
dele o bot fica **mudo**, mas a mensagem continua gravada e o atendente vê a
conversa normalmente.

**`BOT_JANELA_LEITURA_SEGUNDOS = 10`.** Resposta inválida que chega menos de 10 s
depois da última fala do bot **foi escrita antes de o cliente ler o menu** — ele
estava digitando quando o menu caiu na tela, ou quebrou a frase em três balões.
Reenviar o menu aí é o pior dos mundos: empurra o menu para quem não leu o
primeiro, e é exatamente o que alimenta o laço acima. Dentro da janela, silêncio.
De quebra, robô que responde em segundos deixa de receber resposta.

**A ordem de avaliação em `decidirBot` é contrato, não estilo:** a escolha válida
de botão é resolvida **antes** das duas guardas, porque quem apertou o botão
merece resposta. As guardas existem para calar o caminho de repergunta
(`remenu`), não para engolir uma escolha legítima.

E mais uma, de forma: `contarFalasDoBot` devolve `Number.MAX_SAFE_INTEGER` quando
a leitura falha, não zero. Falha de banco não pode virar "zero falas", senão o
teto desaparece justo quando o sistema está ruim. Perder uma saudação custa menos
que 182 mensagens.

## 8. O matcher do middleware exclui `/api/webhook` e `/api/cron`.

Cada exclusão em `middleware.ts` tem motivo registrado no próprio arquivo. As duas
que não admitem erro:

- **`api/webhook`** — a Meta chama servidor-a-servidor e **não manda cookie**. Se
  o middleware rodar ali, ela recebe 3xx/401, considera a entrega falha e
  reentrega em loop. É o bug mais caro possível neste projeto: webhook fora do ar
  mais fila de reentrega da Meta.
- **`api/cron`** — o `pg_cron` do Supabase chama por HTTP com
  `Authorization: Bearer <CRON_SECRET>`, também sem cookie. A própria rota valida
  o segredo.

`login` está fora para não entrar em redirect infinito (é o destino do redirect);
estáticos estão fora para não gastar uma chamada ao Supabase por asset.

Nunca "simplifique" esse regex sem ler o comentário acima dele.

## 9. O cron é `pg_cron` no Supabase, não `vercel.json`.

O **Vercel Hobby limita cron a 1x por dia**, e uma expressão mais frequente
**falha no deploy** — não em runtime. O `vercel.json` deste projeto não declara
cron nenhum (e não existe hoje): declarar um mais frequente que diário quebra o
deploy.

Os dois jobs vivem no Supabase, com `pg_cron` + `pg_net` e o `CRON_SECRET` no
Vault (ver `SETUP.md`, passo 10):

| Job | Frequência | Faz |
|---|---|---|
| `processa_disparos` | `*/5 * * * *` | `POST /api/cron/process-disparos` |
| `retencao` | `0 7 * * *` (04:00 BRT) | `POST /api/cron/retencao` |

**Bônus que não é bônus:** o job de 5 minutos também é o **anti-pausa do Supabase
free**, que pausa o projeto depois de 1 semana de inatividade. Se algum dia o
`processa_disparos` for desligado, lembre que o projeto volta a poder pausar.

Nada disso está implementado — é Fase 3. Está aqui para você não reintroduzir
cron na Vercel por reflexo.

## 10. Vercel Hobby proíbe uso comercial.

Os termos do plano Hobby restringem a uso pessoal/não-comercial, e isto é um CRM
de uma loja que vende. **Risco assumido pelo dono do projeto** (decisão 6 do
spec), registrado com rota de saída: Vercel Pro, ou Cloudflare/Netlify, que
permitem uso comercial no free tier.

Não "resolva" isso por conta própria. Mas também não finja que não existe ao
planejar hospedagem.

## 11. Limites da Meta validados nos dois lados — e no banco onde dá.

| Limite | Valor | Onde |
|---|---|---|
| Título de botão / item de lista | 20 | `LIMITE_TITULO_BOTAO` em `botLimites.ts` · `CHECK` `bot_opcoes_titulo_len_check` |
| Corpo (`body.text`) | 1024 | `LIMITE_CORPO` · `CHECK` `bot_opcoes_resposta_len_check` |
| Rodapé (`footer.text`) | 60 | `LIMITE_RODAPE` · `MAX_RODAPE` em `metaApi.ts` · `CHECK` `bot_config_rodape_len_check` |
| Saudação e fecho | 1024 | `MAX_CORPO` em `metaApi.ts` · `CHECK`s `bot_config_saudacao_len_check` e `bot_config_fecho_len_check` |
| Reply buttons | 3 (`MAX_REPLY_BUTTONS`) | `montarMenu` escolhe `list` acima disso |
| Itens de lista | 10 (`MAX_ITENS_LISTA`) | `montarMenu` trunca e registra erro operacional |

Validar só no formulário não basta: a linha pode entrar por SQL na mão, por
script, ou por uma versão anterior da tela, passando por fora do Zod. E estourar
o limite na Meta **não dá erro de validação amigável** — dá mensagem **não
entregue**, horas depois, para um cliente que fica sem resposta nenhuma e sem
saber por quê.

`montarMenu(config, opcoes)` escolhe o formato pela contagem de opções **ativas**:
1–3 → `button`; 4–10 → `list` (uma seção, rótulo "Ver serviços"); 0 → bot não
responde e registra erro; >10 → usa as 10 primeiras por `ordem` e registra erro.
Esse degrau existe porque o menu é editável: um admin cadastra a 4ª opção e a
Meta **recusa** 4 reply buttons. Sem o degrau, o cliente ficaria sem resposta.

`src/lib/metaApi.ts` tem as próprias constantes de truncamento no momento do
envio (`MAX_BOTOES`, `MAX_TITULO_BOTAO`, `MAX_ITENS_LISTA`, `MAX_TITULO_ITEM`,
`MAX_ROTULO_LISTA`) — é o segundo lado da validação. Se mudar um limite, mude nos
dois arquivos.

## 12. Nenhum teste mocka Supabase ou rede.

Vitest cobre **só lógica pura**: `bot.ts`, `botLimites.ts`, `phoneUtils.ts`,
`waIdentity.ts`, `webhookPayload.ts`, `metaSignature.ts`, `metaApi.ts` (só o
builder de payload), `mediaStorage.ts` (só `comprimirImagem`/`caminhoMidia`),
`janela24h.ts`, `listaConversas.ts`. Os arquivos "puros" declaram no cabeçalho
que não importam Supabase, `fetch`, `process.env` nem `next` — é isso que os
torna testáveis sem mock.

Rotas e componentes **não têm teste automatizado** na Fase 1. A verificação deles
é `npm run build` (type-check), `npm run lint` e smoke manual.

Se você for escrever teste de rota, não comece montando um mock de Supabase:
extraia a lógica para um módulo puro e teste ele. É o padrão do projeto inteiro.

## 13. Base UI não usa `asChild`.

A biblioteca de UI é `@base-ui/react`, não Radix. Composição é por **`render`
prop** (ver `src/components/conversations/ChatHeader.tsx` e
`src/components/ui/dialog.tsx`), nunca `asChild`. `asChild` não existe na API e
não aparece em nenhum arquivo deste projeto — se você escrever, vai falhar
silenciosamente como prop desconhecida ou quebrar no type-check.

## 14. `components/ui/badge.tsx` é `export default` e é um pill de contador.

Não é o Badge com `variant` do shadcn. Assinatura real:

```ts
export default function Badge({ count, children, className }: BadgeProps)
```

Devolve **`null` quando `count <= 0`** (ou quando não há `children`), e pinta com
`var(--primary)` / `var(--primary-foreground)`. Importe como default
(`import Badge from '@/components/ui/badge'`) e não procure `variant="secondary"`.
Se precisar de rótulo com variante, crie outro componente em vez de reescrever
este — a Sidebar depende do comportamento de sumir no zero.

## 15. Contraste: o `<Button>` primário tem texto marrom-escuro, não branco.

Em `src/app/globals.css`:

- `--brand-laranja: #f4601c` — o laranja da pata, ação primária. Tem contraste
  **3.27:1 sobre branco**, abaixo do mínimo AA de **4.5:1**.
- `--primary-foreground: var(--ink)` = **`#2b1206`** (marrom-tinta), 5.3:1 sobre
  o laranja. Branco sobre o laranja daria 3.3:1 e reprovaria.
- Laranja **como texto** sobre superfície clara usa
  `--brand-laranja-escuro: #c2410c` (5.2:1 sobre branco), exposto como
  `text-laranja-escuro`.
- `--brand-amarelo: #ffc133` é realce, **nunca texto**.
- `--brand-vermelho: #8b1005` para destrutivo/ênfase grave, com
  `--destructive-foreground: #ffffff` (9.6:1).

Não troque `--primary-foreground` para branco "porque fica mais bonito". Se mudar
uma cor de marca, recalcule o contraste do par antes.

Tipografia: **Fraunces** (display, `--font-display`) + **Karla** (texto,
`--font-sans`). Tema claro.

## 16. `database.types.ts` foi escrito à mão e precisa ser regenerado.

No momento da escrita **não existia projeto Supabase** (sem project ref, sem
credenciais), então `supabase gen types` era impossível. `src/lib/database.types.ts`
foi transcrito coluna por coluna da migration, imitando o shape que o CLI gera.

> Enquanto não for regenerado, esses tipos são uma **afirmação** sobre o banco,
> não um fato: se a migration mudar e o arquivo não, o compilador continua
> aprovando escritas que o Postgres rejeita.

**Regenerar assim que o projeto existir, e depois de QUALQUER DDL:**

```bash
npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
```

## 17. Nunca criar usuário por INSERT em `auth.users`.

Dashboard do Supabase → **Authentication → Users → Add user**. O `auth.users` tem
colunas, triggers e formato de hash de senha que são detalhe interno do GoTrue:
um INSERT na mão produz uma linha que parece certa e não autentica, e o
diagnóstico é caro. Lição herdada do sistema de referência.

Para tornar alguém admin, acrescente `{"role":"admin"}` no **`user_metadata`** —
é a mesma fonte que a função `is_admin()` do banco
(`auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'`) e o hook `useIsAdmin`
(`data.user?.user_metadata?.role === 'admin'`) leem. Se divergirem, a tela mostra
um menu que o banco recusa.

## 18. Disparo (Fase 3) se enfileira só pela rota.

**Nunca** insira direto em `scheduled_disparos`. Use `POST /api/schedule-disparo`
(aceita `dryRun: true`) — não implementado ainda, mas a regra vale desde já.

As regras — janela de expediente, resolução do telefone canônico, filtro de
`blocked_numbers` — **vivem na rota**, e o banco não reclama de INSERT na mão. No
sistema de referência um SQL na mão custou **89 de 103 leads disparáveis, de forma
irreversível**, exatamente por isso. Se a rota não suporta o que você precisa,
estenda a rota.

Duas invariantes que acompanham: a **blocklist é reconsultada no envio**, não só
no enfileiramento (horas separam os dois momentos e o cliente pode pedir para
sair nesse intervalo), e **falha ao consultar a blocklist aborta o lote** — nunca
vira "manda pra todo mundo".

---

## Falhas operacionais: onde olhar primeiro

Erro não-fatal em caminho que não pode abortar (webhook, crons da Fase 3) vai
para a tabela `operational_errors`, não só para o console. `origem` identifica o
ponto: `webhook.POST`, `webhook.statuses`, `webhook.processarMensagem`,
`webhook.gravarInbound`, `webhook.botConfig`, `webhook.decidirBot`,
`webhook.transicao`, `webhook.enviar`, `webhook.gravarOutbound`,
`webhook.contarFalasDoBot`, `send-message.meta`, `send-message.insert`,
`upload-media.comprimir`, `upload-media.meta`, `upload-media.storage`,
`upload-media.insert`, `mediaStorage.armazenarMidia`.

Leitura é **admin-only** (RLS); escrita, só `service_role`. A tabela **não tem
policy de INSERT/UPDATE/DELETE, de propósito** — se um INSERT de `authenticated`
começar a falhar ali, a correção é usar o cliente admin no servidor, **não**
adicionar policy.

Na Fase 1 não existe tela `/erros` (é Fase 2); consulte pelo SQL Editor.

## Identificadores

- WhatsApp: Meta Graph API **v22.0** (`GRAPH_BASE` em `src/lib/metaApi.ts`).
- Bucket de mídia: **`media`**, privado (`BUCKET` em `src/lib/mediaStorage.ts`).
- Compressão de imagem: `sharp`, máximo **1280 px** no maior lado, **WebP q80**.
- Identidade canônica da conversa: o **`wa_id`** da Meta, só dígitos. Nunca o
  `from`, nunca o número reformatado, nunca o que o atendente digitou. No sistema
  de referência o 9º dígito do cadastro divergiu do WhatsApp em 32 de 50
  disparos; usar outra coisa racha a mesma pessoa em dois cards de conversa.
- Projeto Supabase: **não existe ainda**. Ver `SETUP.md`.
