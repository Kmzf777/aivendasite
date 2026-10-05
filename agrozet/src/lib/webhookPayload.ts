// Extração do payload do webhook da Meta. ZERO I/O: só leitura defensiva de
// um `unknown` que veio da rede.
//
// REGRA DESTE ARQUIVO: NENHUMA FUNÇÃO LANÇA. Payload malformado devolve lista
// vazia ou `null`, nunca exceção. O motivo é operacional, não estético: uma
// exceção aqui sobe até a rota, a rota devolve 500, e a Meta trata 500 como
// "não entreguei" e REENTREGA o mesmo payload — em loop, com backoff, por
// horas. Um payload estranho tem de virar silêncio, não tempestade.
//
// Por isso todo acesso passa por `obj`/`str`: nada de cast direto, nada de
// confiar que `entry` é array ou que `message.type` é string.

/** Uma mensagem inbound já desembrulhada do envelope da Meta. */
export type MensagemWebhook = {
  /** Identidade CANÔNICA do cliente (`contacts[].wa_id`). Nunca o `from`. */
  waId: string
  /** Nome de exibição do WhatsApp. Só informativo — não vai para `clientes`. */
  profileName: string | null
  /** `wamid.XXX`; é a chave de idempotência em `messages.message_id`. */
  messageId: string
  /** Epoch em segundos, como string, do jeito que a Meta manda. */
  timestamp: string | null
  /** O objeto cru da mensagem, para as outras funções deste arquivo lerem. */
  raw: unknown
}

/** Uma atualização de entrega vinda de `statuses[]`. */
export type StatusWebhook = {
  messageId: string
  status: string
}

/**
 * Tipos que a UI sabe renderizar — e que por isso são os únicos valores
 * gravados em `messages.message_type`.
 */
export type TipoMensagem = 'text' | 'interactive' | 'image' | 'audio' | 'document' | 'video'

const TIPOS_MIDIA = ['image', 'audio', 'document', 'video', 'sticker'] as const

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** Os `value` de todos os `entry[].changes[]`, que é onde tudo mora. */
function valores(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const entry of arr(obj(payload)?.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const value = obj(obj(change)?.value)
      if (value) out.push(value)
    }
  }
  return out
}

/**
 * Desembrulha as mensagens inbound do payload.
 *
 * O `wa_id` vem de `contacts[]`, que é uma lista paralela a `messages[]`. Na
 * prática a Meta manda um contato por payload, mas pareamos por índice com
 * fallback no primeiro: errar isso atribuiria a mensagem ao telefone errado.
 *
 * Mensagem sem `id` é descartada — sem `message_id` não há chave de
 * idempotência, e gravá-la deixaria o bot responder duas vezes à reentrega.
 */
export function extrairMensagens(payload: unknown): MensagemWebhook[] {
  const out: MensagemWebhook[] = []

  for (const value of valores(payload)) {
    const contatos = arr(value.contacts)
    const mensagens = arr(value.messages)

    mensagens.forEach((raw, i) => {
      const m = obj(raw)
      if (!m) return

      const contato = obj(contatos[i]) ?? obj(contatos[0])
      // `wa_id` é a identidade canônica; sem ele a mensagem não tem dono e o
      // `from` NÃO serve de substituto (é ele que divergia no 9º dígito).
      const waId = str(contato?.wa_id)
      const messageId = str(m.id)
      if (!waId || !messageId) return

      out.push({
        waId,
        profileName: str(obj(contato?.profile)?.name),
        messageId,
        timestamp: str(m.timestamp),
        raw,
      })
    })
  }

  return out
}

/** Atualizações de entrega (`sent`/`delivered`/`read`/`failed`). */
export function extrairStatuses(payload: unknown): StatusWebhook[] {
  const out: StatusWebhook[] = []

  for (const value of valores(payload)) {
    for (const bruto of arr(value.statuses)) {
      const s = obj(bruto)
      const messageId = str(s?.id)
      const status = str(s?.status)
      if (messageId && status) out.push({ messageId, status })
    }
  }

  return out
}

/**
 * `botao_id` da opção escolhida, ou `null`.
 *
 * SÓ `type: 'interactive'` conta. O botão de template (quick reply) chega como
 * `type: 'button'` com `button.payload`, e o payload dele é texto de template,
 * não um `botao_id` do nosso menu — tratá-lo como escolha faria o bot capturar
 * um serviço que o cliente nunca escolheu.
 */
export function extrairBotaoId(raw: unknown): string | null {
  const m = obj(raw)
  if (str(m?.type) !== 'interactive') return null

  const interactive = obj(m?.interactive)
  return (
    str(obj(interactive?.button_reply)?.id) ??
    str(obj(interactive?.list_reply)?.id) ??
    null
  )
}

/**
 * Texto a gravar em `messages.content`.
 *
 * Mídia sem legenda devolve `null` de propósito: o rótulo ("Foto", "Áudio")
 * é decisão da UI, e gravar o rótulo aqui misturaria apresentação com dado.
 */
export function extrairConteudo(raw: unknown): string | null {
  const m = obj(raw)
  if (!m) return null

  switch (str(m.type)) {
    case 'text':
      return str(obj(m.text)?.body)

    case 'interactive': {
      // O TÍTULO, não o id: o atendente lê a conversa, e "Rações" diz algo que
      // "racoes" não diz.
      const interactive = obj(m.interactive)
      return (
        str(obj(interactive?.button_reply)?.title) ??
        str(obj(interactive?.list_reply)?.title) ??
        null
      )
    }

    case 'button':
      return str(obj(m.button)?.text)

    case 'document':
      // Documento sem legenda: o nome do arquivo é a melhor coisa a mostrar.
      return str(obj(m.document)?.caption) ?? str(obj(m.document)?.filename)

    case 'image':
    case 'audio':
    case 'video':
    case 'sticker':
      return str(obj(m[str(m.type) as string])?.caption)

    default:
      // Location, contacts, reaction, system, order... nada que a UI renderize.
      return null
  }
}

/**
 * `messages.message_type`, restrito ao que a UI renderiza.
 *
 * Tipo desconhecido cai em `'text'` em vez de ser gravado cru: a timeline tem
 * um ramo por tipo, e um valor inesperado viraria balão vazio. Com `'text'` o
 * atendente ao menos vê que algo chegou (e o `content`, se houver).
 *
 * `sticker` é mapeado para `'image'` — é uma imagem, e a UI não tem ramo de
 * sticker. O `media_id` continua sendo lido normalmente por `extrairMediaId`.
 */
export function tipoDaMensagem(raw: unknown): TipoMensagem {
  switch (str(obj(raw)?.type)) {
    case 'interactive':
      return 'interactive'
    case 'image':
    case 'sticker':
      return 'image'
    case 'audio':
      return 'audio'
    case 'document':
      return 'document'
    case 'video':
      return 'video'
    default:
      return 'text'
  }
}

/**
 * `media_id` da Meta, para `armazenarMidia` baixar o arquivo.
 *
 * O id é EFÊMERO (a URL expira em minutos), então quem recebe isto tem de
 * baixar na mesma requisição do webhook — não dá para guardar e buscar depois.
 */
export function extrairMediaId(raw: unknown): string | null {
  const m = obj(raw)
  if (!m) return null

  for (const tipo of TIPOS_MIDIA) {
    if (str(m.type) === tipo) return str(obj(m[tipo])?.id)
  }
  return null
}
