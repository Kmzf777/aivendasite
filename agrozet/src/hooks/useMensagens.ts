'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MODO_MOCK } from '@/lib/mock/modo'
import { lerMensagens, subscribe, versao } from '@/lib/mock/store'
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

/** As quatro chaves que `Conversations` consome. Ver a nota em `useConversas`. */
export type ResultadoMensagens = {
  data: MensagemTimeline[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/** Estável por referência: no mock não há o que recarregar. */
const SEM_REFETCH = () => {}

/**
 * Timeline de um telefone. Sem telefone selecionado a query nem roda
 * (`enabled`), então abrir a tela não custa uma consulta vazia.
 *
 * Mesmo motivo de `useConversas` para NÃO usar Realtime na Fase 1: 15 s de
 * polling em vez de um websocket por aba.
 */
export function useMensagens(phone: string | null): ResultadoMensagens {
  // MODO MOCK: ver a nota longa em `useConversas` — mesma mecânica, mesmas
  // razões. `versao()` é o snapshot (número, estável por identidade);
  // `lerMensagens` só é chamada na derivação. Com a flag desligada, `enabled`
  // volta a ser só `!!phone` e este hook é o `useQuery` de antes.
  const versaoMock = useSyncExternalStore(subscribe, versao, versao)
  const dadosMock = useMemo(() => {
    void versaoMock // a versão É a dependência: muda a cada escrita no store
    return MODO_MOCK ? lerMensagens(phone) : undefined
  }, [versaoMock, phone])

  const query = useQuery<MensagemTimeline[]>({
    queryKey: ['mensagens', phone],
    enabled: !MODO_MOCK && !!phone,
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

  if (MODO_MOCK) {
    // Sem telefone selecionado o store devolve lista vazia — o mesmo "nada a
    // mostrar" que o `enabled: !!phone` produzia, sem custo de consulta.
    return { data: dadosMock, isLoading: false, isError: false, refetch: SEM_REFETCH }
  }

  return query
}
