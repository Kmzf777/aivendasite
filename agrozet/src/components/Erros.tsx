'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { errosExemplo, type ErroMock } from '@/lib/mock/dadosTelas'
import { cn } from '@/lib/utils'

/**
 * `/erros` — `operational_errors` (Fase 2 do spec), admin.
 *
 * É a tela de diagnóstico: quem chega aqui está investigando um atendimento que
 * deu errado e quer ler muitas linhas rápido. Por isso densidade alta, fonte
 * mono nos campos técnicos e legibilidade acima de beleza — sem cartão, sem
 * ícone por linha, sem espaço em branco decorativo.
 *
 * MOCKUP: os erros abaixo são exemplos. A tabela real só é escrita pelo
 * servidor (`logOperationalError`, com a chave `service_role`) e lida por admin
 * via RLS; não há como o mock em memória produzi-la de verdade. As `origem`,
 * porém, NÃO são inventadas: são as strings que o código de hoje realmente
 * registra, conferidas em `src/`. Filtrar por uma origem que nunca aparece
 * ensinaria errado quem for usar a tela depois.
 */
export default function Erros() {
  // Uma vez por montagem: as datas são relativas a agora e recalcular a cada
  // render faria a coluna "quando" escorregar sozinha.
  const [linhas] = useState<ErroMock[]>(() => errosExemplo())
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl">Erros</h1>
          <p className="text-sm text-muted-foreground">
            Falhas que o sistema registrou sem derrubar o atendimento
          </p>
        </header>

        <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            As {linhas.length} linhas abaixo são <strong>exemplo</strong>: nesta
            demonstração não há servidor gravando erro de verdade. Os nomes de
            origem, sim, são os que o sistema real usa — é por eles que se acha o
            ponto exato da falha.
          </span>
        </p>

        {/* Filtro por origem. `select` nativo de propósito: é o controle mais
            previsível no teclado e no celular, e não há primitivo de Select no
            projeto. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="filtro-origem" className="text-xs font-medium">
            Origem
          </label>
          <select
            id="filtro-origem"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className="h-9 max-w-full min-w-0 rounded-lg border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">todas ({linhas.length})</option>
            {origens.map(([o, n]) => (
              <option key={o} value={o}>
                {o} ({n})
              </option>
            ))}
          </select>
          {origem !== '' && (
            <button
              type="button"
              onClick={() => setOrigem('')}
              className="text-xs text-laranja-escuro underline underline-offset-2"
            >
              limpar
            </button>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">
            {visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {visiveis.length === 0 ? (
          <p className="mt-4 rounded-xl bg-card px-6 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Nenhum erro para esse filtro.
          </p>
        ) : (
          <>
            {/* Desktop: tabela densa. */}
            <div className="mt-4 hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Quando</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="pr-4">Contexto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => (
                    <TableRow key={l.id} className="align-top">
                      <TableCell className="py-1.5 pl-4 font-mono text-[11px] text-muted-foreground">
                        {dataHoraLonga(l.created_at)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <ChipOrigem origem={l.origem} />
                      </TableCell>
                      <TableCell className="max-w-[34rem] py-1.5 text-xs whitespace-normal">
                        {l.mensagem}
                      </TableCell>
                      <TableCell className="max-w-[20rem] py-1.5 pr-4 font-mono text-[11px] whitespace-normal text-muted-foreground">
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
            <ul className="mt-4 space-y-2 lg:hidden">
              {visiveis.map((l) => (
                <li
                  key={l.id}
                  className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <ChipOrigem origem={l.origem} />
                    <span className="font-mono text-[11px] text-muted-foreground">
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
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4'
      )}
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
