// Dados fake do modo demo. NADA aqui toca Supabase, Meta ou rede.
//
// POR QUE ESTE MÓDULO EXISTE: o CRM precisa ser mostrado à dona do Pet Shop
// Agrozet antes de existir projeto Supabase, app na Meta ou número aprovado.
// Em vez de screenshots estáticos, o demo roda os MESMOS componentes e a MESMA
// lógica de bot do produto, só com este módulo no lugar do banco.
//
// COMO ISTO ENTRA NO APP: só através de `src/lib/mock/store.ts`, e só quando
// `MODO_MOCK` (`NEXT_PUBLIC_MOCK=1`) está ligado. Nada aqui escreve em lugar
// nenhum e nada aqui é alcançado com a flag desligada — nesse caso o `false`
// é literal em build e este módulo sai do bundle por dead-code elimination.
//
// Os telefones são da faixa 5534 (Uberlândia) com o prefixo 9999, reservado
// para ficção. Os nomes e pets são inventados.

import type { BotConfig, BotOpcao } from '@/lib/bot'
import type { ItemConversa } from '@/lib/listaConversas'
import type { MensagemTimeline } from '@/hooks/useMensagens'

/**
 * Espelha o seed da migration (`bot_config` id=1). Se o seed mudar, mude aqui —
 * o demo mostrar um menu diferente do que o bot real manda é pior que não ter
 * demo, porque cria expectativa errada na cliente.
 */
export const BOT_CONFIG_DEMO: BotConfig = {
  ativo: true,
  saudacao: 'Olá! Bem-vindo ao Pet Shop Agrozet. Em que podemos ajudar hoje?',
  rodape: 'Pet Shop Agrozet - Segismundo Pereira, Uberlândia',
  fecho: 'Perfeito! Em instantes um de nossos atendentes vai te responder por aqui.',
}

/** Espelha o seed de `bot_opcoes`. Três opções ativas ⇒ reply buttons. */
export const BOT_OPCOES_DEMO: BotOpcao[] = [
  {
    ordem: 1,
    botao_id: 'banho_tosa',
    titulo: 'Banho e Tosa',
    resposta:
      'Trabalhamos com banho, tosa higiênica e tosa na máquina, para todos os portes. Atendemos de segunda a sábado, com hora marcada.',
    ativo: true,
  },
  {
    ordem: 2,
    botao_id: 'racoes',
    titulo: 'Rações e Produtos',
    resposta:
      'Temos rações das principais marcas, petiscos, brinquedos, coleiras e acessórios. Também fazemos entrega no bairro.',
    ativo: true,
  },
  {
    ordem: 3,
    botao_id: 'atendente',
    titulo: 'Falar com atendente',
    resposta: 'Claro! Já estou te encaminhando.',
    ativo: true,
  },
]

/** Título legível a partir do `botao_id`, para semear o cache do `ServicoChip`. */
export const TITULOS_SERVICO: Record<string, string> = Object.fromEntries(
  BOT_OPCOES_DEMO.map((o) => [o.botao_id, o.titulo])
)

// ---------------------------------------------------------------------------
// Relógio do demo
// ---------------------------------------------------------------------------
// Os horários são RELATIVOS ao momento em que a página abre, não fixos. Uma
// conversa datada de "02/10" numa demo vista em dezembro parece sistema
// abandonado; "14:32, hoje" parece sistema vivo. É a diferença entre a cliente
// pensar "isso está rodando" e "isso é uma maquete".
//
// A BASE e capturada UMA vez, nao a cada chamada. Com `Date.now()` por mensagem,
// duas falas seguidas do mesmo minuto caiam no MESMO milissegundo e os
// `created_at` empatavam — e empate quebra a lista de verdade: `montarLista`
// escolhe a ultima mensagem por `created_at`, o desempate fica com a primeira do
// array (a inbound), e a conversa aparece como PENDENTE mesmo tendo sido
// respondida. Foi visto na tela: Claudia e Patricia, que terminam com a nossa
// resposta, apareciam com o ponto laranja e com a pergunta do cliente na previa.
const BASE = Date.now()
const minAtras = (m: number) => new Date(BASE - m * 60_000).toISOString()
const hAtras = (h: number) => minAtras(h * 60)
const dAtras = (d: number) => hAtras(d * 24)

