export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}


// Padroniza um número brasileiro adicionando o DDI 55 quando ausente.
// 10 dígitos (DDD + 8) ou 11 dígitos (DDD + 9º + 8) → recebem o prefixo 55.
// Qualquer outro formato é mantido (já tem DDI 55, é internacional, etc.),
// para não quebrar números que já chegam corretos do frontend/importação.
export function toBrazilPhone(phone: string): string {
  const clean = normalizePhone(phone)
  if (clean.length === 10 || clean.length === 11) {
    return '55' + clean
  }
  return clean
}

// Forma canônica de comparação: DDD + 9º dígito + assinante (11 dígitos), sem DDI.
// Espelha exatamente a função `tel_norm11(text)` do Postgres — as duas precisam
// concordar, senão a fila (11 dígitos), o disparo e o webhook (wa_id com DDI, às
// vezes sem o 9º dígito) deixam de casar e a conversa racha em dois cards.
//
// Retorna null quando o número não é um celular brasileiro reconhecível. Fixo
// (assinante começando em 2-5) NUNCA ganha um 9º dígito fabricado: isso criaria
// um celular inexistente, capaz de colidir com o lead de outro contato.
export function telNorm11(phone: string | null | undefined): string | null {
  const clean = normalizePhone(phone ?? '')
  const national =
    clean.startsWith('55') && (clean.length === 12 || clean.length === 13) ? clean.slice(2) : clean

  if (national.length === 11) return national
  if (national.length === 10 && /^[6-9]/.test(national.slice(2))) {
    return national.slice(0, 2) + '9' + national.slice(2)
  }
  return null
}

// Gera todas as formatações plausíveis de um número brasileiro para que o
// lookup no banco encontre o lead independentemente de como foi gravado:
//   - com e sem o DDI 55
//   - com e sem o 9º dígito do celular
// Ex.: "553499951421" e "3499951421" e "5534999951421" e "34999951421"
// referem-se ao mesmo contato.
export function getPhoneVariants(phone: string): string[] {
  const clean = normalizePhone(phone)
  const variants = new Set<string>([clean])

  // Remove o DDI 55 (quando presente) para isolar o número nacional (DDD + assinante).
  let national = clean
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) {
    national = national.slice(2)
  }

  // national deve ser DDD(2) + assinante(8 ou 9 dígitos).
  if (national.length === 10 || national.length === 11) {
    const ddd = national.slice(0, 2)
    const subscriber = national.slice(2)

    // Decide quais bases nacionais (DDD + assinante) representam o mesmo contato.
    // O 9º dígito SÓ existe em celulares — telefones fixos têm 8 dígitos e o
    // assinante começa em 2-5. Fabricar um "9º dígito" para um fixo criaria um
    // número de celular inexistente e poderia casar com o lead de OUTRO contato.
    let bases: string[]
    if (subscriber.length === 9 && subscriber.startsWith('9')) {
      // Celular com 9º dígito → também registra a base de 8 dígitos (legado).
      const base8 = subscriber.slice(1)
      bases = [ddd + base8, ddd + '9' + base8]
    } else if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) {
      // Celular legado de 8 dígitos (assinante começa em 6-9) → também a versão com 9º dígito.
      bases = [ddd + subscriber, ddd + '9' + subscriber]
    } else {
      // Telefone fixo (8 díg. começando em 2-5) ou qualquer outro → mantém só o próprio número.
      bases = [ddd + subscriber]
    }

    for (const n of bases) {
      variants.add(n)
      variants.add('55' + n)
    }
  }

  return [...variants]
}
