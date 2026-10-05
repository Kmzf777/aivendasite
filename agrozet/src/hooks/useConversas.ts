'use client'

import { useQuery } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { montarLista, type ItemConversa } from '@/lib/listaConversas'

/** Janela de histórico da lista: casa com a retenção de 90 dias da mídia. */
const DIAS_DE_HISTORICO = 90

// Teto de linhas trazidas. O PostgREST corta silenciosamente no `max-rows` do
// projeto, então pedir um limite explícito é a diferença entre saber e não
// saber onde o corte acontece. A ordem é `created_at DESC` de propósito: se o
// corte vier, ele descarta as mensagens MAIS ANTIGAS, que são justamente as que
// não mudariam a última mensagem de nenhuma conversa ativa. Só conversas
// inteiramente antigas desaparecem — e elas já viveriam no fundo da lista.
const TETO_MENSAGENS = 3000

// Colunas lidas aqui são EXATAMENTE as cinco que `montarLista` usa.
// `media_path` fica de fora por decisão de custo: o free tier do Supabase tem
// 5 GB/mês de egress e a lista nunca deve ser capaz de disparar o download de
// uma imagem. Sem o caminho em mãos, nem por acidente.
const COLUNAS_LISTA = 'phone, direction, created_at, content, message_type'

export type { ItemConversa }

/**
 * Lista de conversas da caixa única: pendentes no topo, depois por recência.
 *
 * Realtime do Supabase fica FORA da Fase 1 de propósito. Um `refetchInterval`
 * de 15 s entrega a mesma sensação de "chegou agora" sem manter uma conexão
 * websocket aberta por aba — e sem o egress de uma subscrição por aba, que num
 * free tier de 5 GB/mês é o custo que primeiro estoura. Quando a Fase 2 exigir
 * latência de segundos, o lugar da troca é aqui.
 */
export function useConversas() {
  return useQuery<ItemConversa[]>({
    queryKey: ['conversas'],
    refetchInterval: 15_000,
    // O `staleTime` global é de 2 min; aqui ele precisa ser 0, senão o tique de
    // 15 s encontraria o cache "fresco" e não buscaria nada.
    staleTime: 0,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      const desde = new Date(
        Date.now() - DIAS_DE_HISTORICO * 24 * 60 * 60 * 1000
      ).toISOString()

      const [mensagens, clientes] = await Promise.all([
        supabase
          .from('messages')
          .select(COLUNAS_LISTA)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(TETO_MENSAGENS),
        supabase.from('clientes').select('phone, nome, ultimo_servico'),
      ])

      // Erro parcial não vira lista parcial: uma lista sem os nomes pareceria
      // um banco vazio de clientes em vez de uma falha de rede.
      if (mensagens.error) throw mensagens.error
      if (clientes.error) throw clientes.error

      return montarLista(mensagens.data ?? [], clientes.data ?? [])
    },
  })
}
