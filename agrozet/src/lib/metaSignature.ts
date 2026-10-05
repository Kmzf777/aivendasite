import { createHmac, timingSafeEqual } from 'crypto'

// Verifica o HMAC-SHA256 que a Meta envia em X-Hub-Signature-256 sobre o corpo
// BRUTO do request. Sem isso o webhook é um endpoint público forjável: a URL não
// é secreta, e o handler de `user_id_update` reescreve bsuid em massa com
// service_role. Comparação em tempo constante para não vazar bytes acertados.
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!appSecret) return false
  if (!signatureHeader?.startsWith('sha256=')) return false

  const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest()

  // timingSafeEqual lança se os tamanhos diferirem — hex malformado vira buffer curto.
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
