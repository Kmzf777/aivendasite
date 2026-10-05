'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Lock, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { WindowStatus } from '@/lib/janela24h'
import { cn } from '@/lib/utils'

type Props = {
  phone: string
  /** Fora da janela de 24 h a Meta só aceita template: o composer trava. */
  janela: WindowStatus
  /** Chamado depois de um envio bem-sucedido, para invalidar as queries. */
  onEnviado: () => void
}

const MAX_BYTES = 5 * 1024 * 1024

export default function MessageComposer({ phone, janela, onEnviado }: Props) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const travado = !janela.isOpen

  async function enviar() {
    if (enviando || travado) return

    // Imagem tem prioridade e vai SOZINHA: o contrato de `/api/upload-media` é
    // `FormData` com `file` e `phone`, sem campo de legenda. Mandar o texto
    // junto exigiria inventar um campo que a rota (de outro agente) não lê — o
    // texto seria descartado em silêncio. Então o texto digitado FICA na caixa
    // e sai como mensagem própria no Enter seguinte.
    if (arquivo) {
      setEnviando(true)
      try {
        const form = new FormData()
        form.append('file', arquivo)
        form.append('phone', phone)
        const res = await fetch('/api/upload-media', { method: 'POST', body: form })
        if (!res.ok) throw new Error(await mensagemDeErro(res))
        setArquivo(null)
        if (inputArquivoRef.current) inputArquivoRef.current.value = ''
        onEnviado()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a imagem')
      } finally {
        setEnviando(false)
      }
      return
    }

    const corpo = texto.trim()
    if (!corpo) return
    setEnviando(true)
    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, text: corpo }),
      })
      if (!res.ok) throw new Error(await mensagemDeErro(res))
      // Só limpa DEPOIS do 2xx: apagar antes perderia o texto numa falha de rede
      // e o atendente teria de redigitar sem saber se chegou.
      setTexto('')
      onEnviado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem')
    } finally {
      setEnviando(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra linha. `isComposing` protege o teclado de
    // acentuação: durante a composição de "ã" o Enter é do IME, não do envio.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void enviar()
    }
  }

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Só imagem por aqui. Outros tipos de arquivo ficam para a Fase 2.')
      e.target.value = ''
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error('Imagem acima de 5 MB. Tire uma foto menor ou reduza antes de enviar.')
      e.target.value = ''
      return
    }
    setArquivo(f)
  }

  if (travado) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-5 py-4">
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

  const podeEnviar = !enviando && (!!arquivo || texto.trim().length > 0)

  return (
    <div className="shrink-0 border-t border-border bg-card px-5 py-3">
      {arquivo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs">
          <ImagePlus aria-hidden className="size-3.5 shrink-0 text-laranja-escuro" />
          <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
          <span className="shrink-0 text-muted-foreground">vai sem legenda</span>
          <button
            type="button"
            aria-label="Remover imagem"
            onClick={() => {
              setArquivo(null)
              if (inputArquivoRef.current) inputArquivoRef.current.value = ''
            }}
            className="rounded p-0.5 hover:bg-background"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={inputArquivoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={escolherArquivo}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Anexar imagem"
          disabled={enviando}
          onClick={() => inputArquivoRef.current?.click()}
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
          onClick={() => void enviar()}
        >
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Enter envia · Shift+Enter quebra linha · janela aberta por {janela.timeLeft}
      </p>
    </div>
  )
}

// A rota devolve 401 sem sessão e pode devolver um `{ error }`. Um "falhou" seco
// não diz ao atendente se ele precisa logar de novo ou tentar mais tarde.
async function mensagemDeErro(res: Response): Promise<string> {
  if (res.status === 401) return 'Sua sessão expirou. Entre de novo para responder.'
  try {
    const json: { error?: string } = await res.json()
    if (json.error) return json.error
  } catch {
    // corpo não-JSON: cai no genérico
  }
  return `Falha no envio (HTTP ${res.status}).`
}
