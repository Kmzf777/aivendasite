// Chave única do modo mockup.
//
// POR QUE EXISTE: o CRM precisa rodar INTEIRO — conversas, clientes, bot,
// disparos — sem projeto Supabase e com o login desativado, para ser mostrado à
// dona do Pet Shop Agrozet. Em vez de uma vitrine ao lado do produto, é o
// produto rodando sobre o store em memória de `./store`.
//
// POR QUE UMA CONSTANTE, E NÃO UMA FUNÇÃO: com o prefixo `NEXT_PUBLIC_` o
// Next.js inlina o valor no bundle em tempo de build. Lido como constante de
// módulo, o `false` do modo normal vira literal e o código do mockup sai do
// bundle de produção por dead-code elimination. Uma função `estaMock()` leria
// `process.env` em runtime e carregaria o mockup junto com o produto.
//
// DESLIGADO POR PADRÃO, de propósito: env var esquecida não pode transformar o
// CRM real num mockup — nem, mais grave, desativar a autenticação. Só o literal
// '1' liga.

/** true quando `NEXT_PUBLIC_MOCK === '1'`. Desligado por padrão. */
export const MODO_MOCK: boolean = process.env.NEXT_PUBLIC_MOCK === '1'
