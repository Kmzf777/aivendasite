'use client'

import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArrowLeft, MessageSquare, PanelRight } from 'lucide-react'
import ChatHeader from '@/components/conversations/ChatHeader'
import ConversationList from '@/components/conversations/ConversationList'
import MessageTimeline from '@/components/conversations/MessageTimeline'
import type { OpcaoBot } from '@/components/conversations/ServicoChip'
import ComposerDemo from '@/components/demo/ComposerDemo'
import PainelClienteDemo from '@/components/demo/PainelClienteDemo'
import type { MensagemTimeline } from '@/hooks/useMensagens'
import {
  BOT_OPCOES_DEMO,
  listaDemo,
  mensagensDaConversa,
  petsDoCliente,
} from '@/lib/demo/dados'
import { getWindowStatus } from '@/lib/janela24h'
import type { ItemConversa } from '@/lib/listaConversas'
import { cn } from '@/lib/utils'

/**
 * Tela de conversas em MODO DEMO: os componentes REAIS de
 * `src/components/conversations/`, alimentados por `src/lib/demo/dados.ts`.
 *
 * Por que reusar os componentes de produção em vez de clonar a tela: um clone
 * divergiria do produto na primeira mudança, e a demo passaria a prometer uma
 * tela que não existe. Aqui a lista, o cabeçalho, os balões, os chips de serviço
 * e o agrupamento por dia são exatamente o que roda em `/conversas`.
 *
 * As DUAS únicas substituições, ambas por causa de rede/sessão:
 *
 * 1. `MessageComposer` -> `ComposerDemo`. O real posta em `/api/send-message`,
 *    que exige sessão (regra 2 do CLAUDE.md) e devolveria 401 numa rota pública.
 *
 * 2. `useConversas` / `useMensagens` -> estado local. São `useQuery` no Supabase,
 *    e não existe projeto Supabase ainda.
 *
 * E uma coisa que NÃO é substituição, e sim um truque de cache: `ServicoChip` e
 * o menu reconstruído em `MessageBubble` leem `bot_opcoes` por uma `useQuery`
 * com a chave `['bot-opcoes']`. Em vez de tocar nesses dois arquivos de
 * produção, este componente cria um `QueryClient` próprio e SEMEIA essa chave
 * com as opções do demo. A query já nasce com dado fresco (o `staleTime` de 1 h
 * de `useBotOpcoes`), então o `queryFn` nunca roda e nenhuma requisição sai.
 * Sem isso o chip cairia no fallback de mostrar o `botao_id` cru (banho_tosa em
 * vez de "Banho e Tosa") — verdadeiro, mas feio na frente da cliente.
 */

/**
 * O shape exato que `useBotOpcoes` devolve: `OpcaoBot[]`, ou seja as colunas
 * `botao_id, titulo, ordem, ativo` de `bot_opcoes`, ordenadas por `ordem`.
 * `BOT_OPCOES_DEMO` é `BotOpcao[]` e tem um campo a mais (`resposta`, que só o
 * bot usa no servidor); a projeção abaixo entrega só o que a tela consome, para
 * o cache do demo ser idêntico ao de produção e não funcionar por sorte.
 */
function opcoesParaCache(): OpcaoBot[] {
  return BOT_OPCOES_DEMO.slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ botao_id, titulo, ordem, ativo }) => ({ botao_id, titulo, ordem, ativo }))
}

let seqDemo = 0

export default function ConversationsDemo() {
  const qc = useMemo(() => {
    const c = new QueryClient({
      defaultOptions: {
        queries: {
          // Nenhuma query do demo pode ir à rede: sem retry, sem refetch de
          // foco, e dado nunca stale. Se algum componente reusado abrir uma
          // query que eu não semeei, ela falha uma vez e fica quieta — em vez
          // de bater num Supabase inexistente a cada tique.
          retry: false,
          refetchOnWindowFocus: false,
          refetchInterval: false,
          staleTime: Infinity,
        },
      },
    })
    c.setQueryData<OpcaoBot[]>(['bot-opcoes'], opcoesParaCache())
    return c
  }, [])

  return (
    <QueryClientProvider client={qc}>
      <TelaDemo />
    </QueryClientProvider>
  )
}

