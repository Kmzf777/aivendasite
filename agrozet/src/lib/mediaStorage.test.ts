import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { comprimirImagem, caminhoMidia } from './mediaStorage'

async function pngDe(largura: number, altura: number): Promise<ArrayBuffer> {
  const buf = await sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 90, b: 30 } },
  }).png().toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('comprimirImagem', () => {
  it('devolve webp', async () => {
    const { buffer, mime } = await comprimirImagem(await pngDe(400, 300))
    expect(mime).toBe('image/webp')
    expect((await sharp(buffer).metadata()).format).toBe('webp')
  })

  it('reduz o maior lado para 1280', async () => {
    const { buffer } = await comprimirImagem(await pngDe(4000, 3000))
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(1280)
    expect(meta.height).toBe(960)
  })

  it('reduz o maior lado tambem no retrato', async () => {
    const { buffer } = await comprimirImagem(await pngDe(3000, 4000))
    const meta = await sharp(buffer).metadata()
    expect(meta.height).toBe(1280)
    expect(meta.width).toBe(960)
  })

  // Sem isso, uma foto pequena sairia ESTICADA do "redimensionamento".
  it('nao amplia imagem menor que 1280', async () => {
    const { buffer } = await comprimirImagem(await pngDe(300, 200))
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(300)
    expect(meta.height).toBe(200)
  })

  // A razao de existir do modulo: o Storage free tem 1 GB.
  it('encolhe bastante uma foto grande', async () => {
    const entrada = await pngDe(4000, 3000)
    const { buffer } = await comprimirImagem(entrada)
    expect(buffer.byteLength).toBeLessThan(entrada.byteLength / 5)
  })
})

describe('caminhoMidia', () => {
  it('usa extensao webp para imagem', () => {
    expect(caminhoMidia('wamid.ABC', 'image/webp')).toBe('wamid.ABC.webp')
  })

  it('usa ogg para audio', () => {
    expect(caminhoMidia('wamid.ABC', 'audio/ogg')).toBe('wamid.ABC.ogg')
  })

  it('cai em bin para mime desconhecido', () => {
    expect(caminhoMidia('wamid.ABC', 'application/zip')).toBe('wamid.ABC.bin')
  })

  // message_id da Meta tem ponto e pode ter = e /; o path do Storage nao aceita.
  it('sanitiza caracteres invalidos de path', () => {
    expect(caminhoMidia('wamid.A/B=C', 'image/webp')).toBe('wamid.A_B_C.webp')
  })
})
