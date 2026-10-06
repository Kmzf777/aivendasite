'use client'

import { AlertCircle, Search } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
//
// HIDRATAÇÃO: esta função compara a data da mensagem com `new Date()` e formata
// no fuso do runtime — as duas coisas divergem entre servidor e cliente (o
// relógio anda entre o render do servidor e a hidratação; o fuso do Node não é
// o do browser). O remédio é `suppressHydrationWarning` no elemento que carrega
// o texto, lá embaixo: o React aceita a divergência NAQUELE nó e o próximo
// render do cliente grava o valor local.
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

// Duas letras para o avatar. Nome composto usa a inicial do primeiro e do
// último; sem nome, os dois últimos dígitos do telefone — qualquer coisa é
// melhor que um círculo vazio na coluna que o atendente varre o dia inteiro.
function iniciais(nome: string | null, phone: string): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    const primeira = partes[0]?.charAt(0) ?? ''
    const ultima = partes[partes.length - 1]?.charAt(0) ?? ''
    return (primeira + ultima).toUpperCase()
  }
  if (partes.length === 1) return (partes[0] ?? '').slice(0, 2).toUpperCase()
  return phone.slice(-2)
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
    <div
      className={cn(
        'flex h-full w-full shrink-0 flex-col border-r border-border bg-card md:w-[320px]',
        // Tela estreita: as duas colunas não cabem. Com conversa aberta a lista
        // sai de cena, em vez de empurrar a conversa para fora da viewport.
        selecionado && 'hidden md:flex'
      )}
    >
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex h-6 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Conversas</h2>
          {/* Pill de pendentes: o Badge de ui/ some sozinho no zero — um "0"
              permanente é ruído e o atendente para de olhar a coluna. */}
          <Badge count={pendentes} />
        </div>
        <div className="relative mt-2.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Buscar nome, telefone ou texto"
            aria-label="Buscar conversas"
            className="h-8 bg-muted pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="scroll-soft min-h-0 flex-1">
        {carregando ? (
          <div>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : erro ? (
          // Falha de carga NÃO é caixa vazia: "nenhuma conversa" aqui faria o
          // atendente achar que ninguém chamou.
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <AlertCircle aria-hidden className="size-5 text-destructive" />
            <p className="text-sm font-medium">Não foi possível carregar as conversas</p>
            <p className="text-xs text-muted-foreground">
              Pode ser a conexão ou sua sessão. Nada foi perdido — a lista tenta de novo
              em alguns segundos.
            </p>
          </div>
        ) : visiveis.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {termo ? 'Nenhuma conversa para essa busca.' : 'Nenhuma conversa ainda.'}
          </p>
        ) : (
          <ul>
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
                      // Linha corrida com divisória, não cartão arredondado com
                      // respiro em volta: cabem bem mais conversas na mesma
                      // altura e a coluna lê como tabela, que é o que ela é.
                      'relative flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                      ativo ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    )}
                  >
                    {/* Barra fina no item aberto: diz qual conversa está na tela
                        sem depender só do tom de fundo. */}
                    {ativo && (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                    )}

                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-muted text-[11px] font-semibold text-muted-foreground">
                        {iniciais(c.nome, c.phone)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {titulo}
                        </span>
                        <span
                          // Ver a nota de HIDRATAÇÃO em `horaCurta`.
                          suppressHydrationWarning
                          className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
                        >
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
                        {c.ultimoServico && (
                          <ServicoChip botaoId={c.ultimoServico} className="max-w-[45%]" />
                        )}
                        {/* Ponto da marca: "esperando você". Derivado da última
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
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
