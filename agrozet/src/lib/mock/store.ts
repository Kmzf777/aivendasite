// Store em memória do modo mockup: o que fica no lugar do Supabase.
//
// POR QUE ESTE MÓDULO EXISTE: no modo mockup (`MODO_MOCK`, ver `./modo.ts`) o
// CRM roda inteiro sem banco. Os hooks de leitura passam a ler daqui e as
// escritas da tela (enviar mensagem, salvar cliente) mutam este estado. O
// efeito que importa para a demonstração é que a tela se comporta como o
// produto: responder uma conversa a tira da fila de pendentes, na hora.
//
// INVARIANTES QUE ESTE ARQUIVO SEGURA:
//
// 1. ZERO I/O. Nada de Supabase, `fetch`, `localStorage`, `process.env` (fora
//    de `./modo.ts`). Só memória.
//
// 2. NADA DE `window` NO ESCOPO DO MÓDULO. Este arquivo é importado tanto no
//    servidor (SSR do App Router) quanto no cliente. Tocar `window` na
//    avaliação do módulo quebraria o render do servidor.
//
// 3. A LISTA É DERIVADA POR `montarLista`, a MESMA função do produto — não uma
//    reimplementação da ordenação. É isso que garante que a fila de pendentes
//    do mockup se comporte igual à do CRM com banco. Se a regra de "pendente"
//    mudar, muda nos dois ao mesmo tempo.
//
// 4. O ESTADO SEMEADO É CÓPIA, nunca referência aos arrays de
//    `@/lib/demo/dados`. Se o store mutasse aqueles arrays, `reiniciar()`
//    reaplicaria o estado já corrompido — ou seja, não restauraria nada. O
//    teste `isolamento do seed` existe só para isso.
//
// 5. CADA ESTADO É POR PROCESSO, não por usuário. No servidor, o módulo é
//    compartilhado entre requisições; no browser, entre abas não. É aceitável
//    porque é um mockup de uma pessoa mostrando a tela, não um produto
//    multiusuário — e porque as escritas só vivem até o reload.
//
// `@/hooks/useMensagens` entra aqui como `import type`: o tipo é apagado na
// compilação, então o cliente Supabase daquele módulo nunca é carregado.

import type { BotConfig, BotOpcao } from '@/lib/bot'
import { BOT_CONFIG_DEMO, BOT_OPCOES_DEMO, CONVERSAS_DEMO } from '@/lib/demo/dados'
import type { MensagemTimeline } from '@/hooks/useMensagens'
import { montarLista, type ItemConversa } from '@/lib/listaConversas'

/** Uma linha de `clientes` como as telas do mockup a consomem. */
export type ClienteMock = {
  phone: string
  nome: string | null
  ultimo_servico: string | null
  observacoes: string | null
  primeiro_contato_at: string
  ultima_interacao_at: string
}

/** Uma linha de `pets`. O `id` é estável entre leituras (derivado do phone). */
export type PetMock = {
  id: string
  cliente_phone: string
  nome: string
  especie: string
  porte: string
  raca: string | null
}

/** Uma linha de `bot_opcoes` como a tela do bot a lista. */
export type OpcaoBotMock = { botao_id: string; titulo: string; ordem: number; ativo: boolean }

type Estado = {
  mensagens: MensagemTimeline[]
  clientes: ClienteMock[]
  pets: PetMock[]
  /** Guarda a `resposta` tambem: ver `lerOpcoesBotCompletas`. */
  opcoes: BotOpcao[]
  config: BotConfig
}

// ---------------------------------------------------------------------------
// Semeadura
// ---------------------------------------------------------------------------
// Clientes e pets são DERIVADOS de `CONVERSAS_DEMO`, não escritos à mão: é o
// mesmo motivo pelo qual `listaDemo()` monta a lista em vez de hardcodá-la —
// dois lugares com a mesma verdade divergem na primeira edição.

