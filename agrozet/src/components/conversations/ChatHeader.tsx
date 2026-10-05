'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WINDOW_COLORS, type WindowStatus } from '@/lib/janela24h'
import { formatarTelefoneBr } from '@/lib/listaConversas'
import { toTitleCase } from '@/lib/utils'
import ServicoChip from './ServicoChip'

type Props = {
  phone: string
  nome: string | null
  ultimoServico: string | null
  /** Calculado no relógio único de `Conversations` — o cabeçalho não tem timer próprio. */
  janela: WindowStatus
}

export default function ChatHeader({ phone, nome, ultimoServico, janela }: Props) {
  const telefone = formatarTelefoneBr(phone)

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-display text-base leading-tight">
            {nome ? toTitleCase(nome) : telefone}
          </h1>
          {ultimoServico && <ServicoChip botaoId={ultimoServico} />}
        </div>
        {/* Com nome no cadastro o telefone vira a segunda linha: o atendente
            ainda precisa dele para conferir que abriu a conversa certa. */}
        {nome && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">{telefone}</p>
        )}
      </div>

      {/* Indicador da janela de 24 h. É o mesmo dado que desabilita o composer:
          fora da janela a Meta só aceita template, e um texto livre falharia. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex shrink-0 cursor-default items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: WINDOW_COLORS[janela.statusColor] }}
              />
              <span className="font-mono text-[11px] text-muted-foreground">
                {janela.isOpen ? janela.timeLeft : 'fechada'}
              </span>
            </div>
          }
        />
        <TooltipContent>
          {janela.isOpen
            ? `Janela de 24 h aberta — restam ${janela.timeLeft} para responder com texto livre.`
            : 'Janela de 24 h fechada. Fora dela a Meta só aceita mensagem de template (disparo).'}
        </TooltipContent>
      </Tooltip>
    </header>
  )
}
