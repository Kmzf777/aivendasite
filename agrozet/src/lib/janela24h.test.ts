import { describe, it, expect } from 'vitest'
import { getWindowStatus, reativacaoJaEnviada, nuncaRespondeu } from './janela24h'

const CORPO = 'corpo do template de reativação'

const agora = new Date('2026-07-10T12:00:00Z')
const msg = (direction: 'inbound' | 'outbound', iso: string) =>
  ({ direction, created_at: iso }) as Parameters<typeof getWindowStatus>[0][number]

describe('getWindowStatus', () => {
  it('sem inbound: janela fechada', () => {
    const s = getWindowStatus([msg('outbound', '2026-07-10T11:00:00Z')], agora)
    expect(s.isOpen).toBe(false)
    expect(s.statusColor).toBe('red')
  })

  it('lista vazia: janela fechada', () => {
    expect(getWindowStatus([], agora).isOpen).toBe(false)
  })

  it('inbound ha 1h: aberta e verde (>2h restantes)', () => {
    const s = getWindowStatus([msg('inbound', '2026-07-10T11:00:00Z')], agora)
    expect(s.isOpen).toBe(true)
    expect(s.statusColor).toBe('green')
    expect(s.timeLeft).toBe('23h 0m')
  })

  it('inbound ha 23h: aberta e amarela (<2h restantes)', () => {
    const s = getWindowStatus([msg('inbound', '2026-07-09T13:00:00Z')], agora)
    expect(s.isOpen).toBe(true)
    expect(s.statusColor).toBe('yellow')
    expect(s.timeLeft).toBe('1h 0m')
  })

  it('inbound ha exatamente 24h: fechada', () => {
    const s = getWindowStatus([msg('inbound', '2026-07-09T12:00:00Z')], agora)
    expect(s.isOpen).toBe(false)
  })

  it('usa o inbound MAIS RECENTE, nao o primeiro da lista', () => {
    const s = getWindowStatus(
      [msg('inbound', '2026-07-08T12:00:00Z'), msg('inbound', '2026-07-10T11:30:00Z')],
      agora
    )
    expect(s.isOpen).toBe(true)
  })

  it('menos de 1h restante omite as horas', () => {
    const s = getWindowStatus([msg('inbound', '2026-07-09T12:30:00Z')], agora)
    expect(s.timeLeft).toBe('30m')
  })
})

describe('reativacaoJaEnviada', () => {
  const d = (direction: 'inbound' | 'outbound', message_type: string, iso: string, content = CORPO) =>
    ({ direction, message_type, created_at: iso, content })

  it('lista vazia: nao enviada', () => {
    expect(reativacaoJaEnviada([], CORPO)).toBe(false)
  })

  it('disparo de reativacao depois do ultimo inbound: enviada', () => {
    expect(
      reativacaoJaEnviada(
        [
          d('inbound', 'text', '2026-07-09T10:00:00Z'),
          d('outbound', 'disparo', '2026-07-10T11:00:00Z'),
        ],
        CORPO
      )
    ).toBe(true)
  })

  it('disparo de reativacao antes do ultimo inbound: nao enviada (o lead ja respondeu)', () => {
    expect(
      reativacaoJaEnviada(
        [
          d('outbound', 'disparo', '2026-07-09T10:00:00Z'),
          d('inbound', 'text', '2026-07-10T11:00:00Z'),
        ],
        CORPO
      )
    ).toBe(false)
  })

  it('so texto outbound depois do inbound: nao enviada', () => {
    expect(
      reativacaoJaEnviada(
        [
          d('inbound', 'text', '2026-07-09T10:00:00Z'),
          d('outbound', 'text', '2026-07-10T11:00:00Z'),
        ],
        CORPO
      )
    ).toBe(false)
  })

  it('disparo de reativacao sem nenhum inbound: enviada', () => {
    expect(
      reativacaoJaEnviada([d('outbound', 'disparo', '2026-07-10T11:00:00Z')], CORPO)
    ).toBe(true)
  })

  it('disparo de CAMPANHA (content diferente) posterior ao inbound: nao trava', () => {
    expect(
      reativacaoJaEnviada(
        [
          d('inbound', 'text', '2026-07-09T10:00:00Z'),
          d('outbound', 'disparo', '2026-07-10T11:00:00Z', 'Promoção de julho: confira!'),
        ],
        CORPO
      )
    ).toBe(false)
  })
})

describe('nuncaRespondeu', () => {
  it('lista vazia: nunca respondeu', () => {
    expect(nuncaRespondeu([])).toBe(true)
  })

  it('so outbound: nunca respondeu', () => {
    expect(nuncaRespondeu([{ direction: 'outbound' }, { direction: 'outbound' }])).toBe(true)
  })

  it('com pelo menos um inbound: ja respondeu', () => {
    expect(nuncaRespondeu([{ direction: 'outbound' }, { direction: 'inbound' }])).toBe(false)
  })
})
