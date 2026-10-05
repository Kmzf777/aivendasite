'use client'

import { useQuery } from '@tanstack/react-query'
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

export function useBotOpcoes() {
  return useQuery<OpcaoBot[]>({
    queryKey: ['bot-opcoes'],
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
        // Amarelo da marca é só preenchimento e nunca recebe texto claro: o
        // texto aqui é a tinta marrom-escura do tema.
        'inline-flex max-w-full items-center truncate rounded-full border border-amarelo/60 bg-amarelo/25 px-2 py-0.5 text-[11px] leading-4 font-medium text-secondary-foreground',
        className
      )}
      title={titulo}
    >
      {titulo}
    </span>
  )
}
