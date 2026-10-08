'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ServicoChip from '@/components/conversations/ServicoChip'
import { formatarTelefoneBr } from '@/lib/listaConversas'
import {
  lerClientes,
  lerPets,
  lerTodosPets,
  salvarCliente,
  subscribe,
  versao,
  type ClienteMock,
  type PetMock,
} from '@/lib/mock/store'
import { cn, toTitleCase } from '@/lib/utils'

/**
 * `/clientes` — cadastro de clientes e pets.
 *
 * Lê do store em memória (`src/lib/mock/store.ts`) e escreve de volta por
 * `salvarCliente`. O snapshot do `useSyncExternalStore` é o NÚMERO de `versao()`,
 * nunca o array de `lerClientes()`: aquele devolve uma referência nova a cada
 * chamada e o React entraria em laço infinito de render comparando snapshots que
 * nunca são iguais. O terceiro argumento é o `getServerSnapshot` — sem ele o SSR
 * desta rota quebra.
 *
 * LAYOUT: coluna única com a tabela, e a ficha do selecionado numa coluna
 * lateral a partir de `xl`. Abaixo disso a ficha entra ACIMA da tabela (ordem do
 * grid), porque com o sidebar de 240 px não sobra largura para duas colunas — e
 * a tabela some em favor de cartões abaixo de `md`, que é o único jeito de caber
 * em 360 px sem scroll horizontal.
 */
