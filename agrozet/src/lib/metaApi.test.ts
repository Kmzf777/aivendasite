import { describe, it, expect } from 'vitest'
import { buildInteractivePayload } from './metaApi'
import type { BotMenu } from './botTypes'

describe('buildInteractivePayload', () => {
  it('monta reply buttons', () => {
    const menu: BotMenu = {
      formato: 'button',
      corpo: 'Em que podemos ajudar?',
      rodape: 'Agrozet',
      botoes: [{ id: 'banho_tosa', titulo: 'Banho e Tosa' }],
    }
    expect(buildInteractivePayload('5534999990000', menu)).toEqual({
      messaging_product: 'whatsapp',
      to: '5534999990000',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Em que podemos ajudar?' },
        footer: { text: 'Agrozet' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'banho_tosa', title: 'Banho e Tosa' } }],
        },
      },
    })
  })

  it('omite o footer quando o rodape e nulo', () => {
    const menu: BotMenu = { formato: 'button', corpo: 'oi', rodape: null, botoes: [{ id: 'a', titulo: 'A' }] }
    const payload = buildInteractivePayload('5534999990000', menu)
    expect((payload.interactive as Record<string, unknown>).footer).toBeUndefined()
  })

  it('monta lista com uma secao', () => {
    const menu: BotMenu = {
      formato: 'list',
      corpo: 'Escolha:',
      rodape: null,
      rotulo: 'Ver serviços',
      itens: [{ id: 'a', titulo: 'A' }, { id: 'b', titulo: 'B' }],
    }
    const payload = buildInteractivePayload('5534999990000', menu)
    const interactive = payload.interactive as Record<string, unknown>
    expect(interactive.type).toBe('list')
    expect(interactive.action).toEqual({
      button: 'Ver serviços',
      sections: [{ rows: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }],
    })
  })
})
