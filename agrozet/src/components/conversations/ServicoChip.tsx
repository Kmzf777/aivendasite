'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MODO_MOCK } from '@/lib/mock/modo'
import { lerOpcoesBot, subscribe, versao } from '@/lib/mock/store'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

/**
 * Opção do menu do bot, como a tela a consome.
 * `ativo` e `ordem` só interessam ao menu reconstruído em `MessageBubble`.
 */
export type OpcaoBot = {
  botao_id: string
  titulo: string
  ordem: number
  ativo: boolean
}

// DECISÃO (mapa `botao_id` -> título): o mapa vem de uma `useQuery` própria em
// `bot_opcoes`, não de uma prop furada por quatro níveis de componente.
//
// Por quê: `clientes.ultimo_servico` guarda o `botao_id` cru (ex. 'banho_tosa'),
// e quem conhece o título legível ('Banho e tosa') é só `bot_opcoes`. Os dois
// consumidores do mapa — o chip da lista e o menu reconstruído no balão
// `interactive` — estão em subárvores diferentes; passar por prop obrigaria
// `ConversationList`, `ChatHeader` e `MessageTimeline` a carregar um dado que
// não é deles. Com React Query o custo de rede é o mesmo de uma prop: a
// `queryKey` é compartilhada, então todos os chips da tela dividem UMA
// requisição. `staleTime` de 1 h porque `bot_opcoes` é configuração — muda
// quando o dono do pet shop edita o menu, não a cada atendimento.
const UMA_HORA = 60 * 60 * 1000

/**
 * O tipo de retorno fixado em uma chave — `data` é tudo que os dois
 * consumidores (`ServicoChip` e `MessageBubble`) leem. Declarado porque o
 * caminho em memória não devolve um `UseQueryResult` inteiro.
 */
export type ResultadoBotOpcoes = { data: OpcaoBot[] | undefined }

export function useBotOpcoes(): ResultadoBotOpcoes {
  // MODO_MOCK: o menu vem do store, sem rede. Mesma mecânica de `useConversas`
  // (snapshot = `versao()`, número estável; os dados são derivados dele), e
  // `enabled: false` mantém o `queryFn` parado. Com a flag desligada isto é o
  // `useQuery` de antes, com o mesmo `staleTime` de 1 h.
  const versaoMock = useSyncExternalStore(subscribe, versao, versao)
  const dadosMock = useMemo(() => {
    void versaoMock // a versão É a dependência: muda a cada escrita no store
    return MODO_MOCK ? lerOpcoesBot() : undefined
  }, [versaoMock])

  const query = useQuery<OpcaoBot[]>({
    queryKey: ['bot-opcoes'],
    enabled: !MODO_MOCK,
    staleTime: UMA_HORA,
    // Configuração não precisa do tique de 15 s das conversas.
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('bot_opcoes')
        .select('botao_id, titulo, ordem, ativo')
        .order('ordem', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  if (MODO_MOCK) return { data: dadosMock }

  return query
}

type Props = {
  /** `clientes.ultimo_servico`: o `bot_opcoes.botao_id` escolhido no menu. */
  botaoId: string | null | undefined
  className?: string
}

/**
 * Etiqueta de assunto da conversa.
 *
 * Não usa `components/ui/badge.tsx`: aquele é um pill de CONTADOR (devolve
 * `null` sem `count`), serve ao indicador de pendente e não tem variante.
 *
 * Neutro de propósito: a cor da marca está reservada ao item ativo da sidebar,
 * ao botão primário e ao ponto de pendente. Um chip colorido por conversa
 * repintaria a lista inteira e seria a primeira coisa a chamar atenção numa
 * tela onde o importante é quem está esperando.
 *
 * Fallback deliberado: `botao_id` sem correspondência em `bot_opcoes` — opção
 * renomeada, desativada e removida, ou o mapa ainda carregando — mostra o
 * próprio `botao_id`. Esconder o chip apagaria a informação de que a conversa
 * TEM um assunto; mostrar o id cru é feio mas verdadeiro.
 */
export default function ServicoChip({ botaoId, className }: Props) {
  const { data: opcoes } = useBotOpcoes()
  if (!botaoId) return null

  const titulo = opcoes?.find((o) => o.botao_id === botaoId)?.titulo ?? botaoId

  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center truncate rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-4 font-medium text-muted-foreground',
        className
      )}
      title={titulo}
    >
      {titulo}
    </span>
  )
}
