import { describe, it, expect } from 'vitest'
import { montarLista, estaPendente } from './listaConversas'

const msg = (phone: string, direction: 'inbound' | 'outbound', iso: string, content = 'oi') =>
  ({ phone, direction, created_at: iso, content, message_type: 'text' })

describe('estaPendente', () => {
  // Pendente e DERIVADO: a ultima mensagem e inbound. Com um numero so e todos
  // vendo tudo, "lida por quem?" nao tem resposta util, entao nao existe
  // conversation_reads nem contador por usuario.
  it('e pendente quando a ultima mensagem e do cliente', () => {
    expect(estaPendente([msg('1', 'outbound', '2026-10-05T10:00:00Z'), msg('1', 'inbound', '2026-10-05T11:00:00Z')])).toBe(true)
  })

  it('nao e pendente quando nos respondemos por ultimo', () => {
    expect(estaPendente([msg('1', 'inbound', '2026-10-05T10:00:00Z'), msg('1', 'outbound', '2026-10-05T11:00:00Z')])).toBe(false)
  })

  it('ignora a ordem do array e olha o timestamp', () => {
    expect(estaPendente([msg('1', 'inbound', '2026-10-05T11:00:00Z'), msg('1', 'outbound', '2026-10-05T10:00:00Z')])).toBe(true)
  })

  it('conversa vazia nao e pendente', () => {
    expect(estaPendente([])).toBe(false)
  })
})

describe('montarLista', () => {
  it('agrupa por telefone e traz a ultima mensagem', () => {
    const lista = montarLista([
      msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z', 'primeira'),
      msg('5534999990000', 'inbound', '2026-10-05T12:00:00Z', 'ultima'),
    ], [])
    expect(lista).toHaveLength(1)
    expect(lista[0].ultimaMensagem).toBe('ultima')
  })

  it('poe pendentes antes de respondidas, mesmo sendo mais antigas', () => {
    const lista = montarLista([
      msg('AAA', 'inbound', '2026-10-05T08:00:00Z'),
      msg('BBB', 'inbound', '2026-10-05T12:00:00Z'),
      msg('BBB', 'outbound', '2026-10-05T12:05:00Z'),
    ], [])
    expect(lista.map((c) => c.phone)).toEqual(['AAA', 'BBB'])
  })

  it('entre pendentes, a mais recente primeiro', () => {
    const lista = montarLista([
      msg('AAA', 'inbound', '2026-10-05T08:00:00Z'),
      msg('BBB', 'inbound', '2026-10-05T12:00:00Z'),
    ], [])
    expect(lista.map((c) => c.phone)).toEqual(['BBB', 'AAA'])
  })

  it('traz nome e etiqueta de servico do cliente', () => {
    const lista = montarLista(
      [msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z')],
      [{ phone: '5534999990000', nome: 'Rafael', ultimo_servico: 'banho_tosa' }]
    )
    expect(lista[0].nome).toBe('Rafael')
    expect(lista[0].ultimoServico).toBe('banho_tosa')
  })

  it('cliente sem cadastro ainda aparece na lista', () => {
    const lista = montarLista([msg('5534999990000', 'inbound', '2026-10-05T10:00:00Z')], [])
    expect(lista[0].nome).toBeNull()
  })

  // Egress do free tier e 5 GB/mes: a lista nunca carrega imagem.
  it('rotula imagem sem legenda em vez de expor o path', () => {
    const lista = montarLista(
      [{ phone: '1', direction: 'inbound', created_at: '2026-10-05T10:00:00Z', content: null, message_type: 'image' }],
      []
    )
    expect(lista[0].ultimaMensagem).toBe('Foto')
  })
})
