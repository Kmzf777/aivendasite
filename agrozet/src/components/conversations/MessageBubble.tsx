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

// HIDRATAÇÃO: `toLocaleTimeString` formata no fuso do runtime, e o fuso do Node
// não é o do browser — o mesmo ISO sai "14:32" no servidor e "11:32" no
// cliente. O `<span>` do horário carrega `suppressHydrationWarning` por isso.
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Botão de carregar mídia sob demanda. Neutro (borda + fundo do tema) e nunca
// com a cor da marca: ela está reservada ao botão primário, ao item ativo da
// sidebar e ao ponto de pendente — e como texto, sobre a superfície clara do
// balão, o laranja não alcançaria 4,5:1.
const botaoMidia =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

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
          <ImageOff aria-hidden className="size-3.5" /> Não foi possível carregar a imagem
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
          className="max-h-80 w-auto max-w-full rounded-md object-contain"
        />
      ) : (
        <div className="h-[120px] w-[180px] animate-pulse rounded-md bg-foreground/5" />
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
 * São `<span aria-disabled>` e não `<button>` de propósito: ninguém aqui aperta
 * o botão do cliente. É o registro do que foi enviado, não um controle.
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
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
      {ativas.map((o) => (
        <span
          key={o.botao_id}
          aria-disabled="true"
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {o.titulo}
        </span>
      ))}
    </div>
  )
}

function StatusDeEntrega({ status }: { status: string | null }) {
  if (status === 'read') {
    return <CheckCheck aria-label="Lida" className="size-3.5 text-[var(--chat-check)]" />
  }
  if (status === 'delivered') {
    return <CheckCheck aria-label="Entregue" className="size-3.5 text-foreground/55" />
  }
  if (status === 'sent') {
    return <Check aria-label="Enviada" className="size-3.5 text-foreground/55" />
  }
  if (status === 'failed') {
    return <TriangleAlert aria-label="Falhou" className="size-3.5 text-destructive" />
  }
  return <Clock aria-label="Pendente" className="size-3.5 text-foreground/45" />
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
          // Raio médio e sem sombra: a diferença de fundo e o lado já dizem quem
          // falou. Balão muito arredondado com sombra é o que dava à tela a cara
          // de aplicativo de conversa pessoal, não de ferramenta de trabalho.
          'max-w-[85%] min-w-0 rounded-lg border border-border px-2.5 py-1.5 text-sm md:max-w-[75%]',
          saindo
            ? 'bg-[var(--chat-bubble-out)]'
            : 'bg-[var(--chat-bubble-in)]'
        )}
      >
        {midiaExpirada ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <ImageOff aria-hidden className="size-3.5 shrink-0" />
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

        <div className="mt-0.5 flex items-center justify-end gap-1">
          {/* `text-foreground/70` e não `text-muted-foreground`: o fundo aqui é
              o do balão, não o `--background` para o qual o token foi calibrado.
              Derivar do `foreground` do próprio balão mantém o contraste nos
              dois lados da conversa. Ver a nota de HIDRATAÇÃO em `hora`. */}
          <span
            suppressHydrationWarning
            className="font-mono text-[10px] tabular-nums text-foreground/70"
          >
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
      <button type="button" onClick={pedir} disabled={carregando} className={botaoMidia}>
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
      <button type="button" onClick={pedir} disabled={carregando} className={botaoMidia}>
        <FileText aria-hidden className="size-3.5" />
        {carregando ? 'Carregando…' : rotulo}
      </button>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={botaoMidia}>
      <FileText aria-hidden className="size-3.5" />
      {rotulo}
    </a>
  )
}