/**
 * Forca os `created_at` de uma conversa a crescerem estritamente, na ORDEM DO
 * ARRAY — que e a ordem em que a conversa foi escrita, logo a ordem real dos
 * fatos.
 *
 * Isto existe para que os horarios possam continuar sendo escritos de forma
 * legivel (`hAtras(5)` quatro vezes seguidas, porque tudo aconteceu "ha cinco
 * horas") sem que o empate volte a inverter quem falou por ultimo. Escrever 40
 * timestamps a mao, estritamente decrescentes, seria fragil: bastaria alguem
 * inserir uma fala no meio para reintroduzir o bug em silencio.
 */
function ordenarNoTempo(msgs: MensagemTimeline[]): MensagemTimeline[] {
  let anterior = 0
  return msgs.map((m) => {
    const t = Math.max(new Date(m.created_at).getTime(), anterior + 1000)
    anterior = t
    return { ...m, created_at: new Date(t).toISOString() }
  })
}

export type ConversaDemo = {
  phone: string
  nome: string | null
  ultimoServico: string | null
  pets: { nome: string; especie: string; porte: string; raca: string | null }[]
  mensagens: MensagemTimeline[]
}

let seq = 0
function msg(
  phone: string,
  direction: 'inbound' | 'outbound',
  content: string | null,
  created_at: string,
  extra: Partial<MensagemTimeline> = {}
): MensagemTimeline {
  seq += 1
  return {
    id: `demo-${seq}`,
    message_id: `wamid.DEMO${seq}`,
    phone,
    direction,
    content,
    message_type: 'text',
    media_path: null,
    media_mime: null,
    delivery_status: direction === 'outbound' ? 'read' : null,
    created_at,
    ...extra,
  }
}

/** O menu como o bot o grava em `content` (corpo + títulos como linhas). */
function corpoDoMenu(): string {
  return [
    BOT_CONFIG_DEMO.saudacao,
    '',
    ...BOT_OPCOES_DEMO.filter((o) => o.ativo).map((o) => `• ${o.titulo}`),
  ].join('\n')
}

/**
 * Seis conversas que cobrem, de propósito, os estados que a tela sabe mostrar:
 * pendente e respondida, com e sem etiqueta de serviço, cliente cadastrado e
 * anônimo, fluxo de bot completo, foto recebida, e uma que ignorou o menu e
 * digitou (o caminho `remenu` → `giveup`).
 */
