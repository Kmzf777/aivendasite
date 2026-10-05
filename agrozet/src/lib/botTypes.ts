// Estes dois tipos moram num arquivo próprio — e não em `bot.ts` — porque
// `bot.ts` e `metaApi.ts` são escritos por DOIS AGENTES DIFERENTES na mesma
// onda. Se `BotMenu` morasse em `bot.ts`, o agente do `metaApi.ts` importaria
// um arquivo que o outro agente ainda está escrevendo: o import quebraria no
// meio da onda e os dois lados tenderiam a "resolver" redefinindo o tipo cada
// um do seu lado. Aqui o contrato é escrito uma vez, antes dos dois, e os dois
// apenas importam. NINGUÉM redefine `BotMenu` — nem como cópia local, nem como
// interface "equivalente".

export type BotStage = 'awaiting_choice' | 'done'

/** Menu pronto para a Meta: `button` até 3 opções, `list` de 4 a 10. */
export type BotMenu =
  | { formato: 'button'; corpo: string; rodape: string | null; botoes: { id: string; titulo: string }[] }
  | { formato: 'list'; corpo: string; rodape: string | null; rotulo: string; itens: { id: string; titulo: string }[] }
