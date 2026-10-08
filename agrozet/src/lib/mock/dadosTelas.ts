// Dados fictícios que existem SÓ para as telas de mockup `/disparos` e `/erros`,
// mais as respostas de exemplo do menu em `/bot`.
//
// Por que não moram no store (`src/lib/mock/store.ts`): o store representa o
// que o CRM realmente opera hoje — clientes, pets, mensagens, config do bot.
// `scheduled_disparos` e `operational_errors` NÃO são operados por nenhuma tela
// nem por nenhuma rota implementada: disparo é Fase 3 e ainda não existe nem no
// backend, e erro operacional só é escrito pelo servidor (via
// `logOperationalError`, que fala com o Supabase admin). Fabricar essas duas
// tabelas dentro do store daria a impressão de que o mock "roda" um fluxo que
// não existe. Aqui fica explícito: é maquete.
//
// TODAS as datas são relativas a `Date.now()`, nunca fixas — numa demonstração,
// uma fila com data de três meses atrás parece sistema abandonado.
//
// A base é ARREDONDADA PARA A HORA CHEIA de propósito: estas telas renderizam
// no servidor e hidratam no cliente alguns milissegundos depois. Com a base em
// `Date.now()` cru, o texto formatado poderia divergir entre os dois renders na
// virada do minuto e o React acusaria erro de hidratação. Arredondando, os dois
// lados concordam durante a hora inteira.

