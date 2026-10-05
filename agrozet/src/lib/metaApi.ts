import { buildRecipient } from './waIdentity'
import type { BotMenu } from './botTypes'

const GRAPH_BASE = 'https://graph.facebook.com/v22.0'

// O Agrozet tem UM número de WhatsApp: o phone id sempre vem do env, nunca por
// parâmetro (o sistema de referência era multi-instância e passava `phoneId`).
//
// META_TOKEN é deliberadamente server-only: com o prefixo NEXT_PUBLIC_ o Next.js
// substituía a variável pelo valor literal no bundle do browser, publicando o
// token do WhatsApp Business. Nunca reintroduza o prefixo nesta variável.
function getCredentials() {
  const phoneId = process.env.NEXT_PUBLIC_META_PHONE_ID
  const token = process.env.META_TOKEN
  if (!phoneId || !token) throw new Error('Meta WhatsApp environment variables are missing')
  return { phoneId, token }
}

async function metaPost(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { phoneId, token } = getCredentials()
  const res = await fetch(`${GRAPH_BASE}/${phoneId}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Falha na Meta API')
  }
  return res.json() as Promise<Record<string, unknown>>
}

function extractMessageId(data: Record<string, unknown>): string | null {
  const msgs = data.messages as { id: string }[] | undefined
  return msgs?.[0]?.id ?? null
}

// A Meta devolve, no envio, a identidade REAL do destinatário em `contacts[0].wa_id`.
// Ela pode divergir do número que enviamos: o cadastro traz o 9º dígito, mas boa
// parte dos números está registrada no WhatsApp sem ele. O wa_id é a única
// identidade confiável — é a mesma chave que o webhook usa no inbound, então
// gravá-la evita a conversa rachar em dois cards.
function extractWaId(data: Record<string, unknown>): string | null {
  const contacts = data.contacts as { wa_id?: string }[] | undefined
  return contacts?.[0]?.wa_id ?? null
}

export { extractMessageId, extractWaId }

// Mantido só como contrato de tipo para a Fase 3 (disparo por template). Nenhuma
// função deste módulo o usa hoje — o envio de template volta na Fase 3.
export type TemplateComponent = {
  type: string
  parameters: (
    | { type: 'text'; text: string }
    | { type: 'image'; image: { link: string }; text?: undefined }
  )[]
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<string | null> {
  const data = await metaPost('messages', {
    messaging_product: 'whatsapp',
    ...buildRecipient(to),
    type: 'text',
    text: { body: text },
    ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
  })
  return extractMessageId(data)
}

export type MediaType = 'image' | 'audio' | 'document' | 'sticker' | 'video'

export async function sendWhatsAppMedia(
  to: string,
  mediaId: string,
  type: MediaType,
  caption?: string
): Promise<string | null> {
  const mediaPayload: Record<string, unknown> = { id: mediaId }
  if (caption && (type === 'image' || type === 'document' || type === 'video')) {
    mediaPayload.caption = caption
  }
  const data = await metaPost('messages', {
    messaging_product: 'whatsapp',
    ...buildRecipient(to),
    type,
    [type]: mediaPayload,
  })
  return extractMessageId(data)
}

// Limites da Cloud API para interactive. Estourar não dá erro de validação
// legível na Meta, dá 400 genérico — por isso a checagem é local e lança na
// hora, como erro de programação.
const MAX_BOTOES = 3
const MAX_TITULO_BOTAO = 20
const MAX_ITENS_LISTA = 10
const MAX_TITULO_ITEM = 24
const MAX_ROTULO_LISTA = 20

/** Payload puro, exportado para teste sem rede. */
export function buildInteractivePayload(to: string, menu: BotMenu): Record<string, unknown> {
  const base = {
    messaging_product: 'whatsapp',
    ...buildRecipient(to),
    type: 'interactive',
  }
  // O footer só entra quando existe: a Meta rejeita `footer: { text: '' }`, e um
  // `footer: undefined` sobreviveria ao JSON.stringify como ausente mas quebraria
  // a igualdade estrutural esperada pelos testes.
  const footer = menu.rodape ? { footer: { text: menu.rodape } } : {}

  if (menu.formato === 'button') {
    if (menu.botoes.length < 1) throw new Error('interactive precisa de pelo menos 1 botao')
    if (menu.botoes.length > MAX_BOTOES) {
      throw new Error(`interactive aceita no maximo ${MAX_BOTOES} botoes, recebeu ${menu.botoes.length}`)
    }
    for (const b of menu.botoes) {
      if (b.titulo.length > MAX_TITULO_BOTAO) {
        throw new Error(`rotulo "${b.titulo}" excede ${MAX_TITULO_BOTAO} caracteres`)
      }
    }
    return {
      ...base,
      interactive: {
        type: 'button',
        body: { text: menu.corpo },
        ...footer,
        action: {
          buttons: menu.botoes.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo } })),
        },
      },
    }
  }

  if (menu.itens.length < 1) throw new Error('interactive list precisa de pelo menos 1 item')
  if (menu.itens.length > MAX_ITENS_LISTA) {
    throw new Error(`interactive list aceita no maximo ${MAX_ITENS_LISTA} itens, recebeu ${menu.itens.length}`)
  }
  if (menu.rotulo.length > MAX_ROTULO_LISTA) {
    throw new Error(`rotulo da lista "${menu.rotulo}" excede ${MAX_ROTULO_LISTA} caracteres`)
  }
  for (const i of menu.itens) {
    if (i.titulo.length > MAX_TITULO_ITEM) {
      throw new Error(`titulo "${i.titulo}" excede ${MAX_TITULO_ITEM} caracteres`)
    }
  }
  return {
    ...base,
    interactive: {
      type: 'list',
      body: { text: menu.corpo },
      ...footer,
      // Uma seção só, sem título: o menu do Agrozet é plano. A Meta exige ao
      // menos uma seção, mas o título dela é opcional.
      action: {
        button: menu.rotulo,
        sections: [{ rows: menu.itens.map((i) => ({ id: i.id, title: i.titulo })) }],
      },
    },
  }
}

/** Mensagem interativa (reply buttons ou lista). Só dentro da janela de 24h. */
export async function sendWhatsAppInteractive(to: string, menu: BotMenu): Promise<string | null> {
  const data = await metaPost('messages', buildInteractivePayload(to, menu))
  return extractMessageId(data)
}

/** Sobe um arquivo para a Meta e devolve o media id usado no envio. */
export async function uploadMetaMedia(file: Blob, mime: string): Promise<string> {
  const { phoneId, token } = getCredentials()
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('file', file, 'upload')
  form.append('type', mime)
  // Sem Content-Type manual: o fetch precisa gerar o boundary do multipart.
  const res = await fetch(`${GRAPH_BASE}/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? 'Falha ao subir media na Meta'
    )
  }
  const { id } = (await res.json()) as { id?: string }
  if (!id) throw new Error('Meta nao devolveu o media id')
  return id
}

/**
 * Resolve o media id numa URL de download. ATENÇÃO: essa URL expira em poucos
 * minutos e NÃO é pública — o download exige o header Authorization (ver
 * `downloadMetaMedia`). Baixar sem o header devolve 401.
 */
export async function getMetaMediaUrl(mediaId: string): Promise<{ url: string; mime: string }> {
  const { token } = getCredentials()
  const res = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? 'Falha ao resolver media da Meta'
    )
  }
  const { url, mime_type } = (await res.json()) as { url: string; mime_type: string }
  return { url, mime: mime_type }
}

/**
 * Baixa o arquivo da URL já resolvida por `getMetaMediaUrl`. O header
 * Authorization é obrigatório: a URL da Meta parece pública mas responde 401
 * sem o bearer token.
 */
export async function downloadMetaMedia(url: string): Promise<ArrayBuffer> {
  const { token } = getCredentials()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Falha ao baixar media da Meta (${res.status})`)
  return res.arrayBuffer()
}