function semear(): Estado {
  const mensagens: MensagemTimeline[] = []
  const clientes: ClienteMock[] = []
  const pets: PetMock[] = []

  for (const c of CONVERSAS_DEMO) {
    // Cópia rasa de cada mensagem: os campos são todos primitivos, então o
    // objeto novo já basta para o store nunca escrever no array de dados.ts.
    for (const m of c.mensagens) mensagens.push({ ...m })

    const datas = c.mensagens.map((m) => m.created_at).sort()

    clientes.push({
      phone: c.phone,
      nome: c.nome,
      ultimo_servico: c.ultimoServico,
      // `observacoes` começa nulo porque `dados.ts` não tem o campo: o espaço
      // existe para a atendente digitar durante a demonstração.
      observacoes: null,
      primeiro_contato_at: datas[0] ?? new Date().toISOString(),
      ultima_interacao_at: datas[datas.length - 1] ?? new Date().toISOString(),
    })

    c.pets.forEach((p, i) => {
      // Id derivado de (phone, posição) em vez de contador global: não muda
      // entre um `reiniciar()` e outro, então uma `key` de React apoiada nele
      // não força remontagem da lista de pets a cada reinício.
      pets.push({ id: `pet-${c.phone}-${i + 1}`, cliente_phone: c.phone, ...p })
    })
  }

  return {
    mensagens,
    clientes,
    pets,
    opcoes: BOT_OPCOES_DEMO.map((o) => ({ ...o })),
    config: { ...BOT_CONFIG_DEMO },
  }
}

let estado: Estado = semear()

// ---------------------------------------------------------------------------
// Versão e assinatura
// ---------------------------------------------------------------------------
// `v` é um CONTADOR, e só a escrita o incrementa.
//
// POR QUE ISSO É CRÍTICO: `versao` é o `getSnapshot` de `useSyncExternalStore`.
// O React chama `getSnapshot` em cada render e compara o resultado com o
// anterior por `Object.is`. Se devolvesse algo novo a cada chamada — um
// `Date.now()`, um objeto, o array de conversas recém-mapeado — a comparação
// nunca bateria e o React renderizaria em loop infinito, com um aviso
// ("getSnapshot should be cached") no meio de uma demonstração de venda. Por
// isso as LEITURAS (que podem devolver array novo à vontade) são separadas do
// snapshot (que é um número).
//
// O MESMO `versao` serve de `getServerSnapshot`: no servidor o módulo é
// avaliado fresco, `v` vale 0 e nenhuma escrita acontece durante o render, logo
// o valor é estável e o SSR casa com a primeira hidratação.
let v = 0

const ouvintes = new Set<() => void>()

