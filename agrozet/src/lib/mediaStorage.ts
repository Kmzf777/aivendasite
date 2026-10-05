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

/**
 * Teto de bytes para midia RECEBIDA. Imagem e comprimida depois (fator ~20x),
 * entao 20 MB de entrada cabem folgados; nao-imagem e gravada crua e este e o
 * limite que protege o 1 GB do Storage free.
 */
export const MAX_BYTES_MIDIA = 20 * 1024 * 1024

/**
 * `Content-Length` da midia sem baixar o corpo, via HEAD. Devolve `null` quando
 * a Meta nao informa (ou o HEAD falha) — nao e erro, e o chamador cai no
 * segundo teto, depois do download.
 *
 * O header `Authorization` vai aqui tambem: a URL da midia da Meta responde 401
 * sem ele, inclusive no HEAD.
 */
async function tamanhoDaMidia(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${process.env.META_TOKEN}` },
    })
    const len = res.headers.get('content-length')
    if (!len) return null
    const n = Number(len)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

/** Baixa da Meta, comprime se imagem, grava no Storage. Devolve o path ou null. */
export async function armazenarMidia(
  mediaId: string,
  messageId: string
): Promise<{ path: string; mime: string } | null> {
  try {
    const { url, mime } = await getMetaMediaUrl(mediaId)

    // TETO DE BYTES ANTES DE BAIXAR. Sem isso o caminho inbound — o unico que o
    // CLIENTE controla — nao tem limite nenhum, enquanto `/api/upload-media` (o
    // atendente) tem 5 MB. Assimetria errada: a Meta aceita do cliente video e
    // documento de dezenas de MB.
    //
    // Dois custos, os dois reais no plano free. (1) Storage: o `else` abaixo
    // grava nao-imagem CRUA, entao um PDF de 60 MB come 6% do 1 GB numa
    // mensagem. (2) Tempo: o buffer inteiro passa pela memoria da funcao dentro
    // da requisicao do webhook, e estourar o `maxDuration` faz a Meta nao
    // receber 200 e reentregar — e a reentrega bate no gate de idempotencia e
    // sai sem efeito, ou seja, o cliente NUNCA e saudado.
    //
    // Mídia grande demais vira `null`: a mensagem fica na timeline sem anexo e
    // o atendente pede pro cliente reenviar menor. A conversa continua.
    const tamanho = await tamanhoDaMidia(url)
    if (tamanho !== null && tamanho > MAX_BYTES_MIDIA) {
      await logOperationalError(
        'mediaStorage.midiaGrande',
        `midia de ${tamanho} bytes acima do teto de ${MAX_BYTES_MIDIA}`,
        { mediaId, messageId, mime, tamanho }
      )
      return null
    }

    const bruto = await downloadMetaMedia(url)

    // Segunda checagem: a Meta pode nao mandar `Content-Length` (`tamanho`
    // null), e nesse caso o teto so pode ser aplicado com os bytes na mao.
    if (bruto.byteLength > MAX_BYTES_MIDIA) {
      await logOperationalError(
        'mediaStorage.midiaGrande',
        `midia de ${bruto.byteLength} bytes acima do teto de ${MAX_BYTES_MIDIA} (sem Content-Length)`,
        { mediaId, messageId, mime }
      )
      return null
    }

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