export default function Clientes() {
  const v = useSyncExternalStore(subscribe, versao, versao)
  const { clientes, pets } = useMemo(() => {
    void v // a versão É a dependência: muda a cada escrita no store
    return { clientes: lerClientes(), pets: lerTodosPets() }
  }, [v])

  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<string | null>(null)

  // Pets por telefone: a coluna "pets" da tabela precisa da contagem de todos,
  // e varrer o array inteiro por linha seria O(n*m) a cada tecla digitada.
  const petsPorTelefone = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const p of pets) {
      mapa.set(p.cliente_phone, (mapa.get(p.cliente_phone) ?? 0) + 1)
    }
    return mapa
  }, [pets])

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    if (!termo) return clientes
    const digitos = termo.replace(/\D/g, '')
    return clientes.filter(
      (c) =>
        (c.nome ?? '').toLowerCase().includes(termo) ||
        (digitos.length > 0 && c.phone.includes(digitos))
    )
  }, [clientes, termo])

  const atual = useMemo(
    () => clientes.find((c) => c.phone === selecionado) ?? null,
    [clientes, selecionado]
  )

  return (
    <div className="scroll-soft h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Cadastro
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Clientes</h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{clientes.length}</p>
              <p className="text-[11px] text-muted-foreground">
                {clientes.length === 1 ? 'cadastro' : 'cadastros'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-semibold tabular-nums">{pets.length}</p>
              <p className="text-[11px] text-muted-foreground">
                {pets.length === 1 ? 'pet' : 'pets'}
              </p>
            </div>
          </div>
        </header>

        <div className="relative mt-4 max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar clientes"
            className="pl-8"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          {atual && (
            <div className="xl:order-2">
              {/* `key` no telefone: trocar de cliente REMONTA a ficha, e com
                  isso os campos editáveis renascem com os dados do novo
                  cadastro. É o jeito de resetar estado recomendado pelo React —
                  um `useEffect` que chama `setState` causaria render em cascata
                  e o lint do projeto o recusa. De quebra, o remount acontece só
                  na troca de cliente: uma escrita qualquer no store (`versao()`
                  novo) mantém a ficha montada e NÃO apaga o que a pessoa está
                  digitando. */}
              <FichaCliente
                key={atual.phone}
                cliente={atual}
                pets={lerPets(atual.phone)}
                onFechar={() => setSelecionado(null)}
              />
            </div>
          )}

          <section className="min-w-0 xl:order-1">
            {visiveis.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
                <p className="text-sm font-medium">
                  {termo ? 'Nenhum cliente para essa busca.' : 'Nenhum cliente cadastrado.'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  O cadastro base nasce sozinho: a primeira mensagem de um número cria a
                  linha do cliente.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: tabela. */}
                <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4 text-[11px] font-semibold tracking-[0.1em]">
                          Nome
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                          Telefone
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.1em]">
                          Último serviço
                        </TableHead>
                        <TableHead className="text-right text-[11px] font-semibold tracking-[0.1em]">
                          Pets
                        </TableHead>
                        <TableHead className="pr-4 text-right text-[11px] font-semibold tracking-[0.1em]">
                          Última interação
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveis.map((c) => {
                        const ativo = c.phone === selecionado
                        return (
                          <TableRow
                            key={c.phone}
                            onClick={() => setSelecionado(c.phone)}
                            aria-selected={ativo}
                            className={cn('cursor-pointer', ativo && 'bg-muted')}
                          >
                            <TableCell className="pl-4 font-medium">
                              {c.nome ? (
                                toTitleCase(c.nome)
                              ) : (
                                // Sem nome no cadastro, o telefone formatado É o
                                // nome — "—" deixaria a linha sem identidade.
                                <span className="text-muted-foreground">
                                  {formatarTelefoneBr(c.phone)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                              {formatarTelefoneBr(c.phone)}
                            </TableCell>
                            <TableCell>
                              {c.ultimo_servico ? (
                                <ServicoChip botaoId={c.ultimo_servico} />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {petsPorTelefone.get(c.phone) ?? 0}
                            </TableCell>
                            <TableCell className="pr-4 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {dataHoraCurta(c.ultima_interacao_at)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Celular: cartões. A tabela de 5 colunas não cabe em 360 px e
                    rolar na horizontal esconde justamente a coluna da direita. */}
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
                  {visiveis.map((c) => {
                    const ativo = c.phone === selecionado
                    const qtd = petsPorTelefone.get(c.phone) ?? 0
                    return (
                      <li key={c.phone}>
                        <button
                          type="button"
                          onClick={() => setSelecionado(c.phone)}
                          aria-current={ativo ? 'true' : undefined}
                          className={cn(
                            'w-full px-3 py-3 text-left',
                            'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                            ativo && 'bg-muted'
                          )}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {c.nome ? toTitleCase(c.nome) : formatarTelefoneBr(c.phone)}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                              {dataHoraCurta(c.ultima_interacao_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatarTelefoneBr(c.phone)} · {qtd}{' '}
                            {qtd === 1 ? 'pet' : 'pets'}
                          </p>
                          {c.ultimo_servico && (
                            <div className="mt-1.5">
                              <ServicoChip botaoId={c.ultimo_servico} />
                            </div>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Data curta com hora: "02/10 14:32". Suficiente para "foi quando?". */
function dataHoraCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' }
  )}`
}

type FichaProps = {
  cliente: ClienteMock
  pets: PetMock[]
  onFechar: () => void
}

/**
 * Ficha do cliente: nome e observações editáveis (gravam no store), pets em
 * leitura.
 */
function FichaCliente({ cliente, pets, onFechar }: FichaProps) {
  const [nome, setNome] = useState(cliente.nome ?? '')
  const [observacoes, setObservacoes] = useState(cliente.observacoes ?? '')
  const [salvo, setSalvo] = useState(false)

  // Os campos nascem do cadastro e são recarregados pelo remount que o `key`
  // do chamador provoca na troca de cliente — não por efeito.
  const sujo =
    nome !== (cliente.nome ?? '') || observacoes !== (cliente.observacoes ?? '')

  function handleSalvar() {
    // String vazia volta a ser `null`: "sem nome" e "nome em branco" são a mesma
    // coisa no cadastro, e `null` é o que a coluna guarda.
    salvarCliente(cliente.phone, {
      nome: nome.trim() === '' ? null : nome.trim(),
      observacoes: observacoes.trim() === '' ? null : observacoes.trim(),
    })
    setSalvo(true)
  }

  return (
    <Card className="xl:sticky xl:top-6">
      <CardHeader className="border-b">
        <CardTitle className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-semibold">
            {cliente.nome ? toTitleCase(cliente.nome) : formatarTelefoneBr(cliente.phone)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onFechar}
            aria-label="Fechar ficha"
          >
            <X />
          </Button>
        </CardTitle>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatarTelefoneBr(cliente.phone)} · desde{' '}
          {new Date(cliente.primeiro_contato_at).toLocaleDateString('pt-BR')}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <label
            htmlFor="ficha-nome"
            className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            Nome
          </label>
          <Input
            id="ficha-nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setSalvo(false)
            }}
            placeholder="Nome do cliente"
            className="mt-1.5"
          />
        </div>

        <div>
          <label
            htmlFor="ficha-obs"
            className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            Observações
          </label>
          <textarea
            id="ficha-obs"
            value={observacoes}
            onChange={(e) => {
              setObservacoes(e.target.value)
              setSalvo(false)
            }}
            rows={4}
            placeholder="Ex.: prefere buscar o pet depois das 17h."
            className="mt-1.5 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSalvar} disabled={!sujo}>
            Salvar
          </Button>
          {salvo && !sujo && <span className="text-xs text-muted-foreground">Salvo.</span>}
        </div>

        <Separator />

        <div>
          <h3 className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Pets{pets.length > 0 && ` (${pets.length})`}
          </h3>

          {pets.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum pet cadastrado para este cliente.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {pets.map((p) => (
                <li key={p.id} className="px-3 py-2">
                  <p className="text-sm font-medium">{toTitleCase(p.nome)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[p.especie, p.porte, p.raca].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
