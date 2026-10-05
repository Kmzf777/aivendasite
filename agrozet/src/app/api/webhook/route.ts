// Webhook da Meta Cloud API v22.0 — a única porta de entrada do cliente.
//
// Esta rota é SÓ I/O. Toda decisão vive em `bot.ts` (pura, testada) e toda
// leitura de payload vive em `webhookPayload.ts` (pura, testada). O que sobra
// aqui é a sequência de efeitos — e é a sequência que importa.
//
// QUATRO INVARIANTES. Nenhuma é estilo; cada uma custou um incidente no
// sistema de referência:
//
//   1. ASSINATURA ANTES DE TUDO. A URL do webhook não é secreta. Sem conferir
//      o HMAC, qualquer um que descubra a URL escreve no nosso banco com
//      `service_role` (fora do RLS) e dispara mensagens pagas pelo nosso
//      número.
//   2. `wa_id` É A IDENTIDADE CANÔNICA. Nunca o `from`, nunca o número que a
//      gente enviou, nunca nada reformatado. No sistema de referência o 9º
//      dígito do cadastro divergiu do WhatsApp em 32 de 50 disparos: usar
//      outra coisa racha a mesma pessoa em dois cards de conversa.
//   3. NUNCA 500 POR ERRO NÃO-FATAL. A Meta trata 500 como "não entreguei" e
//      reentrega em loop, com backoff, por horas — e a cada reentrega o bot
//      tentaria responder de novo. Erro não-fatal vai para
//      `operational_errors` e a rota devolve 200.
//   4. GATE DE IDEMPOTÊNCIA ANTES DE QUALQUER EFEITO DE BOT. O upsert com
//      `ignoreDuplicates` + `select('id')` é o gate: array vazio significa
//      "já processei esta mensagem" e sai sem efeito nenhum.
//
// E uma de forma: o processamento é SEQUENCIADO por mensagem, nunca
// `Promise.all`. O sistema de referência paralelizava e corria contra si
// mesmo: a decisão do bot da 2ª mensagem lia as contagens antes de a 1ª ter
// sido gravada, e o teto por hora não segurava nada.

import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { decidirBot, type BotConfig, type BotOpcao, type BotStage, type BotMenu } from '@/lib/bot'
import { logOperationalError } from '@/lib/errorLog'
import { armazenarMidia } from '@/lib/mediaStorage'
import { sendWhatsAppInteractive, sendWhatsAppMessage } from '@/lib/metaApi'
import { verifyMetaSignature } from '@/lib/metaSignature'
import { getAdminSupabase } from '@/lib/supabaseAdmin'
import {
  extrairBotaoId,
  extrairConteudo,
  extrairMediaId,
  extrairMensagens,
  extrairStatuses,
  tipoDaMensagem,
  type MensagemWebhook,
} from '@/lib/webhookPayload'

/**
 * MARCA DO BOT em `messages.campaign_id`.
 *
 * O PROBLEMA: `messages` tem `direction`, mas `direction='outbound'` cobre
 * tanto a fala do bot quanto a fala do ATENDENTE HUMANO (`/api/send-message`).
 * As guardas do bot (teto de 6/hora, janela de leitura de 10 s) contam
 * "respostas do bot na última hora". Se a resposta digitada por um humano
 * entrasse nessa conta, um atendente ativo numa conversa — 6 mensagens em uma
 * hora é uma conversa NORMAL — calaria o bot para o próximo cliente que
 * escrevesse naquele telefone. A guarda existe contra laço robô-a-robô e
 * passaria a punir trabalho humano.
 *
 * A SOLUÇÃO: as mensagens que o bot envia levam `campaign_id = 'bot'`, e as
 * contagens filtram por isso. `campaign_id` é `text` livre, sem FK (ver a
 * migration), e na Fase 2 os disparos gravam ali o UUID da campanha — um
 * literal `'bot'` não colide com UUID nenhum. Os dois lados — a ESCRITA (em
 * `enviarEGravar`) e a CONTAGEM (em `contarFalasDoBot`) — usam esta mesma
 * constante, e é só por isso que a marca funciona.
 *
 * `/api/send-message` e `/api/upload-media` (do atendente) deixam
 * `campaign_id` nulo, que é o default da coluna — nada a fazer lá.
 */
const MARCA_BOT = 'bot'

const UMA_HORA_EM_MS = 60 * 60 * 1000

/** Stages válidos. O banco guarda `text`; aqui estreitamos para o tipo do bot. */
function normalizarStage(valor: string | null): BotStage | null {
  return valor === 'awaiting_choice' || valor === 'done' ? valor : null
}

