import { describe, it, expect } from 'vitest'
import { validarOpcao, validarConfig } from './botLimites'

describe('validarOpcao', () => {
  it('aceita opcao dentro dos limites', () => {
    expect(validarOpcao({ titulo: 'Banho e Tosa', resposta: 'Fazemos banho e tosa.' })).toEqual([])
  })

  it('recusa titulo com mais de 20 caracteres', () => {
    const erros = validarOpcao({ titulo: 'Banho, Tosa e Hidratacao Completa', resposta: 'ok' })
    expect(erros).toHaveLength(1)
    expect(erros[0]).toContain('20')
  })

  it('recusa titulo vazio', () => {
    expect(validarOpcao({ titulo: '   ', resposta: 'ok' })).toContainEqual(
      expect.stringContaining('título')
    )
  })

  it('recusa resposta com mais de 1024 caracteres', () => {
    const erros = validarOpcao({ titulo: 'ok', resposta: 'x'.repeat(1025) })
    expect(erros).toContainEqual(expect.stringContaining('1024'))
  })

  it('acumula os dois erros de uma vez', () => {
    expect(validarOpcao({ titulo: 'x'.repeat(21), resposta: 'x'.repeat(1025) })).toHaveLength(2)
  })
})

describe('validarConfig', () => {
  it('aceita config valida', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: 'Agrozet', fecho: 'Já chamamos alguém.' })).toEqual([])
  })

  it('aceita rodape nulo', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: null, fecho: 'ok' })).toEqual([])
  })

  it('recusa rodape com mais de 60 caracteres', () => {
    expect(validarConfig({ saudacao: 'Olá!', rodape: 'x'.repeat(61), fecho: 'ok' }))
      .toContainEqual(expect.stringContaining('60'))
  })

  it('recusa saudacao vazia', () => {
    expect(validarConfig({ saudacao: '', rodape: null, fecho: 'ok' })).toHaveLength(1)
  })
})
