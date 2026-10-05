'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import ChatHeader from '@/components/conversations/ChatHeader'
import ConversationList from '@/components/conversations/ConversationList'
import MessageComposer from '@/components/conversations/MessageComposer'
import MessageTimeline from '@/components/conversations/MessageTimeline'
import { useConversas } from '@/hooks/useConversas'
import { useMensagens } from '@/hooks/useMensagens'
import { getWindowStatus } from '@/lib/janela24h'

/**
 * Tela de atendimento: lista à esquerda, conversa à direita.
 *
 * Caixa ÚNICA, por decisão de produto: um número de WhatsApp e todos os
 * atendentes veem todas as conversas. Isso é o que elimina transferência de
 * conversa, filtro por instância e contador de não-lidas por usuário — não há
 * "minhas conversas" para separar de "as dela".
 */
export default function Conversations() {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const conversas = useConversas()
  const mensagens = useMensagens(selecionado)
  const queryClient = useQueryClient()

  // Relógio único de minuto. A janela de 24 h é um prazo que anda sozinho: sem
  // isto, "restam 12m" ficaria congelado até o atendente clicar em algo, e o
  // composer continuaria liberado depois de a janela fechar. Um timer só, aqui,
  // em vez de um por componente.
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // `?? []` memoizado: o literal vazio é uma referência nova a cada render e,
  // como o relógio de minuto re-renderiza este componente, ele invalidaria os
  // memos abaixo de graça.
  const lista = useMemo(() => conversas.data ?? [], [conversas.data])
  const atual = useMemo(
    () => lista.find((c) => c.phone === selecionado) ?? null,
    [lista, selecionado]
  )

  // Derivado do histórico, não de estado local: trocar de conversa e recarregar
  // a página têm de dar a MESMA resposta sobre a janela estar aberta.
  const janela = useMemo(
    () => getWindowStatus(mensagens.data ?? [], agora),
    [mensagens.data, agora]
  )

  function aposEnviar() {
    // A mensagem enviada só aparece quando a rota a gravou; invalidar as duas
    // queries evita esperar até 15 s pelo próximo tique do polling.
    void queryClient.invalidateQueries({ queryKey: ['mensagens', selecionado] })
    void queryClient.invalidateQueries({ queryKey: ['conversas'] })
  }

  return (
    <div className="flex h-full min-h-0">
      <ConversationList
        conversas={lista}
        carregando={conversas.isLoading}
        erro={conversas.isError}
        selecionado={selecionado}
        onSelecionar={setSelecionado}
        busca={busca}
        onBuscaChange={setBusca}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            <ChatHeader
              phone={selecionado}
              // `atual` pode ser null por um instante: a conversa selecionada
              // sempre existe na lista, mas um refetch em voo pode não a ter
              // ainda. O cabeçalho cai para o telefone, nunca para um buraco.
              nome={atual?.nome ?? null}
              ultimoServico={atual?.ultimoServico ?? null}
              janela={janela}
            />
            <MessageTimeline
              phone={selecionado}
              mensagens={mensagens.data ?? []}
              carregando={mensagens.isLoading}
              erro={mensagens.isError}
              onRecarregar={() => void mensagens.refetch()}
            />
            {/* Sem histórico carregado não há como saber se a janela está
                aberta: `getWindowStatus([])` devolve "fechada", e mostrar o
                aviso de janela fechada durante a carga seria mentira. */}
            {!mensagens.isLoading && !mensagens.isError && (
              <MessageComposer
                phone={selecionado}
                janela={janela}
                onEnviado={aposEnviar}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}
