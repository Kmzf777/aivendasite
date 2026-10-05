'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, Clock, FileText, ImageOff, TriangleAlert } from 'lucide-react'
import type { MensagemTimeline } from '@/hooks/useMensagens'
import { cn } from '@/lib/utils'
import { useBotOpcoes } from './ServicoChip'

type Props = {
  msg: MensagemTimeline
}

const TIPOS_DE_MIDIA = new Set(['image', 'audio', 'document', 'video'])

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Imagem do balão.
 *
 * A URL assinada é pedida a `/api/media-url` SÓ quando o balão entra em
 * viewport, nunca na montagem da timeline. Sem isso, abrir uma conversa com 50
 * fotos dispararia 50 downloads de uma vez — e o free tier do Supabase tem
 * 5 GB/mês de egress. O `IntersectionObserver` é desconectado no primeiro
 * cruzamento: uma vez pedida, a URL não precisa ser pedida de novo.
 */
function ImagemDoBalao({ path, alt }: { path: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visivel) return
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true)
          obs.disconnect()
        }
      },
      // Margem de um pouco mais de uma tela: a imagem já está carregada quando
      // o atendente chega nela, mas ainda não para quem nunca rolou até lá.
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visivel])

  useEffect(() => {
    if (!visivel) return
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch(`/api/media-url?path=${encodeURIComponent(path)}`)
        if (!res.ok) throw new Error(String(res.status))
        const json: { url?: string } = await res.json()
        if (!cancelado && json.url) setUrl(json.url)
        else if (!cancelado) setErro(true)
      } catch {
        if (!cancelado) setErro(true)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [visivel, path])

  return (
    <div ref={ref} className="min-h-[120px]">
      {erro ? (
        <p className="flex items-center gap-1.5 py-6 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" /> Não foi possível carregar a imagem
        </p>
      ) : url ? (
        // `<img>` e não `next/image`: a URL é assinada e efêmera (expira), o que
        // exigiria whitelist de domínio remoto e faria o Next proxiar o arquivo
        // pelo servidor — dobrando exatamente o egress que todo este componente
        // existe para economizar.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="max-h-80 w-auto max-w-full rounded-lg object-contain"
        />
      ) : (
        <div className="h-[120px] w-[180px] animate-pulse rounded-lg bg-foreground/5" />
      )}
    </div>
  )
}

/**
 * Menu do bot reconstruído a partir de `bot_opcoes`.
 *
 * Por que reconstruir: a linha de `messages` de um `interactive` outbound guarda
 * só o CORPO do menu em `content` — a Meta recebe os botões, mas o banco não tem
 * coluna para eles. Sem os chips, a mensagem mais importante da timeline (o
 * menu que o cliente de fato viu) apareceria como um texto solto terminando em
 * "escolha uma opção" sem opção nenhuma, e a resposta seguinte do cliente
 * ("Rações") ficaria sem contexto.
 *
 * Limite assumido: os chips refletem `bot_opcoes` AGORA, não como estava no
 * envio. Se o dono do pet shop editar o menu, menus antigos passam a exibir os
 * botões novos. Guardar o snapshot exigiria coluna nova em `messages` — fora do
 * escopo da Fase 1; o chip errado é menos ruim que nenhum chip.
 */
function ChipsDoMenu() {
  const { data: opcoes } = useBotOpcoes()
  const ativas = (opcoes ?? []).filter((o) => o.ativo)
  if (ativas.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-foreground/10 pt-2">
      {ativas.map((o) => (
        <span
          key={o.botao_id}
          aria-disabled="true"
          className="cursor-not-allowed rounded-md border border-foreground/15 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {o.titulo}
        </span>
      ))}
    </div>
  )
}

function StatusDeEntrega({ status }: { status: string | null }) {
  if (status === 'read') return <CheckCheck className="size-3.5 text-[var(--chat-check)]" />
  if (status === 'delivered') return <CheckCheck className="size-3.5 opacity-60" />
  if (status === 'sent') return <Check className="size-3.5 opacity-60" />
  if (status === 'failed')
    return <TriangleAlert className="size-3.5 text-destructive" aria-label="Falhou" />
  return <Clock className="size-3.5 opacity-50" />
}