// ---------------------------------------------------------------- GET
/**
 * Handshake de verificação da Meta. Ela chama este GET uma vez, ao assinar o
 * webhook, e espera o `hub.challenge` de volta em texto puro.
 *
 * `META_VERIFY_TOKEN` ausente cai no 403 naturalmente (nenhuma string é igual
 * a `undefined`), que é o lado certo para errar: melhor o handshake falhar do
 * que um webhook aceitar qualquer um.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  if (
    p.get('hub.mode') === 'subscribe' &&
    p.get('hub.verify_token') === process.env.META_VERIFY_TOKEN
  ) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

// ---------------------------------------------------------------- POST
export async function POST(request: NextRequest) {
  // INVARIANTE 1. O corpo tem de ser lido como TEXTO BRUTO: o HMAC é sobre os
  // bytes exatos que a Meta assinou, e `await request.json()` já descartou o
  // original (reserializar não reproduz o espaçamento nem a ordem).
  const raw = await request.text()
  if (
    !verifyMetaSignature(
      raw,
      request.headers.get('x-hub-signature-256'),
      process.env.META_APP_SECRET ?? ''
    )
  ) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  try {
    await processar(JSON.parse(raw))
  } catch (e) {
    // INVARIANTE 3. Inclui o `JSON.parse`: corpo assinado mas inválido é
    // registro de erro, não 500.
    await logOperationalError('webhook.POST', e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true })
}

async function processar(payload: unknown): Promise<void> {
  // (a) STATUSES ANTES DAS MENSAGENS. São baratos, independentes e um erro
  // aqui não pode impedir que a mensagem do cliente seja gravada.
  for (const s of extrairStatuses(payload)) {
    try {
      await getAdminSupabase()
        .from('messages')
        .update({ delivery_status: s.status })
        // Último a chegar vence. A Meta manda sent -> delivered -> read em
        // ordem na prática; uma label fora de ordem é cosmética e não vale
        // uma leitura extra por status.
        .eq('message_id', s.messageId)
    } catch (e) {
      await logOperationalError(
        'webhook.statuses',
        e instanceof Error ? e.message : String(e),
        { messageId: s.messageId, status: s.status }
      )
    }
  }

  // SEQUENCIADO, não `Promise.all` — ver o cabeçalho do arquivo. O try por
  // mensagem é para que uma mensagem problemática não engula as seguintes do
  // mesmo payload.
  for (const m of extrairMensagens(payload)) {
    try {
      await processarMensagem(m)
    } catch (e) {
      await logOperationalError(
        'webhook.processarMensagem',
        e instanceof Error ? e.message : String(e),
        { messageId: m.messageId }
      )
    }
  }
}

async function processarMensagem(m: MensagemWebhook): Promise<void> {
  const admin = getAdminSupabase()

  // INVARIANTE 2.
  const phone = m.waId

  // INVARIANTE 4: o gate de idempotência, antes de qualquer efeito de bot.
  // `ignoreDuplicates` transforma a reentrega num no-op silencioso e o
  // `select('id')` é o que nos deixa DETECTAR a reentrega: lista vazia = o
  // UNIQUE em `message_id` recusou a linha porque já processamos isto.
  //
  // Este INSERT também é o que dispara o trigger `messages_sync_cliente`, que
  // cria/atualiza a linha de `clientes`. Daí a ordem: ele vem antes da leitura
  // do cliente, logo abaixo.
  const { data: inserida, error: erroInsert } = await admin
    .from('messages')
    .upsert(
      {
        message_id: m.messageId,
        phone,
        direction: 'inbound',
        content: extrairConteudo(m.raw),
        message_type: tipoDaMensagem(m.raw),
      },
      { onConflict: 'message_id', ignoreDuplicates: true }
    )
    .select('id')

  if (erroInsert) {
    // Falhou a gravação: NÃO seguimos para o bot. Responder sem ter gravado
    // perderia o gate de idempotência e duplicaria a resposta na reentrega.
    await logOperationalError('webhook.gravarInbound', erroInsert.message, {
      messageId: m.messageId,
    })
    return
  }
  if (!inserida?.length) return // reentrega da Meta: sai sem efeito nenhum.

  // (b) MÍDIA. O `media_id` da Meta é efêmero (a URL expira em minutos), então
  // o download tem de acontecer nesta requisição. `armazenarMidia` NUNCA lança:
  // devolve `null` e já registra o erro. Foto faltando na timeline não é
  // sistema fora do ar, então seguimos adiante de qualquer jeito.
  const mediaId = extrairMediaId(m.raw)
  if (mediaId) {
    const guardada = await armazenarMidia(mediaId, m.messageId)
    if (guardada) {
      await admin
        .from('messages')
        .update({ media_path: guardada.path, media_mime: guardada.mime })
        .eq('message_id', m.messageId)
    }
  }

  // (c) O CLIENTE. SEM UPSERT: o trigger `messages_sync_cliente` é o dono
  // único do cadastro base e já rodou no INSERT acima. Um segundo escritor
  // aqui foi exatamente a causa do clobber de nome no sistema de referência —
  // cada mensagem nova revertia a correção manual do atendente para o nome de
  // exibição do WhatsApp. É por isso que `m.profileName` é lido do payload e
  // deliberadamente NÃO é gravado.
  const { data: cliente } = await admin
    .from('clientes')
    .select('phone, bot_stage')
    .eq('phone', phone)
    .maybeSingle()

  // COMO `clienteExiste` É DECIDIDO, e por que não é `!!cliente`:
  //
  // o trigger acabou de criar a linha, então `!!cliente` é praticamente SEMPRE
  // `true` — inclusive para quem está mandando a primeira mensagem da vida.
  // Usar a existência da linha faria o `start` nunca disparar e o bot nunca
  // saudar ninguém: o produto inteiro ficaria mudo.
  //
  // O que "cliente novo" significa para `decidirBot` é "ainda não passou pelo
  // fluxo do bot", e o marcador disso é `bot_stage IS NULL` — coluna que o
  // trigger NÃO escreve (ver a migration), e que portanto só esta rota mexe.
  // Então: `clienteExiste := bot_stage !== null`, que é exatamente o
  // `clienteExiste: false` + `stage: null` que `decidirBot` exige para o
  // `start`. E o `start` grava com `.is('bot_stage', null)`, de modo que duas
  // entregas concorrentes não saúdam duas vezes.
  //
  // Consequência aceita: um cliente cadastrado à mão na tela de clientes
  // (Fase 2) tem `bot_stage` nulo e vai receber a saudação na primeira
  // mensagem que mandar. É o comportamento desejado — ele nunca viu o menu.
  const stage = normalizarStage(cliente?.bot_stage ?? null)
  const clienteExiste = stage !== null

  // (d) AS CONTAGENS DAS GUARDAS, em uma consulta só.
  const falas = await contarFalasDoBot(phone)

  // (e) CONFIG + OPÇÕES. Todas as opções, ordenadas por `ordem`: é `montarMenu`
  // que filtra as inativas, e ele também precisa saber quantas existem para
  // escolher entre reply buttons e lista.
  const { data: configRow } = await admin
    .from('bot_config')
    .select('ativo, saudacao, rodape, fecho')
    .eq('id', 1)
    .maybeSingle()

  if (!configRow) {
    await logOperationalError('webhook.botConfig', 'bot_config id=1 nao encontrada', { phone })
    return
  }

  const { data: opcoesRows } = await admin
    .from('bot_opcoes')
    .select('botao_id, titulo, resposta, ordem, ativo')
    .order('ordem', { ascending: true })

  const config: BotConfig = configRow
  const opcoes: BotOpcao[] = opcoesRows ?? []

  const saida = decidirBot({
    clienteExiste,
    stage,
    config,
    opcoes,
    botaoId: extrairBotaoId(m.raw),
    menusEnviadosNaUltimaHora: falas.menusEnviadosNaUltimaHora,
    respostasNaUltimaHora: falas.respostasNaUltimaHora,
    ...(falas.segundosDesdeUltimaFala !== undefined
      ? { segundosDesdeUltimaFala: falas.segundosDesdeUltimaFala }
      : {}),
  })

  // (h) Erro operacional do bot (menu truncado, nenhuma opção ativa) é
  // informativo: registra e NÃO impede a ação.
  if (saida.erro) {
    await logOperationalError('webhook.decidirBot', saida.erro, { phone, acao: saida.acao })
  }

  if (saida.acao === 'none') return

  // (f) A TRANSIÇÃO, com UPDATE CONDICIONAL. `stageEsperado` é a defesa extra
  // contra reentrância: duas entregas simultâneas da mesma mensagem não podem
  // avançar o estado duas vezes, porque a segunda não casa o `WHERE`.
  if (saida.proximoStage) {
    const patch =
      saida.acao === 'capture_choice' && saida.servico
        ? { bot_stage: saida.proximoStage, ultimo_servico: saida.servico }
        : { bot_stage: saida.proximoStage }

    const base = admin.from('clientes').update(patch).eq('phone', phone)
    const { error } = await (saida.stageEsperado === null
      ? base.is('bot_stage', null)
      : saida.stageEsperado !== undefined
        ? base.eq('bot_stage', saida.stageEsperado)
        : base)

    if (error) {
      await logOperationalError('webhook.transicao', error.message, {
        phone,
        acao: saida.acao,
        proximoStage: saida.proximoStage,
      })
    }
  }

  // (g) ENVIA E GRAVA O OUTBOUND. `giveup` chega aqui sem texto e sem menu —
  // ele é silêncio deliberado, só fecha o fluxo e passa a conversa ao humano.
  const menu = saida.menu
  const texto = saida.texto
  if (menu) {
    await enviarEGravar(phone, 'interactive', conteudoDoMenu(menu), () =>
      sendWhatsAppInteractive(phone, menu)
    )
  } else if (texto) {
    await enviarEGravar(phone, 'text', texto, () => sendWhatsAppMessage(phone, texto))
  }
}

/**
 * As três contagens que as guardas do bot precisam, em UMA consulta.
 *
 * Filtra por `campaign_id = MARCA_BOT` — ver o comentário da constante: sem
 * esse filtro a resposta do atendente humano contaria como resposta do bot e
 * o teto de 6/hora calaria o bot por causa de trabalho humano.
 *
 * `created_at desc` para que a primeira linha seja a fala mais recente.
 */
