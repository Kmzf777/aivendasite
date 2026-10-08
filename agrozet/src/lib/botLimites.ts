// Limites de tamanho da WhatsApp Cloud API da Meta.
//
// Por que estes números existem e por que valem validação no nosso lado:
// não são preferência de UX nossa, são os limites reais que a Cloud API impõe
// ao título de um reply button, ao corpo de uma mensagem e ao rodapé. Estourar
// qualquer um deles NÃO devolve um erro amigável para o admin que digitou o
// texto grande demais — devolve uma mensagem NÃO ENTREGUE em runtime, horas
// depois, para um cliente que fica sem resposta nenhuma e sem saber por quê.
// Por isso validamos na porta de entrada (tela de configuração do bot), onde
// ainda existe um humano olhando para o campo que ele acabou de preencher.
//
// Este módulo é função pura: zero I/O, nenhum import de Supabase, `fetch`,
// `process.env` ou `next`. É o que permite cobrir tudo com teste e é o que o
// webhook executa no caminho crítico.

/** Título de reply button / item de lista: 20 caracteres na Cloud API. */
export const LIMITE_TITULO_BOTAO = 20
/** Corpo (body.text) de mensagem interativa: 1024 caracteres. */
export const LIMITE_CORPO = 1024
/** Rodapé (footer.text) de mensagem interativa: 60 caracteres. */
export const LIMITE_RODAPE = 60
/** A Meta recusa mais de 3 reply buttons — acima disso vira lista. */
export const MAX_REPLY_BUTTONS = 3
/** Uma section de list message aceita no máximo 10 rows. */
export const MAX_ITENS_LISTA = 10

/**
 * Valida uma opção do menu do bot. Devolve TODOS os erros de uma vez (array
 * vazio = válido), para a tela mostrar tudo em um único submit em vez de
 * fazer o admin descobrir um problema por vez.
 *
 * Campo obrigatório é medido com `.trim().length` (só espaço é vazio); teto é
 * medido com `.length` (espaço também conta para a Meta).
 */
export function validarOpcao(o: { titulo: string; resposta: string }): string[] {
  const erros: string[] = []

  if (o.titulo.trim().length === 0) {
    erros.push('O título do botão é obrigatório.')
  } else if (o.titulo.length > LIMITE_TITULO_BOTAO) {
    erros.push(
      `O título do botão deve ter no máximo ${LIMITE_TITULO_BOTAO} caracteres (tem ${o.titulo.length}).`
    )
  }

  if (o.resposta.trim().length === 0) {
    erros.push('A resposta da opção é obrigatória.')
  } else if (o.resposta.length > LIMITE_CORPO) {
    erros.push(
      `A resposta deve ter no máximo ${LIMITE_CORPO} caracteres (tem ${o.resposta.length}).`
    )
  }

  return erros
}

/**
 * Valida a configuração geral do bot. Mesma regra: acumula os erros.
 * `rodape` é opcional — `null` é válido e significa "sem rodapé".
 */
export function validarConfig(c: {
  saudacao: string
  rodape: string | null
  fecho: string
}): string[] {
  const erros: string[] = []

  if (c.saudacao.trim().length === 0) {
    erros.push('A saudação é obrigatória.')
  } else if (c.saudacao.length > LIMITE_CORPO) {
    erros.push(
      `A saudação deve ter no máximo ${LIMITE_CORPO} caracteres (tem ${c.saudacao.length}).`
    )
  }

  if (c.rodape !== null && c.rodape.length > LIMITE_RODAPE) {
    erros.push(
      `O rodapé deve ter no máximo ${LIMITE_RODAPE} caracteres (tem ${c.rodape.length}).`
    )
  }

  if (c.fecho.trim().length === 0) {
    erros.push('O texto de fecho é obrigatório.')
  } else if (c.fecho.length > LIMITE_CORPO) {
    erros.push(
      `O texto de fecho deve ter no máximo ${LIMITE_CORPO} caracteres (tem ${c.fecho.length}).`
    )
  }

  return erros
}