export default function MessageBubble({ msg }: Props) {
  const saindo = msg.direction === 'outbound'
  const ehMidia = TIPOS_DE_MIDIA.has(msg.message_type)
  // Retenção de 90 dias: o arquivo é apagado e a LINHA fica. Sem este caso o
  // balão renderizaria um buraco e pareceria bug de carregamento.
  const midiaExpirada = ehMidia && !msg.media_path

  return (
    <div className={cn('flex w-full', saindo ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm',
          saindo ? 'rounded-br-md' : 'rounded-bl-md border border-border'
        )}
        style={{
          background: saindo ? 'var(--chat-bubble-out)' : 'var(--chat-bubble-in)',
          color: 'var(--foreground)',
        }}
      >
        {midiaExpirada ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <ImageOff className="size-3.5 shrink-0" />
            mídia expirada
          </p>
        ) : msg.message_type === 'image' && msg.media_path ? (
          <ImagemDoBalao path={msg.media_path} alt={msg.content ?? 'Foto enviada no WhatsApp'} />
        ) : msg.message_type === 'audio' && msg.media_path ? (
          // Áudio é só RECEBIDO nesta fase. O player não é pré-carregado por
          // egress: `preload="none"` só baixa quando o atendente dá play.
          <AudioDoBalao path={msg.media_path} />
        ) : msg.message_type === 'document' && msg.media_path ? (
          <DocumentoDoBalao path={msg.media_path} nome={msg.content} />
        ) : null}

        {/* `document` já usa o `content` como nome do arquivo no próprio
            botão — repetir aqui mostraria o nome duas vezes. */}
        {msg.content && msg.message_type !== 'document' && (
          <p
            className={cn(
              'break-words whitespace-pre-wrap',
              msg.message_type === 'image' && 'mt-1.5'
            )}
          >
            {msg.content}
          </p>
        )}

        {/* Só o menu que SAIU: um `interactive` inbound é a escolha do cliente,
            gravada já como o título do botão. */}
        {saindo && msg.message_type === 'interactive' && <ChipsDoMenu />}

        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">
            {hora(msg.created_at)}
          </span>
          {saindo && <StatusDeEntrega status={msg.delivery_status} />}
        </div>
      </div>
    </div>
  )
}

// Áudio e documento usam a MESMA URL assinada da imagem, mas sem
// IntersectionObserver: o pedido só sai no clique do atendente, o que é um gate
// de egress ainda mais apertado que o viewport.
function useUrlAssinadaSobDemanda(path: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  async function pedir() {
    if (url || carregando) return
    setCarregando(true)
    try {
      const res = await fetch(`/api/media-url?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error(String(res.status))
      const json: { url?: string } = await res.json()
      if (json.url) setUrl(json.url)
      else setErro(true)
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }

  return { url, carregando, erro, pedir }
}

function AudioDoBalao({ path }: { path: string }) {
  const { url, carregando, erro, pedir } = useUrlAssinadaSobDemanda(path)

  if (erro) {
    return <p className="text-xs text-muted-foreground">Não foi possível carregar o áudio</p>
  }
  if (!url) {
    return (
      <button
        type="button"
        onClick={pedir}
        disabled={carregando}
        className="rounded-md border border-foreground/15 px-2 py-1 text-xs font-medium text-laranja-escuro disabled:opacity-50"
      >
        {carregando ? 'Carregando…' : 'Ouvir áudio'}
      </button>
    )
  }
  // Áudio de WhatsApp recebido do cliente: não existe faixa de legenda para
  // anexar, e `preload="none"` garante que o arquivo só desce no play.
  return <audio controls preload="none" src={url} className="max-w-full" />
}

function DocumentoDoBalao({ path, nome }: { path: string; nome: string | null }) {
  const { url, carregando, erro, pedir } = useUrlAssinadaSobDemanda(path)
  const rotulo = nome?.trim() || 'Documento'

  if (erro) {
    return <p className="text-xs text-muted-foreground">Não foi possível abrir o documento</p>
  }
  if (!url) {
    return (
      <button
        type="button"
        onClick={pedir}
        disabled={carregando}
        className="flex items-center gap-1.5 rounded-md border border-foreground/15 px-2 py-1 text-xs font-medium text-laranja-escuro disabled:opacity-50"
      >
        <FileText className="size-3.5" />
        {carregando ? 'Carregando…' : rotulo}
      </button>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-xs font-medium text-laranja-escuro underline"
    >
      <FileText className="size-3.5" />
      {rotulo}
    </a>
  )
}
