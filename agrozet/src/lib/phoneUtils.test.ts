import { describe, expect, it } from 'vitest'
import { telNorm11 } from './phoneUtils'

describe('telNorm11 — deve espelhar tel_norm11(text) do Postgres', () => {
  it('converge todas as formas do mesmo celular', () => {
    // Caso real do canário: Vilssom. wa_id da Meta vem sem o 9º dígito.
    expect(telNorm11('553791235196')).toBe('37991235196') // wa_id (inbound)
    expect(telNorm11('37991235196')).toBe('37991235196') // fila (11 dígitos)
    expect(telNorm11('5537991235196')).toBe('37991235196') // com DDI e 9
    expect(telNorm11('3791235196')).toBe('37991235196') // nacional sem 9
    expect(telNorm11('+55 (37) 99123-5196')).toBe('37991235196') // formatado
  })

  it('não fabrica 9º dígito para telefone fixo', () => {
    expect(telNorm11('553432451234')).toBeNull() // fixo com DDI
    expect(telNorm11('3432451234')).toBeNull() // fixo nacional
  })

  it('rejeita o que não é celular brasileiro reconhecível', () => {
    expect(telNorm11('')).toBeNull()
    expect(telNorm11(null)).toBeNull()
    expect(telNorm11('123')).toBeNull()
    expect(telNorm11('12345678901234')).toBeNull()
  })
})
