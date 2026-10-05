'use client'

import { AlertCircle, Search } from 'lucide-react'
import Badge from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarTelefoneBr, type ItemConversa } from '@/lib/listaConversas'
import { cn, toTitleCase } from '@/lib/utils'
import ServicoChip from './ServicoChip'

type Props = {
  conversas: ItemConversa[]
  carregando: boolean
  erro?: boolean
  selecionado: string | null
  onSelecionar: (phone: string) => void
  busca: string
  onBuscaChange: (valor: string) => void
}

// Hora para hoje, data curta para o resto. O atendente lê a coluna de olho:
// "14:32" responde "foi agora?" e "02/10" responde "foi quando?".
function horaCurta(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia =
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function ConversationList({
  conversas,
  carregando,
  erro,
  selecionado,
  onSelecionar,
  busca,
  onBuscaChange,
}: Props) {
  const termo = busca.trim().toLowerCase()
  // Busca local, não no servidor: a lista já está inteira na memória (90 dias,
  // uma caixa só) e um round-trip por tecla digitada seria egress por nada.
  const visiveis = termo
    ? conversas.filter(
        (c) =>
          c.phone.includes(termo.replace(/\D/g, '')) ||
          (c.nome ?? '').toLowerCase().includes(termo) ||
          c.ultimaMensagem.toLowerCase().includes(termo)
      )
    : conversas

  const pendentes = conversas.filter((c) => c.pendente).length

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-border bg-card">
      <div className="shrink-0 px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">Conversas</h2>
          {/* Pill laranja de pendentes: o Badge de ui/ some sozinho no zero. */}
          <Badge count={pendentes} />
        </div>
        <div className="relative mt-3">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Buscar nome, telefone ou texto"
            aria-label="Buscar conversas"
            className="pl-8"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 scroll-soft">
        <div className="pb-4">
          {carregando ? (
            <div className="space-y-2 px-4 py-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : erro ? (
            // Falha de carga NÃO é caixa vazia: "nenhuma conversa" aqui faria o
            // atendente achar que ninguém chamou.
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <AlertCircle className="size-5 text-destructive" />
              <p className="text-sm font-medium">Não foi possível carregar as conversas</p>
              <p className="text-xs text-muted-foreground">
                Pode ser a conexão ou sua sessão. Nada foi perdido — a lista tenta de novo
                em alguns segundos.
              </p>
            </div>
          ) : visiveis.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {termo ? 'Nenhuma conversa para essa busca.' : 'Nenhuma conversa ainda.'}
            </p>
          ) : (
            <ul className="space-y-0.5 px-2">
              {visiveis.map((c) => {
                const ativo = c.phone === selecionado
                const titulo = c.nome ? toTitleCase(c.nome) : formatarTelefoneBr(c.phone)
                return (
                  <li key={c.phone}>
                    <button
                      type="button"
                      onClick={() => onSelecionar(c.phone)}
                      aria-current={ativo ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                        ativo ? 'bg-accent' : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {titulo}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {horaCurta(c.ultimaEm)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-xs',
                            c.pendente
                              ? 'font-medium text-foreground'
                              : 'text-muted-foreground'
                          )}
                        >
                          {c.ultimaMensagem || '—'}
                        </span>
                        {/* Ponto laranja: "esperando você". Derivado da última
                            mensagem ser do cliente — não há contador por
                            usuário num número compartilhado. */}
                        {c.pendente && (
                          <span
                            aria-label="Esperando resposta"
                            title="Esperando resposta"
                            className="size-2 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </div>
                      {c.ultimoServico && (
                        <div className="mt-1.5">
                          <ServicoChip botaoId={c.ultimoServico} />
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