async function contarFalasDoBot(phone: string): Promise<{
  menusEnviadosNaUltimaHora: number
  respostasNaUltimaHora: number
  segundosDesdeUltimaFala: number | undefined
}> {
  const desde = new Date(Date.now() - UMA_HORA_EM_MS).toISOString()

  const { data, error } = await getAdminSupabase()
    .from('messages')
    .select('message_type, created_at')
    .eq('phone', phone)
    .eq('direction', 'outbound')
    .eq('campaign_id', MARCA_BOT)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })

  if (error || !data) {
    // Falha de leitura NÃO pode virar "zero falas", senão o teto desaparece
    // justo quando o banco está ruim e o laço robô-a-robô fica livre.
    // Devolvemos valores que fazem o bot CALAR (teto estourado), que é o lado
    // seguro: perder uma saudação custa menos que 182 mensagens em 7 minutos.
    if (error) await logOperationalError('webhook.contarFalasDoBot', error.message, { phone })
    return {
      menusEnviadosNaUltimaHora: Number.MAX_SAFE_INTEGER,
      respostasNaUltimaHora: Number.MAX_SAFE_INTEGER,
      segundosDesdeUltimaFala: undefined,
    }
  }

  const menus = data.filter((r) => r.message_type === 'interactive').length
  const respostas = data.filter(
    (r) => r.message_type === 'interactive' || r.message_type === 'text'
  ).length

  const ultima = data[0]
  const segundos = ultima
    ? Math.max(0, Math.round((Date.now() - new Date(ultima.created_at).getTime()) / 1000))
    : undefined

  return {
    menusEnviadosNaUltimaHora: menus,
    respostasNaUltimaHora: respostas,
    segundosDesdeUltimaFala: segundos,
  }
}

