import sharp from 'sharp'
import { getMetaMediaUrl, downloadMetaMedia } from '@/lib/metaApi'
import { getAdminSupabase } from './supabaseAdmin'
import { logOperationalError } from './errorLog'

export const BUCKET = 'media'
export const MAX_LADO = 1280
export const QUALIDADE_WEBP = 80

/**
 * Storage do Supabase free tem 1 GB. Foto de celular de 3 MB vira ~60-120 KB
 * aqui (fator ~25x), o que e a diferenca entre o bucket durar meses ou anos.
 * `withoutEnlargement` evita esticar foto pequena.
 */
export async function comprimirImagem(
  entrada: ArrayBuffer
): Promise<{ buffer: Buffer; mime: 'image/webp' }> {
  const buffer = await sharp(Buffer.from(entrada))
    .rotate() // respeita o EXIF antes de redimensionar
    .resize({ width: MAX_LADO, height: MAX_LADO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALIDADE_WEBP })
    .toBuffer()
  return { buffer, mime: 'image/webp' as const }
}

const EXTENSAO: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
}

/** Caminho determinístico no bucket. */
export function caminhoMidia(messageId: string, mime: string): string {
  // O ponto do `wamid.XXX` e preservado; `/` e `=` (que o path do Storage nao
  // aceita) viram `_`.
  const base = messageId.replace(/[^A-Za-z0-9._-]/g, '_')
  // A Meta manda `audio/ogg; codecs=opus` — sem o split o lookup falha e toda
  // nota de voz vira `.bin`.
  return `${base}.${EXTENSAO[mime.split(';')[0]] ?? 'bin'}`
}

/** Baixa da Meta, comprime se imagem, grava no Storage. Devolve o path ou null. */
export async function armazenarMidia(
  mediaId: string,
  messageId: string
): Promise<{ path: string; mime: string } | null> {
  try {
    const { url, mime } = await getMetaMediaUrl(mediaId)
    const bruto = await downloadMetaMedia(url)

    let corpo: Buffer
    let mimeFinal: string
    if (mime.startsWith('image/')) {
      const comprimido = await comprimirImagem(bruto)
      corpo = comprimido.buffer
      mimeFinal = comprimido.mime
    } else {
      corpo = Buffer.from(bruto)
      mimeFinal = mime
    }

    const path = caminhoMidia(messageId, mimeFinal)
    // `upsert: true` e deliberado: a Meta reentrega webhooks e o `messageId` e
    // deterministico, entao reprocessar a mesma mensagem sobrescreve o mesmo
    // objeto em vez de duplicar.
    const { error } = await getAdminSupabase()
      .storage.from(BUCKET)
      .upload(path, corpo, { contentType: mimeFinal, upsert: true })
    if (error) throw new Error(error.message)

    return { path, mime: mimeFinal }
  } catch (e) {
    // NUNCA lanca: o chamador e o webhook, e o webhook nao pode devolver 500
    // (a Meta reentrega em loop). Uma foto que nao baixou e uma foto faltando
    // na timeline, nao um sistema fora do ar.
    await logOperationalError(
      'mediaStorage.armazenarMidia',
      e instanceof Error ? e.message : String(e),
      { mediaId, messageId }
    )
    return null
  }
}