/** Assina as mudanças. Devolve a função que cancela a inscrição. */
export function subscribe(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/**
 * Muda a cada escrita, e SÓ a cada escrita. É o `getSnapshot` — e também o
 * `getServerSnapshot` — de `useSyncExternalStore`.
 */
export function versao(): number {
  return v
}

function notificar(): void {
  v += 1
  // Itera sobre uma cópia: um ouvinte que se desinscreve dentro do próprio
  // callback (o cleanup de um efeito do React faz isso) mutaria o Set em plena
  // iteração.
  for (const ouvinte of [...ouvintes]) ouvinte()
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------
// Todas síncronas e todas devolvendo estruturas NOVAS: quem recebe pode
// ordenar, cortar ou mutar sem alcançar o store. Devolver array novo não custa
// nada ao React aqui porque o snapshot é `versao()`, não o array.

/** A lista de conversas, derivada pela mesma `montarLista` do produto. */
export function lerConversas(): ItemConversa[] {
  return montarLista(estado.mensagens, estado.clientes)
}

/** A timeline de um telefone, em ordem cronológica. Sem telefone, vazio. */
export function lerMensagens(phone: string | null): MensagemTimeline[] {
  if (!phone) return []
  return estado.mensagens
    .filter((m) => m.phone === phone)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function lerClientes(): ClienteMock[] {
  return estado.clientes.map((c) => ({ ...c }))
}

export function lerCliente(phone: string | null): ClienteMock | null {
  if (!phone) return null
  const c = estado.clientes.find((x) => x.phone === phone)
  return c ? { ...c } : null
}

export function lerPets(phone: string | null): PetMock[] {
  if (!phone) return []
  return estado.pets.filter((p) => p.cliente_phone === phone).map((p) => ({ ...p }))
}

export function lerTodosPets(): PetMock[] {
  return estado.pets.map((p) => ({ ...p }))
}

/**
 * As opcoes como o CRM de PRODUCAO as le em `['bot-opcoes']`: quatro colunas,
 * SEM `resposta`.
 *
 * A projecao e deliberada. `ServicoChip` e `MessageBubble` so precisam mapear
 * `botao_id` -> `titulo`, e o cache de producao tem exatamente estas quatro
 * colunas. Devolver um objeto mais gordo aqui faria o mockup "funcionar por
 * sorte" com um shape que o produto nao entrega — e o dia em que alguem ligasse
 * o Supabase de verdade, a tela quebraria sem ninguem entender por que.
 */
export function lerOpcoesBot(): OpcaoBotMock[] {
  return estado.opcoes
    .map(({ botao_id, titulo, ordem, ativo }) => ({ botao_id, titulo, ordem, ativo }))
    .sort((a, b) => a.ordem - b.ordem)
}

/**
 * As opcoes COMPLETAS, com `resposta`. So a tela de admin do bot (`/bot`) usa:
 * ela edita o texto que o cliente recebe, entao precisa do campo que
 * `lerOpcoesBot` projeta fora de proposito.
 *
 * Existem duas funcoes em vez de uma gorda justamente para que o caminho que o
 * produto exercita (o chip da conversa) continue limitado ao que o banco
 * devolve naquela consulta.
 */
export function lerOpcoesBotCompletas(): BotOpcao[] {
  return estado.opcoes.map((o) => ({ ...o })).sort((a, b) => a.ordem - b.ordem)
}

export function lerConfigBot(): BotConfig {
  return { ...estado.config }
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

let seq = 0

/**
 * Grava uma mensagem nossa na conversa, como `/api/send-message` faria depois
 * de a Meta aceitar o envio.
 *
 * O efeito visível que importa na demonstração: a conversa SAI da fila de
 * pendentes, porque a última mensagem passa a ser `outbound` — e isso não é
 * calculado aqui, é consequência de `montarLista` ver a mensagem nova.
 *
 * Telefone desconhecido abre conversa nova (e cria o cliente), que é o que o
 * trigger `sync_cliente_from_message` faz no banco de verdade.
 */
export function enviarTexto(phone: string, texto: string): MensagemTimeline {
  seq += 1
  const agora = new Date().toISOString()

  const mensagem: MensagemTimeline = {
    id: `mock-${seq}`,
    message_id: `wamid.MOCK${seq}`,
    phone,
    direction: 'outbound',
    content: texto,
    message_type: 'text',
    media_path: null,
    media_mime: null,
    // 'sent' e não 'read': no mockup não existe webhook de status para
    // promover a mensagem. Mostrar "lida" sem ninguém ter lido ensinaria à
    // cliente um comportamento que o produto não tem.
    delivery_status: 'sent',
    created_at: agora,
  }

  estado.mensagens.push(mensagem)

  const cliente = estado.clientes.find((c) => c.phone === phone)
  if (cliente) cliente.ultima_interacao_at = agora
  else
    estado.clientes.push({
      phone,
      nome: null,
      ultimo_servico: null,
      observacoes: null,
      primeiro_contato_at: agora,
      ultima_interacao_at: agora,
    })

  notificar()
  return { ...mensagem }
}

/**
 * Salva o cadastro editável do cliente. Campo ausente no objeto NÃO é tocado —
 * `null` é um valor (limpar), `undefined` é "não mexe". É o que deixa a tela de
 * observações salvar sem reenviar o nome e vice-versa.
 */
export function salvarCliente(
  phone: string,
  dados: { nome?: string | null; observacoes?: string | null }
): void {
  const agora = new Date().toISOString()
  const cliente = estado.clientes.find((c) => c.phone === phone)

  if (cliente) {
    if ('nome' in dados) cliente.nome = dados.nome ?? null
    if ('observacoes' in dados) cliente.observacoes = dados.observacoes ?? null
  } else {
    estado.clientes.push({
      phone,
      nome: dados.nome ?? null,
      ultimo_servico: null,
      observacoes: dados.observacoes ?? null,
      primeiro_contato_at: agora,
      ultima_interacao_at: agora,
    })
  }

  notificar()
}

/**
 * Volta tudo ao estado semeado de `@/lib/demo/dados`. Serve ao botão de
 * reiniciar a demonstração e à isolação entre testes.
 *
 * Conta como escrita: notifica, para as telas abertas voltarem ao estado
 * inicial sem reload.
 */
export function reiniciar(): void {
  estado = semear()
  seq = 0
  notificar()
}
