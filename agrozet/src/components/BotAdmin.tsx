'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  List,
  MousePointerClick,
  Plus,
  Trash2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { montarMenu, type BotConfig, type BotOpcao } from '@/lib/bot'
import {
  LIMITE_CORPO,
  LIMITE_RODAPE,
  LIMITE_TITULO_BOTAO,
  MAX_ITENS_LISTA,
  MAX_REPLY_BUTTONS,
  validarConfig,
  validarOpcao,
} from '@/lib/botLimites'
import { lerConfigBot, lerOpcoesBotCompletas } from '@/lib/mock/store'
import { cn } from '@/lib/utils'

/**
 * `/bot` — edição do menu do robô (Fase 2 do spec), admin.
 *
 * O QUE É REAL AQUI: a validação. `validarConfig`, `validarOpcao` e `montarMenu`
 * são os MESMOS módulos puros que o webhook executa no caminho crítico, com os
 * mesmos limites da Meta (título ≤ 20, corpo ≤ 1024, rodapé ≤ 60) e o mesmo
 * degrau de formato (1–3 opções ativas viram reply buttons; 4–10 viram lista).
 * Nada aqui é reimplementado "parecido": se a tela aprova, o envio também
 * aprova, e vice-versa.
 *
 * Esse degrau é a razão de a tela existir. A Meta RECUSA a mensagem com 4 reply
 * buttons — não devolve aviso amigável, devolve mensagem não entregue e um
 * cliente sem resposta. Com o menu editável, alguém cadastra a 4ª opção e o
 * formato tem de mudar sozinho. Aqui dá para ver isso acontecer antes de custar
 * um atendimento.
 *
 * O QUE NÃO É REAL: a gravação. O estado vive neste componente e se desfaz ao
 * recarregar a página — dito na tela, não só aqui.
 */

/** Opção como esta tela a edita: a do store + a `resposta`, que ela edita. */
type OpcaoEditavel = BotOpcao

/**
 * Semente: as opções do store, com `resposta`.
 *
 * `lerOpcoesBotCompletas()` e não `lerOpcoesBot()`: a segunda projeta só as
 * quatro colunas que a consulta `['bot-opcoes']` do CRM real devolve
 * (`botao_id`, `titulo`, `ordem`, `ativo`) e serve ao chip de serviço da
 * conversa. Esta tela edita a `resposta`, que é o texto que o cliente recebe e é
 * o que `validarOpcao` mede contra o teto de 1024 caracteres da Meta.
 *
 * A ordenação por `ordem` é feita aqui porque `ordem` é a fonte de verdade do
 * menu — `montarMenu` ordena por ela, não pela posição no array.
 */
