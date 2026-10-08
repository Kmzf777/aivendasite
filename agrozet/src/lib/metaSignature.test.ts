import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyMetaSignature } from './metaSignature'

const secret = 'app-secret-123'
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
const validSig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

describe('verifyMetaSignature', () => {
  it('aceita assinatura valida', () => {
    expect(verifyMetaSignature(body, validSig, secret)).toBe(true)
  })

  it('rejeita assinatura invalida', () => {
    const wrong = 'sha256=' + createHmac('sha256', 'outro-secret').update(body).digest('hex')
    expect(verifyMetaSignature(body, wrong, secret)).toBe(false)
  })

  it('rejeita header ausente', () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false)
  })

  it('rejeita header sem prefixo sha256=', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyMetaSignature(body, hex, secret)).toBe(false)
  })

  it('rejeita quando o corpo foi adulterado', () => {
    expect(verifyMetaSignature(body + ' ', validSig, secret)).toBe(false)
  })

  it('rejeita assinatura de tamanho diferente sem lancar', () => {
    expect(verifyMetaSignature(body, 'sha256=abcd', secret)).toBe(false)
  })

  it('rejeita hex malformado sem lancar', () => {
    expect(verifyMetaSignature(body, 'sha256=zzzz', secret)).toBe(false)
  })

  it('rejeita app secret vazio', () => {
    expect(verifyMetaSignature(body, validSig, '')).toBe(false)
  })
})
