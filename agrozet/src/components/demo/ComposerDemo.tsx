'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Lock, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WindowStatus } from '@/lib/janela24h'
import { cn } from '@/lib/utils'

/**
 * Composer do MODO DEMO.
 *
 * POR QUE NÃO REUSAR `MessageComposer`: o composer real faz
 * `POST /api/send-message` e `POST /api/upload-media`, e as duas rotas validam a
 * sessão por código próprio (regra 2 do CLAUDE.md) — no demo, que é público e
 * sem login, o envio devolveria 401 e a cliente veria um toast de "sua sessão
 * expirou" no lugar da mensagem. Então este arquivo imita a APARÊNCIA do real e
 * troca a rede por `onEnviar`, que só acrescenta a mensagem ao estado local de
 * `ConversationsDemo`.
 *
 * O que foi copiado de propósito do real, para a demo não mentir sobre a tela:
 * o travamento fora da janela de 24 h com o mesmo texto, o Enter/Shift+Enter, e
 * a linha de rodapé com o tempo restante.
 */
type Props = {
  janela: WindowStatus
  /** Acrescenta a mensagem à timeline local. Nada sai para a rede. */
  onEnviar: (texto: string) => void
}

export default function ComposerDemo({ janela, onEnviar }: Props) {
  const [texto, setTexto] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const travado = !janela.isOpen

  function enviar() {
    const corpo = texto.trim()
    if (!corpo || travado) return
    onEnviar(corpo)
    setTexto('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mesmo contrato do composer real: Enter envia, Shift+Enter quebra linha, e
    // `isComposing` protege o teclado de acentuação (o Enter de "ã" é do IME).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }

  if (travado) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-laranja-escuro" />
          <div className="text-xs">
            <p className="font-semibold">Janela de 24 h fechada</p>
            <p className="mt-0.5 text-muted-foreground">
              A Meta só aceita mensagem de template fora da janela — um texto livre sairia
              daqui e falharia sem aviso. Espere o cliente escrever, ou use um disparo
              quando a tela de Disparos existir.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const podeEnviar = texto.trim().length > 0

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-5">
      <div className="flex items-end gap-2">
        {/* Visível e desabilitado de propósito: esconder o anexo faria a cliente
            achar que o produto não manda foto — ele manda, só não no demo. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Anexar imagem (indisponível no demo)"
          title="No modo demo não é possível subir arquivo — o envio de foto existe no produto, mas depende do número aprovado na Meta."
          disabled
        >
          <ImagePlus />
        </Button>

        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Escreva uma mensagem…"
          aria-label="Mensagem"
          className={cn(
            'max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
          )}
        />

        <Button
          type="button"
          size="icon-lg"
          aria-label="Enviar"
          disabled={!podeEnviar}
          onClick={enviar}
        >
          <Send />
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Enter envia · Shift+Enter quebra linha · janela aberta por {janela.timeLeft} ·{' '}
        <span className="font-medium">no demo a mensagem fica só nesta tela</span>
      </p>
    </div>
  )
}
