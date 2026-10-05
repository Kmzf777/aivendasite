import { describe, it, expect } from 'vitest'
import { extrairMensagens, extrairConteudo, extrairBotaoId, extrairStatuses, tipoDaMensagem, extrairMediaId } from './webhookPayload'

const envelope = (message: unknown) => ({
  entry: [{ changes: [{ value: { contacts: [{ wa_id: '5534999990000', profile: { name: 'Rafael' } }], messages: [message] } }] }],
})

describe('extrairBotaoId', () => {
  it('le button_reply', () => {
    expect(extrairBotaoId({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'racoes', title: 'Rações' } } })).toBe('racoes')
  })

  it('le list_reply', () => {
    expect(extrairBotaoId({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'banho_tosa', title: 'Banho' } } })).toBe('banho_tosa')
  })

  it('devolve null para texto', () => {
    expect(extrairBotaoId({ type: 'text', text: { body: 'oi' } })).toBeNull()
  })

  // Botao de template (quick reply) chega como type 'button', nao 'interactive'.
  it('devolve null para botao de template', () => {
    expect(extrairBotaoId({ type: 'button', button: { payload: 'x', text: 'Parar' } })).toBeNull()
  })
})

describe('extrairConteudo', () => {
  it('le texto', () => {
    expect(extrairConteudo({ type: 'text', text: { body: 'bom dia' } })).toBe('bom dia')
  })

  it('le o titulo do botao apertado', () => {
    expect(extrairConteudo({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'racoes', title: 'Rações' } } })).toBe('Rações')
  })

  it('le a legenda da imagem', () => {
    expect(extrairConteudo({ type: 'image', image: { id: '1', caption: 'olha o Thor' } })).toBe('olha o Thor')
  })

  it('devolve null para imagem sem legenda', () => {
    expect(extrairConteudo({ type: 'image', image: { id: '1' } })).toBeNull()
  })
})

describe('extrairMensagens', () => {
  it('traz wa_id, nome de perfil e a mensagem', () => {
    const [m] = extrairMensagens(envelope({ id: 'wamid.1', type: 'text', text: { body: 'oi' }, timestamp: '1760000000' }))
    expect(m.waId).toBe('5534999990000')
    expect(m.profileName).toBe('Rafael')
    expect(m.messageId).toBe('wamid.1')
  })

  it('devolve lista vazia para payload sem mensagem', () => {
    expect(extrairMensagens({ entry: [{ changes: [{ value: {} }] }] })).toEqual([])
  })

  it('nao explode com payload malformado', () => {
    expect(extrairMensagens({})).toEqual([])
    expect(extrairMensagens(null)).toEqual([])
  })
})

describe('extrairStatuses', () => {
  it('le o status de entrega', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] }
    expect(extrairStatuses(payload)).toEqual([{ messageId: 'wamid.1', status: 'delivered' }])
  })
})

describe('tipoDaMensagem', () => {
  it('mapeia os tipos que a UI conhece', () => {
    expect(tipoDaMensagem({ type: 'text' })).toBe('text')
    expect(tipoDaMensagem({ type: 'interactive' })).toBe('interactive')
    expect(tipoDaMensagem({ type: 'image' })).toBe('image')
    expect(tipoDaMensagem({ type: 'audio' })).toBe('audio')
  })

  it('cai em text para tipo desconhecido', () => {
    expect(tipoDaMensagem({ type: 'sticker_pack_v7' })).toBe('text')
  })
})

describe('extrairMediaId', () => {
  it('le o id da imagem', () => {
    expect(extrairMediaId({ type: 'image', image: { id: '12345', caption: 'oi' } })).toBe('12345')
  })

  it('le o id do audio, do documento, do video e do sticker', () => {
    expect(extrairMediaId({ type: 'audio', audio: { id: 'a1' } })).toBe('a1')
    expect(extrairMediaId({ type: 'document', document: { id: 'd1' } })).toBe('d1')
    expect(extrairMediaId({ type: 'video', video: { id: 'v1' } })).toBe('v1')
    expect(extrairMediaId({ type: 'sticker', sticker: { id: 's1' } })).toBe('s1')
  })

  it('devolve null quando nao ha midia', () => {
    expect(extrairMediaId({ type: 'text', text: { body: 'oi' } })).toBeNull()
    expect(extrairMediaId({ type: 'image' })).toBeNull()
    expect(extrairMediaId(null)).toBeNull()
  })
})