function sementeOpcoes(): OpcaoEditavel[] {
  return lerOpcoesBotCompletas()
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
}

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function BotAdmin() {
  const [config, setConfig] = useState<BotConfig>(() => lerConfigBot())
  const [opcoes, setOpcoes] = useState<OpcaoEditavel[]>(sementeOpcoes)

  const errosConfig = useMemo(
    () => validarConfig({ saudacao: config.saudacao, rodape: config.rodape, fecho: config.fecho }),
    [config.saudacao, config.rodape, config.fecho]
  )

  // Erros por opção, calculados a cada tecla: o admin vê o problema no campo que
  // acabou de preencher, que é o único momento em que ele ainda está olhando.
  const errosOpcoes = useMemo(
    () => opcoes.map((o) => validarOpcao({ titulo: o.titulo, resposta: o.resposta })),
    [opcoes]
  )

  const { menu, erro: erroMenu } = useMemo(() => montarMenu(config, opcoes), [config, opcoes])

  const ativas = opcoes.filter((o) => o.ativo).length
  const totalErros = errosConfig.length + errosOpcoes.reduce((s, e) => s + e.length, 0)

  function alterarOpcao(indice: number, campo: keyof OpcaoEditavel, valor: string | boolean) {
    setOpcoes((os) => os.map((o, i) => (i === indice ? { ...o, [campo]: valor } : o)))
  }

  function mover(indice: number, direcao: -1 | 1) {
    setOpcoes((os) => {
      const destino = indice + direcao
      if (destino < 0 || destino >= os.length) return os
      const copia = os.slice()
      const [removido] = copia.splice(indice, 1)
      copia.splice(destino, 0, removido)
      // `ordem` é a fonte de verdade do menu (o `montarMenu` ordena por ela,
      // não pela posição no array), então ela é reescrita junto.
      return copia.map((o, i) => ({ ...o, ordem: i + 1 }))
    })
  }

  function adicionar() {
    setOpcoes((os) => [
      ...os,
      {
        botao_id: `opcao_${os.length + 1}`,
        titulo: '',
        resposta: '',
        ordem: os.length + 1,
        ativo: true,
      },
    ])
  }

  function remover(indice: number) {
    setOpcoes((os) =>
      os.filter((_, i) => i !== indice).map((o, i) => ({ ...o, ordem: i + 1 }))
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl">Bot</h1>
          <p className="text-sm text-muted-foreground">
            O menu que o cliente recebe na primeira mensagem
          </p>
        </header>

        <Alert className="mt-4 ring-1 ring-amarelo/50">
          <AlertTriangle aria-hidden className="text-laranja-escuro" />
          <AlertTitle>A validação é real. A gravação ainda não.</AlertTitle>
          <AlertDescription>
            <p>
              Os limites conferidos aqui são os mesmos que a Meta aplica no envio
              — título de botão até {LIMITE_TITULO_BOTAO} caracteres, texto até{' '}
              {LIMITE_CORPO}, rodapé até {LIMITE_RODAPE} — e o preview ao lado usa
              exatamente o código que monta a mensagem de verdade. O que ainda
              não existe é <strong>salvar</strong>: as mudanças valem só nesta
              janela e se desfazem ao recarregar a página.
            </p>
          </AlertDescription>
        </Alert>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Preview — primeiro no celular, coluna direita no desktop. */}
          <div className="xl:order-2">
            <Preview menu={menu} erroMenu={erroMenu} ativas={ativas} fecho={config.fecho} />
          </div>

          <div className="min-w-0 space-y-5 xl:order-1">
            {/* ── Configuração geral ── */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="font-display text-lg">Textos do menu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={config.ativo}
                    onChange={(e) => setConfig((c) => ({ ...c, ativo: e.target.checked }))}
                    className="size-4 accent-[var(--brand-laranja)]"
                  />
                  <span className="text-sm font-medium">Bot ligado</span>
                  <span className="text-xs text-muted-foreground">
                    {config.ativo
                      ? 'Contato novo recebe saudação e menu.'
                      : 'Desligado: ninguém recebe menu, nem contato novo.'}
                  </span>
                </label>

                <Separator />

                <CampoTexto
                  id="bot-saudacao"
                  rotulo="Saudação"
                  descricao="O corpo da mensagem que vem junto com os botões."
                  valor={config.saudacao}
                  limite={LIMITE_CORPO}
                  linhas={4}
                  onChange={(v) => setConfig((c) => ({ ...c, saudacao: v }))}
                />

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="bot-rodape" className="text-xs font-medium">
                      Rodapé <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <Contador atual={(config.rodape ?? '').length} limite={LIMITE_RODAPE} />
                  </div>
                  <Input
                    id="bot-rodape"
                    value={config.rodape ?? ''}
                    onChange={(e) =>
                      // Campo vazio volta a `null`: é o que a coluna guarda para
                      // "sem rodapé", e `validarConfig` trata `null` como válido.
                      setConfig((c) => ({
                        ...c,
                        rodape: e.target.value === '' ? null : e.target.value,
                      }))
                    }
                    aria-invalid={(config.rodape ?? '').length > LIMITE_RODAPE}
                    className="mt-1"
                  />
                </div>

                <CampoTexto
                  id="bot-fecho"
                  rotulo="Fecho"
                  descricao="Vai junto com a resposta, depois que o cliente escolhe."
                  valor={config.fecho}
                  limite={LIMITE_CORPO}
                  linhas={3}
                  onChange={(v) => setConfig((c) => ({ ...c, fecho: v }))}
                />

                <ListaErros erros={errosConfig} />
              </CardContent>
            </Card>

            {/* ── Opções ── */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-display text-lg">Opções do menu</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {ativas} {ativas === 1 ? 'ativa' : 'ativas'} de {opcoes.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {opcoes.map((o, i) => (
                  <div
                    key={`${o.botao_id}-${i}`}
                    className={cn(
                      'rounded-xl border border-border p-3',
                      !o.ativo && 'bg-muted/40 opacity-70'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {o.ordem}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={o.ativo}
                          onChange={(e) => alterarOpcao(i, 'ativo', e.target.checked)}
                          className="size-3.5 accent-[var(--brand-laranja)]"
                        />
                        ativa
                      </label>
                      <span className="min-w-0 flex-1" />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        aria-label={`Subir a opção ${o.ordem}`}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => mover(i, 1)}
                        disabled={i === opcoes.length - 1}
                        aria-label={`Descer a opção ${o.ordem}`}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon-xs"
                        onClick={() => remover(i)}
                        aria-label={`Remover a opção ${o.ordem}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <div className="mt-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <label htmlFor={`op-titulo-${i}`} className="text-xs font-medium">
                          Título do botão
                        </label>
                        <Contador atual={o.titulo.length} limite={LIMITE_TITULO_BOTAO} />
                      </div>
                      <Input
                        id={`op-titulo-${i}`}
                        value={o.titulo}
                        onChange={(e) => {
                          alterarOpcao(i, 'titulo', e.target.value)
                          // `botao_id` é o slug estável que vai para
                          // `clientes.ultimo_servico`; derivar do título só
                          // enquanto ele ainda está vazio evita trocar a
                          // identidade de uma opção já usada em conversas.
                          if (o.botao_id.startsWith('opcao_')) {
                            const s = slug(e.target.value)
                            if (s) alterarOpcao(i, 'botao_id', s)
                          }
                        }}
                        aria-invalid={o.titulo.length > LIMITE_TITULO_BOTAO}
                        placeholder="Ex.: Banho e tosa"
                        className="mt-1"
                      />
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        id: {o.botao_id}
                      </p>
                    </div>

                    <div className="mt-2.5">
                      <CampoTexto
                        id={`op-resposta-${i}`}
                        rotulo="Resposta"
                        valor={o.resposta}
                        limite={LIMITE_CORPO}
                        linhas={3}
                        onChange={(v) => alterarOpcao(i, 'resposta', v)}
                      />
                    </div>

                    <ListaErros erros={errosOpcoes[i] ?? []} />
                  </div>
                ))}

                <Button variant="outline" onClick={adicionar}>
                  <Plus />
                  Nova opção
                </Button>

                {/* O degrau, dito antes de ser descoberto na prática. */}
                <p className="rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  Até {MAX_REPLY_BUTTONS} opções ativas o WhatsApp mostra botões
                  lado a lado. Da {MAX_REPLY_BUTTONS + 1}ª em diante ele obriga o
                  formato de lista — a Meta recusa a mensagem com{' '}
                  {MAX_REPLY_BUTTONS + 1} botões, e recusada significa cliente sem
                  resposta. Acima de {MAX_ITENS_LISTA} ativas, só as{' '}
                  {MAX_ITENS_LISTA} primeiras são enviadas.
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={totalErros > 0}>Salvar</Button>
              <p className="text-xs text-muted-foreground">
                {totalErros > 0
                  ? `${totalErros} ${totalErros === 1 ? 'problema impede' : 'problemas impedem'} o salvamento.`
                  : 'Nesta versão, salvar vale só até recarregar a página.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── peças ──────────────────────────────────────────────────────────────────

function Contador({ atual, limite }: { atual: number; limite: number }) {
  const estourou = atual > limite
  return (
    <span
      className={cn(
        'font-mono text-[11px]',
        estourou ? 'font-semibold text-destructive' : 'text-muted-foreground'
      )}
    >
      {atual}/{limite}
    </span>
  )
}

function ListaErros({ erros }: { erros: string[] }) {
  if (erros.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {erros.map((e) => (
        <li key={e} className="text-[11px] text-destructive">
          {e}
        </li>
      ))}
    </ul>
  )
}

type CampoTextoProps = {
  id: string
  rotulo: string
  descricao?: string
  valor: string
  limite: number
  linhas: number
  onChange: (valor: string) => void
}

function CampoTexto({
  id,
  rotulo,
  descricao,
  valor,
  limite,
  linhas,
  onChange,
}: CampoTextoProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {rotulo}
        </label>
        <Contador atual={valor.length} limite={limite} />
      </div>
      <textarea
        id={id}
        value={valor}
        rows={linhas}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={valor.length > limite}
        className={cn(
          'mt-1 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
          valor.length > limite
            ? 'border-destructive ring-2 ring-destructive/20'
            : 'border-border focus-visible:border-ring'
        )}
      />
      {descricao && <p className="mt-1 text-[11px] text-muted-foreground">{descricao}</p>}
    </div>
  )
}

type PreviewProps = {
  menu: ReturnType<typeof montarMenu>['menu']
  erroMenu: string | undefined
  ativas: number
  fecho: string
}

/**
 * Preview do que a Meta vai renderizar.
 *
 * Desenhado a partir do `BotMenu` que `montarMenu` devolveu — não de um palpite
 * sobre o estado do formulário. Se o formato mudar de botão para lista, é porque
 * a função mudou, e o envio real mudaria igual.
 */
function Preview({ menu, erroMenu, ativas, fecho }: PreviewProps) {
  return (
    <Card className="xl:sticky xl:top-5">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-lg">Como o cliente vê</span>
          {menu && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amarelo/60 bg-amarelo/25 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {menu.formato === 'button' ? (
                <>
                  <MousePointerClick aria-hidden className="size-3" /> botões
                </>
              ) : (
                <>
                  <List aria-hidden className="size-3" /> lista
                </>
              )}
            </span>
          )}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {ativas} {ativas === 1 ? 'opção ativa' : 'opções ativas'} ·{' '}
          {ativas <= MAX_REPLY_BUTTONS
            ? `até ${MAX_REPLY_BUTTONS} caberiam em botões`
            : `acima de ${MAX_REPLY_BUTTONS} a Meta obriga lista`}
        </p>
      </CardHeader>

      <CardContent>
        {erroMenu && (
          <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            {erroMenu}
          </p>
        )}

        {menu === null ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/60 px-3 py-6 text-center text-xs text-muted-foreground">
            Sem opção ativa o bot não tem o que enviar — ele fica calado e o
            atendimento começa direto com uma pessoa.
          </p>
        ) : (
          <div className="chat-wallpaper rounded-xl p-3">
            <div
              className="max-w-[18rem] rounded-xl px-3 py-2 shadow-sm"
              style={{ background: 'var(--chat-bubble-out)' }}
            >
              <p className="text-sm whitespace-pre-wrap">{menu.corpo}</p>
              {menu.rodape && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">{menu.rodape}</p>
              )}

              {menu.formato === 'button' ? (
                <div className="mt-2 space-y-1">
                  {menu.botoes.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-center text-xs font-medium text-laranja-escuro"
                    >
                      {b.titulo}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="mt-2 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-xs font-medium text-laranja-escuro">
                    ☰ {menu.rotulo}
                  </div>
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                    {menu.itens.map((it) => (
                      <li key={it.id} className="px-2 py-1.5 text-xs">
                        {it.titulo}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    No celular esta parte abre numa folha, depois de tocar no
                    botão acima.
                  </p>
                </>
              )}
            </div>

            {/* O fecho é a segunda mensagem do fluxo: sai junto com a resposta
                da opção escolhida. Mostrar só o menu esconderia metade do que o
                cliente recebe. */}
            {fecho.trim() !== '' && (
              <div
                className="mt-2 max-w-[18rem] rounded-xl px-3 py-2 shadow-sm"
                style={{ background: 'var(--chat-bubble-out)' }}
              >
                <p className="text-[11px] text-muted-foreground">
                  depois da escolha, junto com a resposta:
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{fecho}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