export const CONVERSAS_DEMO: ConversaDemo[] = [
  // 1. Pendente, acabou de escolher no menu: o caso mais comum do dia a dia.
  {
    phone: '5534999910001',
    nome: 'Juliana Prado',
    ultimoServico: 'banho_tosa',
    pets: [{ nome: 'Thor', especie: 'Cão', porte: 'Grande', raca: 'Golden Retriever' }],
    mensagens: [
      msg('5534999910001', 'inbound', 'oi, boa tarde', minAtras(14)),
      msg('5534999910001', 'outbound', corpoDoMenu(), minAtras(14), {
        message_type: 'interactive',
        delivery_status: 'read',
      }),
      msg('5534999910001', 'inbound', 'Banho e Tosa', minAtras(12), {
        message_type: 'interactive',
      }),
      msg(
        '5534999910001',
        'outbound',
        `${BOT_OPCOES_DEMO[0].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`,
        minAtras(12)
      ),
      msg(
        '5534999910001',
        'inbound',
        'perfeito! consigo levar o Thor sábado de manhã? ele é golden, porte grande',
        minAtras(4)
      ),
    ],
  },

  // 2. Pendente com foto: exercita o balão de mídia e o rótulo "Foto" na lista.
  {
    phone: '5534999910002',
    nome: 'Marcos Vinícius',
    ultimoServico: 'banho_tosa',
    pets: [{ nome: 'Mel', especie: 'Cão', porte: 'Pequeno', raca: 'Shih Tzu' }],
    mensagens: [
      msg('5534999910002', 'inbound', 'bom dia', hAtras(2)),
      msg('5534999910002', 'outbound', corpoDoMenu(), hAtras(2), {
        message_type: 'interactive',
      }),
      msg('5534999910002', 'inbound', 'Banho e Tosa', hAtras(2), {
        message_type: 'interactive',
      }),
      msg(
        '5534999910002',
        'outbound',
        `${BOT_OPCOES_DEMO[0].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`,
        hAtras(2)
      ),
      // DE PROPÓSITO uma mensagem de TEXTO, e não `message_type: 'image'`.
      //
      // O balão de imagem de `MessageBubble` pede a URL assinada a
      // `/api/media-url`, que exige sessão e devolve 401 no demo — a cliente
      // veria "não foi possível carregar a imagem". Um erro visível numa demo
      // de venda é pior que não ter a foto. E `media_path: null` seria pior
      // ainda: renderiza "mídia expirada", que parece bug em vez de ausência.
      //
      // As alternativas que NÃO tomei, e por quê: abrir um ramo em
      // `/api/media-url` para servir asset público com prefixo `demo-` faria
      // um furo na autenticação que acabei de documentar como "a única defesa"
      // — não vale um balão. Quando o Supabase existir, a tela mostra foto de
      // verdade e isto deixa de ser necessário.
      msg('5534999910002', 'inbound', 'mandei a foto do corte que eu queria no particular', minAtras(38)),
      msg('5534999910002', 'inbound', 'dá pra fazer esse na Mel?', minAtras(37)),
    ],
  },

  // 3. Respondida pela atendente: mostra que "pendente" sai da frente da fila.
  {
    phone: '5534999910003',
    nome: 'Cláudia Ribeiro',
    ultimoServico: 'racoes',
    pets: [
      { nome: 'Nina', especie: 'Gata', porte: 'Pequeno', raca: 'SRD' },
      { nome: 'Pingo', especie: 'Gato', porte: 'Pequeno', raca: 'SRD' },
    ],
    mensagens: [
      msg('5534999910003', 'inbound', 'oi', hAtras(5)),
      msg('5534999910003', 'outbound', corpoDoMenu(), hAtras(5), {
        message_type: 'interactive',
      }),
      msg('5534999910003', 'inbound', 'Rações e Produtos', hAtras(5), {
        message_type: 'interactive',
      }),
      msg(
        '5534999910003',
        'outbound',
        `${BOT_OPCOES_DEMO[1].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`,
        hAtras(5)
      ),
      msg('5534999910003', 'inbound', 'vocês têm ração de gato castrado, saco de 10kg?', hAtras(4)),
      msg(
        '5534999910003',
        'outbound',
        'Temos sim, Cláudia! Golden Gatos Castrados 10kg está R$ 189,90. Quer que eu separe e mande entregar aí no Segismundo?',
        hAtras(4)
      ),
    ],
  },

  // 4. Cliente anônimo (sem cadastro): a lista tem de mostrar o telefone
  // formatado e nenhum chip, sem quebrar.
  {
    phone: '5534999910004',
    nome: null,
    ultimoServico: 'atendente',
    pets: [],
    mensagens: [
      msg('5534999910004', 'inbound', 'boa noite', hAtras(21)),
      msg('5534999910004', 'outbound', corpoDoMenu(), hAtras(21), {
        message_type: 'interactive',
      }),
      msg('5534999910004', 'inbound', 'Falar com atendente', hAtras(21), {
        message_type: 'interactive',
      }),
      msg(
        '5534999910004',
        'outbound',
        `${BOT_OPCOES_DEMO[2].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`,
        hAtras(21)
      ),
      msg('5534999910004', 'inbound', 'vocês abrem domingo?', hAtras(20)),
      msg(
        '5534999910004',
        'outbound',
        'Oi! No domingo não abrimos. Funcionamos de segunda a sábado, das 8h às 18h.',
        hAtras(20)
      ),
    ],
  },

  // 5. Quem ignorou o menu e digitou: `remenu` e depois `giveup` (silêncio).
  // Prova que o bot não insiste para sempre — ele entrega ao humano.
  {
    phone: '5534999910005',
    nome: 'Edson Tavares',
    ultimoServico: null,
    pets: [{ nome: 'Rex', especie: 'Cão', porte: 'Médio', raca: 'Pastor' }],
    mensagens: [
      msg('5534999910005', 'inbound', 'quanto custa vacina v10', dAtras(1)),
      msg('5534999910005', 'outbound', corpoDoMenu(), dAtras(1), {
        message_type: 'interactive',
      }),
      msg('5534999910005', 'inbound', 'só quero saber o preço da vacina', dAtras(1)),
      msg('5534999910005', 'outbound', corpoDoMenu(), dAtras(1), {
        message_type: 'interactive',
      }),
      msg('5534999910005', 'inbound', 'é v10 pro meu cachorro', dAtras(1)),
      msg(
        '5534999910005',
        'outbound',
        'Oi Edson! A V10 sai por R$ 90 com aplicação. Pode trazer o Rex sem agendar, de segunda a sexta.',
        hAtras(22)
      ),
    ],
  },

  // 6. Conversa antiga e resolvida: dá profundidade à lista e exercita o
  // rótulo de data ("ontem" / data curta) em vez de hora.
  {
    phone: '5534999910006',
    nome: 'Patrícia Lemos',
    ultimoServico: 'racoes',
    pets: [{ nome: 'Amora', especie: 'Cadela', porte: 'Pequeno', raca: 'Poodle' }],
    mensagens: [
      msg('5534999910006', 'inbound', 'oi, vocês entregam ração no Santa Mônica?', dAtras(3)),
      msg('5534999910006', 'outbound', corpoDoMenu(), dAtras(3), {
        message_type: 'interactive',
      }),
      msg('5534999910006', 'inbound', 'Rações e Produtos', dAtras(3), {
        message_type: 'interactive',
      }),
      msg(
        '5534999910006',
        'outbound',
        `${BOT_OPCOES_DEMO[1].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`,
        dAtras(3)
      ),
      msg(
        '5534999910006',
        'outbound',
        'No Santa Mônica entregamos sim, Patrícia! Pedido acima de R$ 120 a entrega é por nossa conta.',
        dAtras(3)
      ),
      msg('5534999910006', 'inbound', 'fechado, obrigada!', dAtras(3)),
      msg('5534999910006', 'outbound', 'Nós que agradecemos! 🐾', dAtras(3)),
    ],
  },
]

