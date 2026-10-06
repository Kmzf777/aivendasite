'use client'

import { useEffect, useRef } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { MensagemTimeline } from '@/hooks/useMensagens'
import MessageBubble from './MessageBubble'

type Props = {
  mensagens: MensagemTimeline[]
  carregando: boolean
  erro?: boolean
  onRecarregar?: () => void
  /** Telefone aberto. Muda ⇒ a rolagem inicial para o fim acontece de novo. */
  phone: string | null
}

// "Hoje" / "Ontem" / data longa. O atendente lê a timeline de cima para baixo e
// precisa saber que o "oi" de cima é de outra semana.
//
// HIDRATAÇÃO: `new Date()` e o fuso do runtime entram no resultado, então
// servidor e cliente podem discordar (virada de dia entre os dois renders, ou
// Node em UTC e browser em America/Sao_Paulo). O rótulo é renderizado com
// `suppressHydrationWarning` — ver a divisória de dia lá embaixo.
function rotuloDoDia(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const diaDe = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDias = Math.round((diaDe(hoje) - diaDe(d)) / 86_400_000)
  if (diffDias === 0) return 'Hoje'
  if (diffDias === 1) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function chaveDoDia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function agruparPorDia(mensagens: MensagemTimeline[]) {
  const grupos: { chave: string; rotulo: string; msgs: MensagemTimeline[] }[] = []
  for (const m of mensagens) {
    const chave = chaveDoDia(m.created_at)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.chave === chave) ultimo.msgs.push(m)
    else grupos.push({ chave, rotulo: rotuloDoDia(m.created_at), msgs: [m] })
  }
  return grupos
}

export default function MessageTimeline({
  mensagens,
  carregando,
  erro,
  onRecarregar,
  phone,
}: Props) {
  const fimRef = useRef<HTMLDivElement>(null)
  const rolagemInicialRef = useRef(false)
  const ultimoIdRef = useRef<string | null>(null)

  // Troca de conversa: a rolagem inicial tem de valer de novo. Só mexe em refs,
  // então não dispara render.
  useEffect(() => {
    rolagemInicialRef.current = false
    ultimoIdRef.current = null
  }, [phone])

  useEffect(() => {
    if (carregando) return
    const ultimoId = mensagens[mensagens.length - 1]?.id ?? null
    if (!rolagemInicialRef.current) {
      // Conversa recém-aberta: aterrissa no fim, sem animação — animar aqui
      // mostraria o histórico inteiro passando voando.
      rolagemInicialRef.current = true
      ultimoIdRef.current = ultimoId
      fimRef.current?.scrollIntoView()
      return
    }
    // Depois disso, só mensagem NOVA rola. O refetch de 15 s troca o array sem
    // necessariamente trazer mensagem nova (status de entrega muda a linha), e
    // rolar nesses casos arrancaria o atendente do ponto em que estava lendo.
    if (ultimoId !== ultimoIdRef.current) {
      ultimoIdRef.current = ultimoId
      fimRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensagens, carregando])

  const grupos = agruparPorDia(mensagens)

  return (
    // `bg-[var(--chat-surface)]` em vez de uma classe utilitária de papel de
    // parede: a superfície da conversa é só um tom neutro a menos que o `card`,
    // o suficiente para separar a leitura do cabeçalho e do composer.
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto bg-[var(--chat-surface)] px-4 py-4">
      {carregando ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 aria-label="Carregando" className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : erro ? (
        // Erro de carga não é conversa vazia: dizer "nenhuma mensagem" aqui
        // faria o atendente responder sem ver o que o cliente escreveu.
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertCircle aria-hidden className="size-5 text-destructive" />
          <div>
            <p className="text-sm font-medium">Não foi possível carregar o histórico</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pode ser a conexão ou sua sessão. Nenhuma mensagem foi perdida.
            </p>
          </div>
          {onRecarregar && (
            <button
              type="button"
              onClick={onRecarregar}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Tentar novamente
            </button>
          )}
        </div>
      ) : mensagens.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.chave}>
            <div className="sticky top-0 z-10 flex justify-center py-2">
              <span
                // Ver a nota de HIDRATAÇÃO em `rotuloDoDia`.
                suppressHydrationWarning
                className="rounded border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {g.rotulo}
              </span>
            </div>
            <div className="space-y-1">
              {g.msgs.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
            </div>
          </div>
        ))
      )}
      <div ref={fimRef} />
    </div>
  )
}