/**
 * O que a timeline do atendente mostra de uma mensagem `interactive`.
 *
 * `messages` não guarda payload cru (decisão do spec: só os campos que a UI
 * consome), então o corpo e os títulos das opções são achatados num texto. O
 * atendente precisa ver O QUE O CLIENTE VIU para entender a resposta dele.
 */
function conteudoDoMenu(menu: BotMenu): string {
  const itens = menu.formato === 'button' ? menu.botoes : menu.itens
  return [menu.corpo, ...itens.map((i) => `• ${i.titulo}`)].join('\n')
}

/**
 * Envia pela Meta e grava o outbound.
 *
 * Gravar SEMPRE, mesmo quando a Meta não devolveu `message_id`: a mensagem
 * pode ter saído, e uma linha com id local mantém a timeline do atendente
 * coerente e — mais importante — mantém as contagens das guardas honestas.
 * Se um envio falho não contasse, uma falha em rajada liberaria o teto.
 */
async function enviarEGravar(
  phone: string,
  tipo: 'interactive' | 'text',
  conteudo: string,
  enviar: () => Promise<string | null>
): Promise<void> {
  let messageId: string | null = null
  try {
    messageId = await enviar()
  } catch (e) {
    await logOperationalError('webhook.enviar', e instanceof Error ? e.message : String(e), {
      phone,
      tipo,
    })
  }

  const { error } = await getAdminSupabase().from('messages').insert({
    // Fallback local quando a Meta não devolveu id: `message_id` é NOT NULL e
    // UNIQUE, e um uuid não colide com `wamid.XXX`.
    message_id: messageId ?? randomUUID(),
    phone,
    direction: 'outbound',
    content: conteudo,
    message_type: tipo,
    campaign_id: MARCA_BOT, // a marca do bot — ver MARCA_BOT.
  })

  if (error) {
    await logOperationalError('webhook.gravarOutbound', error.message, { phone, tipo })
  }
}