function TelaDemo() {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [painelAberto, setPainelAberto] = useState(false)
  // Mensagens que a atendente escreveu DENTRO do demo, por telefone. Ficam só
  // aqui: nada é gravado, nada é enviado.
  const [enviadas, setEnviadas] = useState<Record<string, MensagemTimeline[]>>({})

  // Mesmo relógio de minuto do `Conversations` real: a janela de 24 h é um prazo
  // que anda sozinho, e sem o tique o "restam 12m" congelaria na tela.
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const mensagens = useMemo<MensagemTimeline[]>(() => {
    if (!selecionado) return []
    return [...mensagensDaConversa(selecionado), ...(enviadas[selecionado] ?? [])]
  }, [selecionado, enviadas])

  // A lista é recalculada a partir das mensagens enviadas no demo, não fixa:
  // responder uma conversa tem de apagar o ponto laranja e mudar a prévia, como
  // em produção. A reordenação copia a de `listaDemo` (pendentes primeiro).
  const lista = useMemo<ItemConversa[]>(() => {
    return listaDemo()
      .map((item) => {
        const extras = enviadas[item.phone]
        if (!extras?.length) return item
        const ultima = extras[extras.length - 1]
        return {
          ...item,
          ultimaMensagem: ultima.content?.trim() || item.ultimaMensagem,
          ultimaEm: ultima.created_at,
          pendente: false,
        }
      })
      .sort((a, b) => {
        if (a.pendente !== b.pendente) return a.pendente ? -1 : 1
        return b.ultimaEm.localeCompare(a.ultimaEm)
      })
  }, [enviadas])

  const atual = useMemo(
    () => lista.find((c) => c.phone === selecionado) ?? null,
    [lista, selecionado]
  )

  const janela = useMemo(() => getWindowStatus(mensagens, agora), [mensagens, agora])

  const pets = useMemo(() => petsDoCliente(selecionado), [selecionado])

  function enviarNoDemo(texto: string) {
    if (!selecionado) return
    seqDemo += 1
    const phone = selecionado
    const nova: MensagemTimeline = {
      id: `demo-enviada-${seqDemo}`,
      message_id: `wamid.DEMOLOCAL${seqDemo}`,
      phone,
      direction: 'outbound',
      content: texto,
      message_type: 'text',
      media_path: null,
      media_mime: null,
      // 'sent' e não 'delivered'/'read': o balão mostra UM check. Fingir entrega
      // confirmada seria inventar um retorno da Meta que não existe no demo.
      delivery_status: 'sent',
      created_at: new Date().toISOString(),
    }
    setEnviadas((anteriores) => ({
      ...anteriores,
      [phone]: [...(anteriores[phone] ?? []), nova],
    }))
  }

  function selecionar(phone: string) {
    setSelecionado(phone)
    // Numa tela estreita o painel do cliente é sobreposição: abri-lo junto com a
    // conversa cobriria a conversa que a pessoa acabou de escolher.
    setPainelAberto(false)
  }

  const nomeAtual = atual?.nome ?? null
  const servicoAtual = atual?.ultimoServico ?? null

  return (
    <div className="flex h-full min-h-0">
      {/*
        LAYOUT ESTREITO (celular): a lista é a tela inicial e escolher uma
        conversa a substitui, com um botão "Conversas" (voltar) acima do
        cabeçalho. Lista e conversa lado a lado só a partir de `md`.

        `ConversationList` é de produção e tem `w-[340px]` fixo no próprio nó —
        num celular de 360 px isso não deixa gutter nenhum. Em vez de editar o
        componente de produção, o wrapper força a largura do filho (com `!` de
        importante, porque as duas classes têm a mesma especificidade) e só
        devolve os 340 px a partir de `md`.
      */}
      <div
        className={cn(
          'h-full min-h-0 w-full shrink-0 md:w-auto',
          '[&>div]:w-full! md:[&>div]:w-[340px]!',
          selecionado && 'hidden md:block'
        )}
      >
        <ConversationList
          conversas={lista}
          carregando={false}
          selecionado={selecionado}
          onSelecionar={selecionar}
          busca={busca}
          onBuscaChange={setBusca}
        />
      </div>

      <section
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col',
          !selecionado && 'hidden md:flex'
        )}
      >
        {!selecionado ? (
          <div className="chat-wallpaper flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <MessageSquare aria-hidden className="size-8 text-laranja-escuro opacity-70" />
            <div>
              <p className="font-display text-lg">Escolha uma conversa</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Quem está esperando resposta aparece no topo da lista, com o ponto laranja.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Barra de voltar do layout estreito. Em `md+` a lista está ao lado
                e um "Voltar" não significaria nada. */}
            <div className="flex shrink-0 items-center border-b border-border bg-card px-2 py-1.5 md:hidden">
              <button
                type="button"
                onClick={() => setSelecionado(null)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ArrowLeft className="size-4" />
                Conversas
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-stretch">
                  <div className="min-w-0 flex-1">
                    <ChatHeader
                      phone={selecionado}
                      nome={nomeAtual}
                      ultimoServico={servicoAtual}
                      janela={janela}
                    />
                  </div>
                  {/* Abre o painel de Fase 2 onde ele não cabe como coluna. */}
                  <button
                    type="button"
                    onClick={() => setPainelAberto((v) => !v)}
                    aria-label="Mostrar contexto do cliente"
                    aria-expanded={painelAberto}
                    className="flex shrink-0 items-center justify-center border-b border-l border-border bg-card px-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none xl:hidden"
                  >
                    <PanelRight className="size-4 text-laranja-escuro" />
                  </button>
                </div>

                <MessageTimeline
                  phone={selecionado}
                  mensagens={mensagens}
                  carregando={false}
                />

                <ComposerDemo janela={janela} onEnviar={enviarNoDemo} />
              </div>

              {/* Coluna fixa onde sobra largura. */}
              <PainelClienteDemo
                phone={selecionado}
                nome={nomeAtual}
                ultimoServico={servicoAtual}
                pets={pets}
                className="hidden w-[300px] shrink-0 xl:flex"
              />
            </div>

            {/* Abaixo de `xl` o mesmo painel vira sobreposição, com fundo
                clicável — numa tela estreita ele tomaria a conversa inteira. */}
            {painelAberto && (
              <>
                <button
                  type="button"
                  aria-label="Fechar painel do cliente"
                  onClick={() => setPainelAberto(false)}
                  className="absolute inset-0 z-10 xl:hidden"
                  style={{ background: 'color-mix(in srgb, var(--ink) 20%, transparent)' }}
                />
                <PainelClienteDemo
                  phone={selecionado}
                  nome={nomeAtual}
                  ultimoServico={servicoAtual}
                  pets={pets}
                  onFechar={() => setPainelAberto(false)}
                  className="absolute inset-y-0 right-0 z-20 w-full max-w-[320px] shadow-xl xl:hidden"
                />
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}
