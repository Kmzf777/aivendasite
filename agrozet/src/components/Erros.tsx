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
import { errosIniciais as registrosIniciais, type ErroMock } from '@/lib/mock/dadosTelas'

/**
 * `/erros` — `operational_errors`, admin.
 *
 * É a tela de diagnóstico: quem chega aqui está investigando um atendimento que
 * deu errado e quer ler muitas linhas rápido. Por isso densidade alta, fonte
 * mono nos campos técnicos e legibilidade acima de beleza — sem cartão, sem
 * ícone por linha, sem espaço em branco decorativo.
 *
 * As `origem` são as strings que o código realmente registra (`webhook.POST`,
 * `mediaStorage.armazenarMidia`, …), conferidas em `src/`. Filtrar por uma
 * origem que nunca aparece ensinaria errado quem for usar a tela depois.
 */
export default function Erros() {
  // Uma vez por montagem: as datas são relativas a agora e recalcular a cada
  // render faria a coluna "quando" escorregar sozinha.
  const [linhas] = useState<ErroMock[]>(() => registrosIniciais())
  const [origem, setOrigem] = useState('')

  const origens = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const l of linhas) contagem.set(l.origem, (contagem.get(l.origem) ?? 0) + 1)
    return [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [linhas])

  const visiveis = useMemo(
    () => (origem === '' ? linhas : linhas.filter((l) => l.origem === origem)),
    [linhas, origem]
  )

  return (
    <div className="scroll-soft h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Diagnóstico
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Erros</h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{linhas.length}</p>
              <p className="text-[11px] text-muted-foreground">
                {linhas.length === 1 ? 'registro' : 'registros'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{origens.length}</p>
              <p className="text-[11px] text-muted-foreground">
                {origens.length === 1 ? 'origem' : 'origens'}
              </p>
            </div>
          </div>
        </header>

        {/* Filtro por origem. `select` nativo de propósito: é o controle mais
            previsível no teclado e no celular, e não há primitivo de Select no
            projeto. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label
            htmlFor="filtro-origem"
            className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase"
          >
            Origem
          </label>
          <select
            id="filtro-origem"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className="h-8 max-w-full min-w-0 rounded-lg border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">todas ({linhas.length})</option>
            {origens.map(([o, n]) => (
              <option key={o} value={o}>
                {o} ({n})
              </option>
            ))}
          </select>
          {origem !== '' && (
            <Button variant="ghost" size="xs" onClick={() => setOrigem('')}>
              Limpar
            </Button>
          )}
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {visiveis.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum erro para esse filtro.
          </p>
        ) : (
          <>
            {/* Desktop: tabela densa. */}
            <div className="mt-4 hidden overflow-hidden rounded-lg border border-border bg-card lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 text-[11px] font-semibold tracking-[0.1em]">
                      Quando
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                      Origem
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                      Mensagem
                    </TableHead>
                    <TableHead className="pr-4 text-[11px] font-semibold tracking-[0.1em]">
                      Contexto
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => (
                    <TableRow key={l.id} className="align-top">
                      <TableCell className="py-2 pl-4 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {dataHoraLonga(l.created_at)}
                      </TableCell>
                      <TableCell className="py-2">
                        <ChipOrigem origem={l.origem} />
                      </TableCell>
                      <TableCell className="max-w-[34rem] py-2 text-xs whitespace-normal">
                        {l.mensagem}
                      </TableCell>
                      <TableCell className="max-w-[20rem] py-2 pr-4 font-mono text-[11px] whitespace-normal text-muted-foreground">
                        {formatarContexto(l.contexto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Celular e tablet: a mesma informação empilhada. Mensagem de erro
                e contexto são textos longos — em 360 px nenhuma tabela de quatro
                colunas sobrevive sem scroll horizontal, e rolar lateralmente num
                log é como ler pela fresta. */}
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card lg:hidden">
              {visiveis.map((l) => (
                <li key={l.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <ChipOrigem origem={l.origem} />
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {dataHoraLonga(l.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs">{l.mensagem}</p>
                  {l.contexto && (
                    <p className="mt-1 font-mono text-[11px] break-words text-muted-foreground">
                      {formatarContexto(l.contexto)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * `modulo.funcao` com o módulo esmaecido: numa coluna de 40 linhas, o que
 * distingue uma da outra é o sufixo, e é nele que o olho tem de bater primeiro.
 */
function ChipOrigem({ origem }: { origem: string }) {
  const ponto = origem.indexOf('.')
  const modulo = ponto === -1 ? origem : origem.slice(0, ponto + 1)
  const funcao = ponto === -1 ? '' : origem.slice(ponto + 1)
  return (
    <span
      className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4"
      title={origem}
    >
      <span className="text-muted-foreground">{modulo}</span>
      <span className="font-semibold">{funcao}</span>
    </span>
  )
}

/** Data com dia, hora e minuto: num log, "hoje" não basta. */
function dataHoraLonga(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * `contexto` é `jsonb` livre. Achatado em `chave=valor` em vez de JSON
 * indentado: numa tabela de diagnóstico o que se procura é um telefone ou um
 * `messageId`, e três linhas de chaves por registro afundariam a leitura.
 */
function formatarContexto(contexto: Record<string, unknown> | null): string {
  if (!contexto) return '—'
  const partes = Object.entries(contexto).map(([k, v]) => `${k}=${String(v)}`)
  return partes.length === 0 ? '—' : partes.join('  ')
}