/** Instante base: início da hora corrente. */
function baseHora(): number {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

const MINUTO = 60_000

function iso(deslocamentoMinutos: number): string {
  return new Date(baseHora() + deslocamentoMinutos * MINUTO).toISOString()
}

// ── /disparos ──────────────────────────────────────────────────────────────

/** Espelha `scheduled_disparos.status` do spec. */
export type StatusDisparo = 'pending' | 'processing' | 'sent' | 'failed' | 'canceled'

/**
 * Uma linha da fila de disparo, com o nome do cliente já resolvido (na tela
 * real viria do join com `clientes`).
 */
export type DisparoMock = {
  id: string
  phone: string
  nome: string | null
  template_name: string
  template_lang: string
  scheduled_for: string
  status: StatusDisparo
  campaign_id: string
  /** Mensagem de falha da Meta; só preenchida em `failed`. */
  error: string | null
  attempts: number
}

/** Rótulo legível de uma campanha, para o botão "cancelar campanha". */
export const CAMPANHAS: Record<string, string> = {
  'lembrete-banho-out': 'Lembrete de banho',
  'promo-racao-out': 'Promoção de ração',
}

/**
 * Fila de exemplo. Dois assuntos que um pet shop de bairro realmente dispara:
 * lembrete de banho e tosa para quem não volta há um mês, e promoção de ração.
 * Inclui um `failed` e um `canceled` de propósito — uma fila só com `sent`
 * esconderia justamente as colunas que a tela existe para mostrar.
 */
export function disparosIniciais(): DisparoMock[] {
  return [
    {
      id: 'd1',
      phone: '5534991234567',
      nome: 'Lorrane Martins',
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(3 * 60),
      status: 'pending',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 0,
    },
    {
      id: 'd2',
      phone: '5534992345678',
      nome: 'Douglas Lima',
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(3 * 60),
      status: 'pending',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 0,
    },
    {
      id: 'd3',
      phone: '5534993456789',
      nome: null,
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(3 * 60),
      status: 'pending',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 0,
    },
    {
      id: 'd4',
      phone: '5534994567890',
      nome: 'Marina Prado',
      template_name: 'promo_racao',
      template_lang: 'pt_BR',
      scheduled_for: iso(26 * 60),
      status: 'pending',
      campaign_id: 'promo-racao-out',
      error: null,
      attempts: 0,
    },
    {
      id: 'd5',
      phone: '5534995678901',
      nome: 'Jorge Vilela',
      template_name: 'promo_racao',
      template_lang: 'pt_BR',
      scheduled_for: iso(26 * 60),
      status: 'canceled',
      campaign_id: 'promo-racao-out',
      error: null,
      attempts: 0,
    },
    {
      id: 'd6',
      phone: '5534996789012',
      nome: 'Camila Ferreira',
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(-5),
      status: 'processing',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 1,
    },
    {
      id: 'd7',
      phone: '5534997890123',
      nome: 'Rafael Borges',
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(-2 * 60),
      status: 'sent',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 1,
    },
    {
      id: 'd8',
      phone: '5534998901234',
      nome: 'Eneida Rocha',
      template_name: 'lembrete_banho',
      template_lang: 'pt_BR',
      scheduled_for: iso(-2 * 60),
      status: 'sent',
      campaign_id: 'lembrete-banho-out',
      error: null,
      attempts: 1,
    },
    {
      id: 'd9',
      phone: '5534999012345',
      nome: 'Patrícia Nunes',
      template_name: 'promo_racao',
      template_lang: 'pt_BR',
      scheduled_for: iso(-24 * 60 - 30),
      status: 'failed',
      campaign_id: 'promo-racao-out',
      error: '(132001) Template name does not exist in the translation',
      attempts: 3,
    },
  ]
}

// ── /erros ─────────────────────────────────────────────────────────────────

/** Espelha uma linha de `operational_errors`. */
export type ErroMock = {
  id: string
  created_at: string
  /** `modulo.funcao` — os valores abaixo são os que o código realmente usa. */
  origem: string
  mensagem: string
  contexto: Record<string, unknown> | null
}

/**
 * Erros de exemplo.
 *
 * As `origem` NÃO são inventadas: cada uma foi conferida com
 * `grep -rn "logOperationalError(" src/` e é uma string que o código de hoje
 * realmente passa como primeiro argumento (`webhook.*`, `send-message.*`,
 * `upload-media.*`, `mediaStorage.*`). Inventar origem aqui tornaria o filtro
 * da tela uma mentira: o dono filtraria por algo que nunca vai aparecer.
 */
export function errosIniciais(): ErroMock[] {
  return [
    {
      id: 'e1',
      created_at: iso(-18),
      origem: 'mediaStorage.midiaGrande',
      mensagem: 'midia de 9123884 bytes acima do teto de 5242880',
      contexto: {
        mediaId: '1284773119',
        messageId: 'wamid.HBgMNTUzNDk5MQjk2',
        mime: 'image/jpeg',
        tamanho: 9123884,
      },
    },
    {
      id: 'e2',
      created_at: iso(-47),
      origem: 'webhook.decidirBot',
      mensagem:
        'O menu tem 11 opções ativas e a lista aceita no máximo 10: as demais foram cortadas.',
      contexto: { phone: '5534991234567', acao: 'start' },
    },
    {
      id: 'e3',
      created_at: iso(-95),
      origem: 'send-message.meta',
      mensagem:
        '(131047) Re-engagement message: more than 24 hours have passed since the customer last replied',
      contexto: { phone: '5534993456789' },
    },
    {
      id: 'e4',
      created_at: iso(-3 * 60 - 12),
      origem: 'upload-media.comprimir',
      mensagem: 'Input buffer contains unsupported image format',
      contexto: { phone: '5534994567890' },
    },
    {
      id: 'e5',
      created_at: iso(-5 * 60 - 40),
      origem: 'webhook.statuses',
      mensagem: 'duplicate key value violates unique constraint "messages_message_id_key"',
      contexto: { messageId: 'wamid.HBgMNTUzNDk5Rjdm', status: 'delivered' },
    },
    {
      id: 'e6',
      created_at: iso(-8 * 60 - 5),
      origem: 'webhook.botConfig',
      mensagem: 'bot_config id=1 nao encontrada',
      contexto: { phone: '5534995678901' },
    },
    {
      id: 'e7',
      created_at: iso(-11 * 60),
      origem: 'webhook.enviar',
      mensagem: 'fetch failed: ETIMEDOUT graph.facebook.com',
      contexto: { phone: '5534996789012', tipo: 'interactive' },
    },
    {
      id: 'e8',
      created_at: iso(-25 * 60),
      origem: 'mediaStorage.armazenarMidia',
      mensagem: 'The resource already exists',
      contexto: { mediaId: '1099283771', messageId: 'wamid.HBgMNTUzNDk5Lk0x' },
    },
    {
      id: 'e9',
      created_at: iso(-27 * 60 - 20),
      origem: 'webhook.gravarInbound',
      mensagem: 'could not serialize access due to concurrent update',
      contexto: { phone: '5534997890123', tipo: 'text' },
    },
    {
      id: 'e10',
      created_at: iso(-30 * 60),
      origem: 'webhook.processarMensagem',
      mensagem: 'Cannot read properties of undefined (reading "id")',
      contexto: { messageId: 'wamid.HBgMNTUzNDk5UHA3' },
    },
    {
      id: 'e11',
      created_at: iso(-2 * 24 * 60 - 4 * 60),
      origem: 'upload-media.storage',
      mensagem: 'new row violates row-level security policy for table "objects"',
      contexto: { phone: '5534998901234' },
    },
    {
      id: 'e12',
      created_at: iso(-3 * 24 * 60 - 90),
      origem: 'webhook.POST',
      mensagem: 'Unexpected end of JSON input',
      contexto: null,
    },
  ]
}

// ── /bot ───────────────────────────────────────────────────────────────────
//
// Nada aqui. As opções do menu, COM a `resposta` que a tela edita, vêm de
// `lerOpcoesBotCompletas()` no store — que é a fonte de verdade e reflete
// edições feitas em memória. Uma cópia das respostas neste arquivo seria um
// segundo texto para o mesmo campo, e os dois divergiriam no primeiro ajuste.