// Aplica a monotonicidade a TODAS as conversas, uma vez, na carga do modulo.
// Feito aqui e nao em cada `msg(...)` de proposito: a regra depende da sequencia
// inteira, nao de uma mensagem isolada.
for (const c of CONVERSAS_DEMO) {
  c.mensagens = ordenarNoTempo(c.mensagens)
}

/** Todas as mensagens do demo, achatadas. */
export function mensagensDemo(): MensagemTimeline[] {
  return CONVERSAS_DEMO.flatMap((c) => c.mensagens)
}

/** A conversa aberta, por telefone. */
export function mensagensDaConversa(phone: string | null): MensagemTimeline[] {
  if (!phone) return []
  return CONVERSAS_DEMO.find((c) => c.phone === phone)?.mensagens ?? []
}

/**
 * A lista pronta, já ordenada como `montarLista` ordena (pendentes primeiro,
 * depois mais recentes). Monta a partir das mesmas mensagens, em vez de
 * hardcodar a ordem — assim a lista do demo não pode divergir das conversas.
 */
export function listaDemo(): ItemConversa[] {
  const ROTULO: Record<string, string> = {
    image: 'Foto',
    audio: 'Áudio',
    document: 'Documento',
    video: 'Vídeo',
  }

  return CONVERSAS_DEMO.map((c) => {
    const ultima = c.mensagens.reduce((a, b) => (a.created_at >= b.created_at ? a : b))
    return {
      phone: c.phone,
      nome: c.nome,
      ultimoServico: c.ultimoServico,
      ultimaMensagem: ultima.content?.trim() || (ROTULO[ultima.message_type] ?? ''),
      ultimaEm: ultima.created_at,
      pendente: ultima.direction === 'inbound',
    }
  }).sort((a, b) => {
    if (a.pendente !== b.pendente) return a.pendente ? -1 : 1
    return b.ultimaEm.localeCompare(a.ultimaEm)
  })
}

/** Pets por telefone, para o painel de contexto do atendente. */
export function petsDoCliente(phone: string | null) {
  if (!phone) return []
  return CONVERSAS_DEMO.find((c) => c.phone === phone)?.pets ?? []
}

/** Números para os cartões de resumo do showcase. Derivados, nunca inventados. */
export function numerosDemo() {
  const lista = listaDemo()
  const todas = mensagensDemo()
  return {
    conversas: lista.length,
    pendentes: lista.filter((c) => c.pendente).length,
    mensagens: todas.length,
    atendidasPeloBot: todas.filter((m) => m.message_type === 'interactive' && m.direction === 'outbound')
      .length,
    clientesCadastrados: CONVERSAS_DEMO.filter((c) => c.nome !== null).length,
    pets: CONVERSAS_DEMO.reduce((n, c) => n + c.pets.length, 0),
  }
}
