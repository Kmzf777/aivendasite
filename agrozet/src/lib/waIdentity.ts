import { toBrazilPhone } from './phoneUtils'

// Um BSUID tem o formato "<ISO-3166 alpha-2>.<alfanumérico>", ex.: "BR.13491208655302741918".
// O BSUID principal insere "ENT.", ex.: "BR.ENT.11815799212886844830" — não usamos BSUIDs
// principais, mas precisamos reconhecê-los como NÃO-telefone para nunca passá-los pela
// normalização de telefone brasileiro. Telefones são só dígitos (com + opcional), então
// nunca casam com este padrão.
const BSUID_RE = /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]+$/

export function isBsuid(id: string): boolean {
  return BSUID_RE.test(id.trim())
}

// Monta o campo de destinatário da API de Mensagens da Meta: telefone vai em `to`,
// BSUID vai em `recipient`. Nunca enviamos os dois (se ambos viessem, `to` teria
// precedência pela doc — evitamos a ambiguidade escolhendo um).
//
// O telefone SEMPRE sai com o DDI 55. Enviar o número nacional cru (11 dígitos)
// fazia a Meta falhar ao resolver o destinatário em parte dos DDDs — no DDD 34 ela
// errava 100% das vezes ("Message undeliverable"), e o 34 é 24,7% da nossa base.
// Reenviar os MESMOS números com o DDI entregou 12 de 17 (A/B em 2026-07-13).
// `toBrazilPhone` é no-op quando o número já vem com DDI: só prefixa 10 ou 11 dígitos.
export function buildRecipient(id: string): { to: string } | { recipient: string } {
  const clean = id.trim()
  return isBsuid(clean) ? { recipient: clean } : { to: toBrazilPhone(clean) }
}
