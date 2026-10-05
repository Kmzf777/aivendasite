import { describe, it, expect } from 'vitest'
import { isBsuid, buildRecipient } from './waIdentity'

describe('isBsuid', () => {
  it('reconhece BSUID regular (país.alfanumérico)', () => {
    expect(isBsuid('BR.13491208655302741918')).toBe(true)
  })
  it('reconhece BSUID principal (país.ENT.alfanumérico)', () => {
    expect(isBsuid('BR.ENT.11815799212886844830')).toBe(true)
  })
  it('trata telefone brasileiro como não-BSUID', () => {
    expect(isBsuid('5534999951421')).toBe(false)
  })
  it('trata telefone com + como não-BSUID', () => {
    expect(isBsuid('+5534999951421')).toBe(false)
  })
  it('ignora espaços nas bordas', () => {
    expect(isBsuid('  BR.123ABC  ')).toBe(true)
  })
})

describe('buildRecipient', () => {
  it('telefone vai no campo to', () => {
    expect(buildRecipient('5534999951421')).toEqual({ to: '5534999951421' })
  })
  it('BSUID vai no campo recipient', () => {
    expect(buildRecipient('BR.13491208655302741918')).toEqual({
      recipient: 'BR.13491208655302741918',
    })
  })
  it('faz trim do identificador', () => {
    expect(buildRecipient('  BR.123ABC  ')).toEqual({ recipient: 'BR.123ABC' })
  })

  // O bug que custou 24,7% da base: a fila grava o número nacional (11 dígitos) e
  // enviávamos assim para a Meta. Ela falhava ao resolver o destinatário no DDD 34
  // ("Message undeliverable"), 100% das vezes. Os mesmos números COM o DDI entregam.
  it('prefixa o DDI 55 em celular nacional de 11 dígitos', () => {
    expect(buildRecipient('34991403703')).toEqual({ to: '5534991403703' })
  })
  it('prefixa o DDI 55 em número nacional de 10 dígitos', () => {
    expect(buildRecipient('3491403703')).toEqual({ to: '553491403703' })
  })
  it('não duplica o DDI quando o número já vem com 55', () => {
    expect(buildRecipient('5534991403703')).toEqual({ to: '5534991403703' })
  })
  it('não aplica normalização de telefone em BSUID', () => {
    expect(buildRecipient('BR.13491208655302741918')).toEqual({
      recipient: 'BR.13491208655302741918',
    })
  })
})
