import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getAdminSupabase } from '@/lib/supabaseAdmin'
import { sendWhatsAppMedia, uploadMetaMedia } from '@/lib/metaApi'
import { BUCKET, caminhoMidia, comprimirImagem } from '@/lib/mediaStorage'
import { normalizePhone } from '@/lib/phoneUtils'
import { logOperationalError } from '@/lib/errorLog'

// Envio de imagem pelo composer da tela de conversas.
//
// Só imagem na Fase 1: o composer oferece anexo de foto, não áudio nem
// documento (o sistema de referência gravava nota de voz com ffmpeg — fora de
// escopo aqui).
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const

// 5 MB é limite NOSSO, não da Meta (que aceita 5 MB em imagem mas 100 MB em
// outros tipos). O motivo é o Storage free do Supabase: 1 GB total. Um teto
// generoso aqui significaria o bucket cheio em semanas, e o limite real da
// conta não dá erro legível — dá falha de upload no meio do envio.
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  // Sessão validada na rota, não só no middleware: sem isso qualquer anônimo
  // sobe arquivo para a Meta (queimando quota) e para o Storage via
  // service_role. Cliente de sessão, nunca `getAdminSupabase()` — o admin não
  // tem usuário e nunca reprovaria.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'corpo nao e multipart' }, { status: 400 })

  const file = form.get('file')
  const phoneRaw = form.get('phone')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'campo "file" ausente ou vazio' }, { status: 400 })
  }
  if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
    return NextResponse.json({ error: 'campo "phone" ausente' }, { status: 400 })
  }

  // `file.type` vem do browser; o split do `;` cobre `image/jpeg; charset=...`.
  const mimeEnviado = file.type.split(';')[0].trim().toLowerCase()
  if (!(TIPOS_ACEITOS as readonly string[]).includes(mimeEnviado)) {
    return NextResponse.json(
      { error: `tipo "${file.type || 'desconhecido'}" nao aceito; use JPEG, PNG ou WebP` },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `arquivo de ${(file.size / 1024 / 1024).toFixed(1)} MB excede o limite de 5 MB` },
      { status: 400 }
    )
  }

  // Mesma regra de identidade do /api/send-message: só dígitos, igual ao
  // `wa_id` que o webhook grava, para a imagem cair no mesmo card.
  const canonico = normalizePhone(phoneRaw)
  if (!canonico) return NextResponse.json({ error: 'phone sem digitos' }, { status: 400 })

  // COMPRIME ANTES de qualquer upload, e o MESMO buffer vai para os dois
  // destinos (Meta e bucket). Duas razões: o cliente baixa uma foto ~20x menor
  // (medimos 21,7x no pior caso realista de foto de celular) e o Storage free
  // de 1 GB dura anos em vez de semanas. Subir o original para a Meta e só
  // comprimir para o bucket desperdiçaria a metade que mais importa.
  let comprimido: { buffer: Buffer; mime: 'image/webp' }
  try {
    comprimido = await comprimirImagem(await file.arrayBuffer())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logOperationalError('upload-media.comprimir', msg, { phone: canonico })
    return NextResponse.json({ error: 'falha ao processar a imagem' }, { status: 400 })
  }

  // ORDEM DELIBERADA: Meta primeiro (upload + envio), persistência depois. Se
  // a Meta recusar, não sobra no bucket nem em `messages` uma imagem que nunca
  // saiu.
  let metaMessageId: string | null
  try {
    const blob = new Blob([new Uint8Array(comprimido.buffer)], { type: comprimido.mime })
    const mediaId = await uploadMetaMedia(blob, comprimido.mime)
    metaMessageId = await sendWhatsAppMedia(canonico, mediaId, 'image')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logOperationalError('upload-media.meta', msg, { phone: canonico })
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // `message_id` é UNIQUE NOT NULL — fallback obrigatório (ver send-message).
  const messageId = metaMessageId ?? `outbound_${crypto.randomUUID()}`
  const path = caminhoMidia(messageId, comprimido.mime)

  // Daqui para baixo a imagem JÁ está no WhatsApp do cliente. Qualquer falha é
  // um furo na NOSSA timeline, não um envio perdido: registra erro operacional
  // e ainda devolve 200, senão o atendente reenvia e o cliente recebe duas vezes.
  const admin = getAdminSupabase()

  // `upsert: true` porque o path é determinístico no messageId: reprocessar a
  // mesma mensagem sobrescreve o mesmo objeto em vez de duplicar.
  const { error: erroStorage } = await admin.storage
    .from(BUCKET)
    .upload(path, comprimido.buffer, { contentType: comprimido.mime, upsert: true })

  if (erroStorage) {
    await logOperationalError('upload-media.storage', erroStorage.message, {
      phone: canonico,
      messageId,
      path,
    })
  }

  // Se o objeto não entrou no bucket, `media_path` fica nulo: a UI mostra
  // "mídia expirada" em vez de um link quebrado para um objeto inexistente.
  const { error: erroInsert } = await admin.from('messages').insert({
    message_id: messageId,
    phone: canonico,
    direction: 'outbound',
    message_type: 'image',
    media_path: erroStorage ? null : path,
    media_mime: comprimido.mime,
  })

  if (erroInsert) {
    await logOperationalError('upload-media.insert', erroInsert.message, {
      phone: canonico,
      messageId,
      path,
    })
  }

  return NextResponse.json({ messageId })
}
