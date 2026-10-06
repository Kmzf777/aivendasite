'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarTelefoneBr } from '@/lib/listaConversas'
import {
  CAMPANHAS as NOME_CAMPANHA,
  disparosIniciais as filaInicial,
  type DisparoMock,
  type StatusDisparo,
} from '@/lib/mock/dadosTelas'
import { cn, toTitleCase } from '@/lib/utils'

/**
 * `/disparos` — fila de `scheduled_disparos`.
 *
 * NÃO existe botão "disparar agora", e não é esquecimento: pelo spec, disparo
 * custa dinheiro por mensagem na Meta e só pode ser enfileirado pela rota
 * `POST /api/schedule-disparo`, que valida expediente, resolve o telefone
 * canônico e filtra a blocklist. Um botão de envio imediato nesta tela seria a
 * única coisa aqui capaz de gastar dinheiro de verdade.
 *
 * Cancelar mexe no estado local deste componente.
 */

const ROTULO_STATUS: Record<StatusDisparo, string> = {
  pending: 'na fila',
  processing: 'enviando',
  sent: 'enviado',
  failed: 'falhou',
  canceled: 'cancelado',
}

/**
 * Status em cinza/vermelho, sem arco-íris: a cor da marca aparece só em
 * `processing`, que é o único estado que pede o olho agora. Todo par de cores
 * aqui é token semântico, com contraste já conferido no tema.
 */
const CLASSE_STATUS: Record<StatusDisparo, string> = {
  pending: 'border-border bg-secondary text-secondary-foreground',
  processing: 'border-primary/40 bg-primary/10 text-foreground',
  sent: 'border-border bg-muted text-muted-foreground',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
  canceled: 'border-border bg-background text-muted-foreground line-through',
}

/** Status que ainda dá para cancelar — enviado e falhado já aconteceram. */
function cancelavel(status: StatusDisparo): boolean {
  return status === 'pending' || status === 'processing'
}

function ChipStatus({ status }: { status: StatusDisparo }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium',
        CLASSE_STATUS[status]
      )}
    >
      {ROTULO_STATUS[status]}
    </span>
  )
}

function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' }
  )}`
}

export default function Disparos() {
  // Os dados nascem uma vez por montagem: `filaInicial()` calcula datas
  // relativas a agora, e recalcular a cada render faria a coluna "quando"
  // escorregar sozinha.
  const [linhas, setLinhas] = useState<DisparoMock[]>(() => filaInicial())

  const campanhas = useMemo(() => {
    const mapa = new Map<string, { total: number; abertos: number }>()
    for (const l of linhas) {
      const atual = mapa.get(l.campaign_id) ?? { total: 0, abertos: 0 }
      atual.total += 1
      if (cancelavel(l.status)) atual.abertos += 1
      mapa.set(l.campaign_id, atual)
    }
    return [...mapa.entries()]
  }, [linhas])

  const porSair = useMemo(() => linhas.filter((l) => cancelavel(l.status)).length, [linhas])

  function cancelarLinha(id: string) {
    setLinhas((ls) =>
      ls.map((l) => (l.id === id && cancelavel(l.status) ? { ...l, status: 'canceled' } : l))
    )
  }

  function cancelarCampanha(campaignId: string) {
    setLinhas((ls) =>
      ls.map((l) =>
        l.campaign_id === campaignId && cancelavel(l.status)
          ? { ...l, status: 'canceled' }
          : l
      )
    )
  }

  return (
    <div className="scroll-soft h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Operação
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Disparos</h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{linhas.length}</p>
              <p className="text-[11px] text-muted-foreground">
                {linhas.length === 1 ? 'linha' : 'linhas'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{porSair}</p>
              <p className="text-[11px] text-muted-foreground">por sair</p>
            </div>
          </div>
        </header>

        {/* Resumo por campanha + cancelamento em bloco. */}
        <section className="mt-5">
          <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Campanhas
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {campanhas.map(([id, { total, abertos }]) => (
              <div
                key={id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{NOME_CAMPANHA[id] ?? id}</p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {total} {total === 1 ? 'linha' : 'linhas'} · {abertos} por sair
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={abertos === 0}
                  onClick={() => cancelarCampanha(id)}
                >
                  Cancelar campanha
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Desktop: tabela de 6 colunas. */}
        <div className="mt-5 hidden overflow-hidden rounded-lg border border-border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-[11px] font-semibold tracking-[0.1em]">
                  Destinatário
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                  Template
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                  Quando sai
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                  Status
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                  Campanha
                </TableHead>
                <TableHead className="pr-4 text-right text-[11px] font-semibold tracking-[0.1em]">
                  Ação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-4">
                    <span className="font-medium">
                      {l.nome ? (
                        toTitleCase(l.nome)
                      ) : (
                        <span className="text-muted-foreground">
                          {formatarTelefoneBr(l.phone)}
                        </span>
                      )}
                    </span>
                    {l.nome && (
                      <span className="ml-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatarTelefoneBr(l.phone)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.template_name}
                    <span className="ml-1 text-muted-foreground">({l.template_lang})</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {quando(l.scheduled_for)}
                  </TableCell>
                  <TableCell>
                    <ChipStatus status={l.status} />
                    {l.status === 'failed' && l.error && (
                      <p className="mt-1 max-w-[22rem] text-[11px] whitespace-normal text-destructive">
                        {l.error} · {l.attempts} tentativas
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {NOME_CAMPANHA[l.campaign_id] ?? l.campaign_id}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {cancelavel(l.status) ? (
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => cancelarLinha(l.id)}
                      >
                        Cancelar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Celular: cartões. Seis colunas em 360 px só caberiam com scroll
            horizontal, que esconderia justo a coluna de ação. */}
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
          {linhas.map((l) => (
            <li key={l.id} className="px-3 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {l.nome ? toTitleCase(l.nome) : formatarTelefoneBr(l.phone)}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatarTelefoneBr(l.phone)}
                  </p>
                </div>
                <ChipStatus status={l.status} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">Template</dt>
                <dd className="font-mono">{l.template_name}</dd>
                <dt className="text-muted-foreground">Quando sai</dt>
                <dd className="font-mono tabular-nums">{quando(l.scheduled_for)}</dd>
                <dt className="text-muted-foreground">Campanha</dt>
                <dd>{NOME_CAMPANHA[l.campaign_id] ?? l.campaign_id}</dd>
              </dl>
              {l.status === 'failed' && l.error && (
                <p className="mt-2 text-[11px] text-destructive">
                  {l.error} · {l.attempts} tentativas
                </p>
              )}
              {cancelavel(l.status) && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => cancelarLinha(l.id)}
                >
                  Cancelar esta linha
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
