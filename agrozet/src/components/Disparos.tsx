'use client'

import { useMemo, useState } from 'react'
import { Construction, Send } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  CAMPANHAS_EXEMPLO,
  disparosExemplo,
  type DisparoMock,
  type StatusDisparo,
} from '@/lib/mock/dadosTelas'
import { cn, toTitleCase } from '@/lib/utils'

/**
 * `/disparos` — fila de `scheduled_disparos` (Fase 3 do spec).
 *
 * ESTA TELA É MAQUETE. Não existe `scheduled_disparos` no banco, não existe
 * `POST /api/schedule-disparo` nem o cron `process-disparos`: é a Fase 3
 * inteira, nada dela implementado. A tela mostra a FORMA da fila para o dono
 * decidir o layout antes de a Fase 3 ser escrita, e diz isso em cima, onde
 * quem está vendo a demonstração lê primeiro.
 *
 * Em particular NÃO existe botão "disparar agora", e não é esquecimento: pelo
 * spec, disparo custa dinheiro por mensagem na Meta e só pode ser enfileirado
 * pela rota, que valida expediente, resolve o telefone canônico e filtra a
 * blocklist. Um botão de envio imediato nesta tela seria a única coisa aqui
 * capaz de gastar dinheiro de verdade, e ele não tem como existir antes da
 * rota.
 *
 * Cancelar, sim, está ligado — mas só ao estado local deste componente, que se
 * desfaz ao recarregar a página. É o que deixa o dono demonstrar o gesto sem
 * fingir que algo foi gravado.
 */

const ROTULO_STATUS: Record<StatusDisparo, string> = {
  pending: 'na fila',
  processing: 'enviando',
  sent: 'enviado',
  failed: 'falhou',
  canceled: 'cancelado',
}

// Amarelo é só preenchimento (nunca recebe texto claro); o texto é sempre a
// tinta do tema ou o destructive, que têm contraste conferido.
const CLASSE_STATUS: Record<StatusDisparo, string> = {
  pending: 'border-amarelo/60 bg-amarelo/25 text-secondary-foreground',
  processing: 'border-laranja/50 bg-laranja/15 text-laranja-escuro',
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
  // Os dados nascem uma vez por montagem: `disparosExemplo()` calcula datas
  // relativas a agora, e recalcular a cada render faria a coluna "quando"
  // escorregar sozinha.
  const [linhas, setLinhas] = useState<DisparoMock[]>(() => disparosExemplo())

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl">Disparos</h1>
          <p className="text-sm text-muted-foreground">
            Fila de mensagens de template agendadas
          </p>
        </header>

        {/* O aviso vem ANTES da tabela, não depois: quem está apresentando lê de
            cima para baixo, e o dono não pode ser contrariado pela própria tela. */}
        <Alert className="mt-4 ring-1 ring-amarelo/50">
          <Construction aria-hidden className="text-laranja-escuro" />
          <AlertTitle>Esta tela é uma maquete — o disparo ainda não funciona.</AlertTitle>
          <AlertDescription>
            <p>
              Nada aqui está ligado: não existe fila no banco, nem a rota que
              agenda, nem o processo que envia na hora marcada. As linhas abaixo
              são <strong>exemplo</strong>, para decidir o formato da tela antes
              de construí-la. Cancelar funciona só nesta janela e nada é gravado.
            </p>
            <p>
              Também não existe botão &ldquo;disparar agora&rdquo;, de propósito:
              cada mensagem de template é paga na Meta e o agendamento vai passar
              obrigatoriamente pela rota, que confere horário de expediente, o
              número certo do cliente e a lista de quem pediu para não receber.
            </p>
          </AlertDescription>
        </Alert>

        {/* Resumo por campanha + cancelamento em bloco. */}
        <section className="mt-5">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Campanhas de exemplo
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {campanhas.map(([id, { total, abertos }]) => (
              <div
                key={id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {CAMPANHAS_EXEMPLO[id] ?? id}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
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
        <div className="mt-5 hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Destinatário</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Quando sai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead className="pr-4 text-right">Ação</TableHead>
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
                        <span className="text-muted-foreground italic">
                          {formatarTelefoneBr(l.phone)}
                        </span>
                      )}
                    </span>
                    {l.nome && (
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {formatarTelefoneBr(l.phone)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.template_name}
                    <span className="ml-1 text-muted-foreground">({l.template_lang})</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{quando(l.scheduled_for)}</TableCell>
                  <TableCell>
                    <ChipStatus status={l.status} />
                    {l.status === 'failed' && l.error && (
                      <p className="mt-1 max-w-[22rem] text-[11px] whitespace-normal text-destructive">
                        {l.error} · {l.attempts} tentativas
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {CAMPANHAS_EXEMPLO[l.campaign_id] ?? l.campaign_id}
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
        <ul className="mt-5 space-y-2 md:hidden">
          {linhas.map((l) => (
            <li key={l.id} className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {l.nome ? toTitleCase(l.nome) : formatarTelefoneBr(l.phone)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {formatarTelefoneBr(l.phone)}
                  </p>
                </div>
                <ChipStatus status={l.status} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">Template</dt>
                <dd className="font-mono">{l.template_name}</dd>
                <dt className="text-muted-foreground">Quando sai</dt>
                <dd className="font-mono">{quando(l.scheduled_for)}</dd>
                <dt className="text-muted-foreground">Campanha</dt>
                <dd>{CAMPANHAS_EXEMPLO[l.campaign_id] ?? l.campaign_id}</dd>
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

        <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Send aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Quando a Fase 3 existir, o agendamento vai sair da tela de clientes
            (selecionar vários e &ldquo;agendar disparo&rdquo;) e cair nesta fila.
            O envio acontece sozinho, de cinco em cinco minutos, no horário
            marcado.
          </span>
        </p>
      </div>
    </div>
  )
}
