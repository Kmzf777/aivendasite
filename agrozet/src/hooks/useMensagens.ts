'use client'

import { useQuery } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * Uma linha de `messages` como a timeline a consome.
 *
 * Aqui `media_path` É selecionado — ao contrário de `useConversas` — porque o
 * balão de imagem precisa dele para pedir a URL assinada. A diferença é a
 * própria regra de egress: só a conversa ABERTA pode baixar mídia, e mesmo
 * nela só o balão que entrou em viewport (ver `MessageBubble`).
 */
export type MensagemTimeline = {
  id: string
  message_id: string
  phone: string
  direction: string
  content: string | null
  message_type: string
  media_path: string | null
  media_mime: string | null
  delivery_status: string | null
  created_at: string
}

const COLUNAS_TIMELINE =
  'id, message_id, phone, direction, content, message_type, media_path, media_mime, delivery_status, created_at'

// Teto de mensagens da conversa aberta. Pede-se `created_at DESC` + limite e
// inverte-se no cliente: num histórico longo o que o atendente precisa ver é o
// FIM da conversa, e um `ASC` com limite traria exatamente o pedaço errado.
const TETO_MENSAGENS = 400

/**
 * Timeline de um telefone. Sem telefone selecionado a query nem roda
 * (`enabled`), então abrir a tela não custa uma consulta vazia.
 *
 * Mesmo motivo de `useConversas` para NÃO usar Realtime na Fase 1: 15 s de
 * polling em vez de um websocket por aba.
 */
export function useMensagens(phone: string | null) {
  return useQuery<MensagemTimeline[]>({
    queryKey: ['mensagens', phone],
    enabled: !!phone,
    refetchInterval: 15_000,
    // Ver a nota em `useConversas`: com o staleTime global de 2 min o tique de
    // 15 s não buscaria nada.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('messages')
        .select(COLUNAS_TIMELINE)
        .eq('phone', phone!)
        .order('created_at', { ascending: false })
        .limit(TETO_MENSAGENS)

      if (error) throw error
      // Cronológica para a tela: a consulta veio ao contrário só por causa do limite.
      return (data ?? []).slice().reverse()
    },
  })
}
