// Montagem da lista de conversas: puro, zero I/O, zero Supabase.
//
// Por que derivar a lista no cliente em vez de pedir uma view/agregação ao
// banco: a Fase 1 tem UM número de WhatsApp e TODOS os atendentes veem TODAS as
// conversas. Não existe "lida por quem" — logo não existe `conversation_reads`,
// contador de não-lidas por usuário nem `last_message_time` materializado.
// "Pendente" é derivado de uma pergunta só: a última mensagem é do cliente?
//
// Os parâmetros são tipados com o MÍNIMO de colunas que esta função lê (não
// `Tables<'messages'>` inteira). Isso é de propósito: deixa a função testável
// sem fabricar linha completa, e — mais importante — deixa `useConversas`
// selecionar um subconjunto estreito de colunas no PostgREST sem brigar com o
// compilador. Em especial `media_path` NUNCA é lido aqui.

/** O mínimo que a lista precisa de uma linha de `messages`. */
export type MensagemLista = {
  phone: string
  direction: string
  created_at: string
  content: string | null
  message_type: string
}

/** O mínimo que a lista precisa de uma linha de `clientes`. */
export type ClienteLista = {
  phone: string
  nome: string | null
  ultimo_servico: string | null
}

export type ItemConversa = {
  phone: string
  /** Nome do cadastro, ou `null` quando o cliente ainda não existe em `clientes`. */
  nome: string | null
  /** `bot_opcoes.botao_id` escolhido no menu do bot — a etiqueta de assunto. */
  ultimoServico: string | null
  /** Prévia já legível: legenda, ou o rótulo da mídia. Nunca um caminho de storage. */
  ultimaMensagem: string
  /** ISO do `created_at` da mensagem mais recente da conversa. */
  ultimaEm: string
  /** A última mensagem é do cliente, ou seja: está esperando resposta. */
  pendente: boolean
}

// Rótulo exibido quando a mídia não tem legenda. A lista nunca busca a imagem
// (o free tier do Supabase tem 5 GB/mês de egress) e nunca mostra o
// `media_path`, que é caminho interno de storage e não diz nada ao atendente.
const ROTULO_MIDIA: Record<string, string> = {
  image: 'Foto',
  audio: 'Áudio',
  document: 'Documento',
  video: 'Vídeo',
}

function previa(m: MensagemLista): string {
  const texto = m.content?.trim()
  if (texto) return texto
  return ROTULO_MIDIA[m.message_type] ?? ''
}

function maisRecente(mensagens: MensagemLista[]): MensagemLista | null {
  let eleita: MensagemLista | null = null
  let eleitaEm = -Infinity
  for (const m of mensagens) {
    // A ordem do array não é confiável (o PostgREST pode devolver qualquer
    // ordem, e o teste explicitamente embaralha): quem decide é o timestamp.
    const t = new Date(m.created_at).getTime()
    if (t > eleitaEm) {
      eleitaEm = t
      eleita = m
    }
  }
  return eleita
}

/**
 * Conversa esperando resposta: a mensagem de maior `created_at` é `inbound`.
 * Conversa vazia não é pendente.
 */
export function estaPendente(mensagens: MensagemLista[]): boolean {
  return maisRecente(mensagens)?.direction === 'inbound'
}

/**
 * Agrupa as mensagens por telefone, junta com o cadastro de `clientes` (pelo
 * `phone`) e ordena por `(pendente desc, ultimaEm desc)`: quem espera resposta
 * primeiro, e dentro de cada bloco o mais recente no topo.
 *
 * Cliente sem cadastro continua na lista com `nome: null` — o trigger
 * `sync_cliente_from_message` cria a linha, mas a lista não pode depender de
 * ele já ter rodado.
 */
export function montarLista(
  mensagens: MensagemLista[],
  clientes: ClienteLista[]
): ItemConversa[] {
  const porTelefone = new Map<string, MensagemLista[]>()
  for (const m of mensagens) {
    const atual = porTelefone.get(m.phone)
    if (atual) atual.push(m)
    else porTelefone.set(m.phone, [m])
  }

  const cadastro = new Map<string, ClienteLista>()
  for (const c of clientes) cadastro.set(c.phone, c)

  const itens: ItemConversa[] = []
  for (const [phone, msgs] of porTelefone) {
    const ultima = maisRecente(msgs)
    if (!ultima) continue
    const cliente = cadastro.get(phone)
    itens.push({
      phone,
      nome: cliente?.nome ?? null,
      ultimoServico: cliente?.ultimo_servico ?? null,
      ultimaMensagem: previa(ultima),
      ultimaEm: ultima.created_at,
      pendente: ultima.direction === 'inbound',
    })
  }

  return itens.sort((a, b) => {
    if (a.pendente !== b.pendente) return a.pendente ? -1 : 1
    return new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime()
  })
}

// Formatação de exibição do telefone. Mora aqui (e não dentro de um
// componente) porque a lista e o cabeçalho do chat precisam da MESMA forma:
// se divergirem, o atendente vê dois números diferentes para a mesma pessoa.
// Puro, como o resto do arquivo. Número que não bate com celular/fixo
// brasileiro volta inalterado — melhor mostrar o cru do que inventar máscara.
export function formatarTelefoneBr(phone: string): string {
  const d = phone.replace(/\D/g, '')
  const nacional = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`
  }
  return phone
}
