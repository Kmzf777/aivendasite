'use client'

// O celular na tela: a peça do demo que a dona do Pet Shop Agrozet toca.
//
// O QUE ELE NÃO É: uma maquete. Os reply buttons aqui não são figuras. Cada
// toque entra em `src/lib/demo/simulador.ts`, que chama `decidirBot` de
// `src/lib/bot.ts` — a MESMA função pura que o webhook de produção chama, com as
// mesmas duas guardas e o mesmo texto de resposta. Nada aqui faz fetch, nada
// toca Supabase, nada precisa de número aprovado na Meta. É por isso que o demo
// existe antes da infraestrutura.
//
// O relógio: ver DECISÃO 1 no cabeçalho de `simulador.ts`. Este componente é o
// "quem chama" de lá. Ele mantém um relógio VIRTUAL que avança
// `PASSO_DE_TURNO_MS` por turno do cliente, para que a janela de leitura de 10 s
// não cale o bot só porque o demo comprime a conversa. A exceção é deliberada:
// mensagem enviada ENQUANTO o bot ainda está digitando não avança o turno, cai
// no mesmo instante simulado e leva a janela de leitura a calar o bot de
// verdade — o caso real da frase quebrada em três balões.
//
// O silêncio: ver DECISÃO 2. Quando o bot não responde, `Passo.silencio` traz o
// motivo e ele aparece FORA da conversa, num aviso discreto abaixo do celular —
// nunca como balão, porque no WhatsApp real o cliente não veria nada. O silêncio
// é feature; o que seria bug é o silêncio inexplicado.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ArrowLeft,
  BatteryFull,
  CheckCheck,
  Info,
  Lock,
  MoreVertical,
  PawPrint,
  Phone,
  Plus,
  RotateCcw,
  SendHorizontal,
  Signal,
  Smile,
  Video,
  Wifi,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BotMenu } from '@/lib/bot'
import {
  PASSO_DE_TURNO_MS,
  digitarTexto,
  estadoInicial,
  menuAtual,
  reiniciar,
  tocarBotao,
  type EstadoSimulador,
  type Fala,
} from '@/lib/demo/simulador'

/** Atraso do "digitando…" antes de cada fala do bot. Sem ele a resposta aparece
 *  instantânea e a ilusão de WhatsApp morre. Zerado em `reduced motion`. */
const ATRASO_DIGITANDO_MS = 750

type Props = {
  /** Texto do convite inicial. O default já funciona sozinho. */
  primeiraMensagem?: string
  className?: string
}

function horaDe(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const CONSULTA_REDUZIDO = '(prefers-reduced-motion: reduce)'

/**
 * `prefers-reduced-motion`, lido como fonte externa.
 *
 * `useSyncExternalStore` e não `useState` + efeito: o snapshot do servidor é
 * explícito (`false`, sem animação suposta antes da hidratação) e não há
 * `setState` dentro de efeito, que o ESLint do React 19 recusa por causar
 * renderização em cascata.
 */
function useMovimentoReduzido(): boolean {
  return useSyncExternalStore(
    (notificar) => {
      const mq = window.matchMedia(CONSULTA_REDUZIDO)
      mq.addEventListener('change', notificar)
      return () => mq.removeEventListener('change', notificar)
    },
    () => window.matchMedia(CONSULTA_REDUZIDO).matches,
    () => false
  )
}

/**
 * Hora do relógio do aparelho. O snapshot do servidor é `--:--` de propósito: a
 * hora do servidor não é a hora de quem está olhando, e renderizar uma e trocar
 * pela outra é erro de hidratação.
 */
function useHoraDoCelular(): string {
  return useSyncExternalStore(
    (notificar) => {
      const id = setInterval(notificar, 15_000)
      return () => clearInterval(id)
    },
    () => horaDe(Date.now()),
    () => '--:--'
  )
}

/**
 * Reply buttons como o WhatsApp os desenha: empilhados sob o balão, cada um numa
 * faixa separada por linha, rótulo centralizado na cor de ação.
 *
 * `ativo = false` desenha o menu antigo apagado, que é o que o WhatsApp faz
 * depois que a escolha foi feita — e é honesto: `menuAtual()` já devolveu `null`,
 * então um toque ali não seria respondido mesmo.
 */
function BotoesDoMenu({
  menu,
  ativo,
  onEscolher,
}: {
  menu: BotMenu
  ativo: boolean
  onEscolher: (id: string) => void
}) {
  const itens = menu.formato === 'button' ? menu.botoes : menu.itens

  return (
    <div className="mt-2 -mx-3 -mb-2 border-t border-foreground/10">
      {/* O demo tem 3 opções ⇒ `button`. O caminho `list` existe porque o menu é
          editável: a 4ª opção vira list message na Meta. */}
      {menu.formato === 'list' && (
        <p className="px-3 pt-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {menu.rotulo}
        </p>
      )}
      {itens.map((item, i) => (
        <button
          key={item.id}
          type="button"
          disabled={!ativo}
          onClick={() => onEscolher(item.id)}
          className={cn(
            'block w-full px-3 py-2 text-center text-[13px] font-semibold transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
            i > 0 && 'border-t border-foreground/10',
            ativo
              ? 'text-laranja-escuro hover:bg-foreground/5 active:bg-foreground/10'
              : 'cursor-not-allowed text-muted-foreground/60'
          )}
        >
          {item.titulo}
        </button>
      ))}
    </div>
  )
}

function Balao({
  fala,
  menu,
  menuAtivo,
  onEscolher,
  animar,
}: {
  fala: Fala
  menu: BotMenu | null
  menuAtivo: boolean
  onEscolher: (id: string) => void
  animar: boolean
}) {
  // A tela simulada é a do CLIENTE, não a do atendente: logo a fala do cliente
  // vai à direita (é "minha") e a do bot à esquerda. No CRM é o inverso, e é por
  // isso que este componente não reusa `MessageBubble`.
  const meu = fala.quem === 'cliente'

  return (
    <div className={cn('flex w-full', meu ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] min-w-0 rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm',
          meu ? 'rounded-br-md' : 'rounded-bl-md border border-border',
          animar && 'reveal-rise'
        )}
        style={{
          background: meu ? 'var(--chat-bubble-out)' : 'var(--chat-bubble-in)',
          color: 'var(--foreground)',
        }}
      >
        <p className="break-words whitespace-pre-wrap">{fala.texto}</p>

        {menu?.rodape && (
          <p className="mt-1 text-[10px] text-muted-foreground">{menu.rodape}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">
            {horaDe(fala.emMs)}
          </span>
          {/* Lido: no WhatsApp o duplo-check azul é do que EU mandei. */}
          {meu && <CheckCheck className="size-3.5 text-[var(--chat-check)]" />}
        </div>

        {menu && (
          <BotoesDoMenu menu={menu} ativo={menuAtivo} onEscolher={onEscolher} />
        )}
      </div>
    </div>
  )
}

function Digitando() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border px-3 py-2.5 shadow-sm"
        style={{ background: 'var(--chat-bubble-in)' }}
      >
        <span className="sr-only">Pet Shop Agrozet está digitando</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full"
            style={{ animationDelay: `${i * 140}ms`, background: 'var(--ink-faint)' }}
          />
        ))}
      </div>
    </div>
  )
}

export default function SimuladorWhatsApp({
  primeiraMensagem = 'oi, boa tarde',
  className,
}: Props) {
  const [estado, setEstado] = useState<EstadoSimulador>(() => estadoInicial())
  // Revelação progressiva: o estado do motor é a verdade, mas as falas do bot só
  // entram na tela depois do "digitando…". Isso mantém o motor síncrono e puro —
  // o atraso é problema da UI, não da lógica.
  const [revelados, setRevelados] = useState(0)
  const [rascunho, setRascunho] = useState('')

  const reduzido = useMovimentoReduzido()
  const horaStatus = useHoraDoCelular()
  const atraso = reduzido ? 0 : ATRASO_DIGITANDO_MS

  const baseMs = useRef<number>(0)
  const turno = useRef(0)
  const rolagem = useRef<HTMLDivElement>(null)

  const pendente = revelados < estado.falas.length
  const proxima = pendente ? estado.falas[revelados] : null
  // `digitando` é DERIVADO, não guardado: é exatamente "a próxima fala a revelar
  // é do bot". Guardar em `useState` exigiria setState dentro de efeito, que é
  // justo o que gera renderização em cascata.
  const digitando = proxima?.quem === 'bot'

  /**
   * O relógio virtual. Avança um turno por mensagem do cliente, EXCETO quando
   * ainda há fala do bot por revelar — aí é o "mesmo beat", e a janela de
   * leitura de 10 s entra em ação de propósito.
   */
  const agoraSimulado = useCallback((mesmoBeat: boolean) => {
    if (baseMs.current === 0) baseMs.current = Date.now()
    if (!mesmoBeat) turno.current += 1
    return baseMs.current + turno.current * PASSO_DE_TURNO_MS
  }, [])

  // Revela uma fala por vez; a do bot vem depois do "digitando…".
  useEffect(() => {
    if (!proxima) return
    const id = setTimeout(
      () => setRevelados((r) => r + 1),
      proxima.quem === 'bot' ? atraso : 0
    )
    return () => clearTimeout(id)
  }, [proxima, atraso])

  // Rolagem automática para a última mensagem.
  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: reduzido ? 'auto' : 'smooth' })
  }, [revelados, digitando, reduzido])

  const enviarTexto = useCallback(
    (texto: string) => {
      const limpo = texto.trim()
      if (!limpo) return
      setEstado((e) => digitarTexto(e, limpo, agoraSimulado(revelados < e.falas.length)).estado)
      setRascunho('')
    },
    [agoraSimulado, revelados]
  )

  const escolher = useCallback(
    (botaoId: string) => {
      setEstado((e) => tocarBotao(e, botaoId, agoraSimulado(revelados < e.falas.length)).estado)
    },
    [agoraSimulado, revelados]
  )

  const recomecar = useCallback(() => {
    setEstado((e) => reiniciar(e))
    setRevelados(0)
    setRascunho('')
    turno.current = 0
    baseMs.current = Date.now()
  }, [])

  const visiveis = useMemo(() => estado.falas.slice(0, revelados), [estado.falas, revelados])
  const menuVivo = menuAtual(estado)
  // O aviso de silêncio só aparece quando a conversa terminou de se desenrolar —
  // avisar no meio da revelação explicaria algo que a tela ainda não mostrou.
  const silencio = pendente || digitando ? null : estado.silencio

  return (
    <div className={cn('mx-auto w-full max-w-[400px] px-4', className)}>
      {/* ── O aparelho ─────────────────────────────────────────────── */}
      <div className="rounded-[2.2rem] border-[7px] border-[#1c0d05] bg-[#1c0d05] shadow-[0_18px_50px_-18px_rgba(43,18,6,0.55)]">
        <div className="overflow-hidden rounded-[1.7rem] bg-background">
          {/* Barra de status */}
          <div className="flex items-center justify-between bg-[#075e54] px-4 pt-1.5 pb-1 text-[10px] font-semibold text-white/90">
            <span className="font-mono tabular-nums">{horaStatus || '--:--'}</span>
            <div className="flex items-center gap-1" aria-hidden="true">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryFull className="size-3.5" />
            </div>
          </div>

          {/* Topo do WhatsApp */}
          <div className="flex items-center gap-2 bg-[#075e54] px-2.5 pb-2 text-white">
            <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden="true" />
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--brand-laranja)' }}
              aria-hidden="true"
            >
              <PawPrint className="size-4" style={{ color: 'var(--ink)' }} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold">Pet Shop Agrozet</p>
              <p className="truncate text-[10px] text-white/70">
                {digitando ? 'digitando…' : 'online'}
              </p>
            </div>
            <div className="flex items-center gap-2.5 opacity-80" aria-hidden="true">
              <Video className="size-4" />
              <Phone className="size-4" />
              <MoreVertical className="size-4" />
            </div>
          </div>

          {/* ── A conversa ───────────────────────────────────────────── */}
          <div
            ref={rolagem}
            className="chat-wallpaper scroll-soft h-[58vh] max-h-[460px] min-h-[320px] space-y-2 overflow-y-auto overflow-x-hidden p-3"
            role="log"
            aria-live="polite"
            aria-label="Conversa do WhatsApp com o Pet Shop Agrozet"
          >
            <p className="mx-auto flex w-fit items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-center text-[10px] text-muted-foreground">
              <Lock className="size-2.5" aria-hidden="true" />
              Simulação — roda a lógica real do bot, sem enviar nada
            </p>

            {visiveis.length === 0 && !digitando && (
              <div className="flex h-[70%] flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mande a primeira mensagem, como um cliente faria.
                </p>
                <Button type="button" onClick={() => enviarTexto(primeiraMensagem)}>
                  Mandar “{primeiraMensagem}”
                </Button>
                <p className="text-[11px] text-muted-foreground/80">
                  ou escreva o que quiser no campo abaixo
                </p>
              </div>
            )}

            {visiveis.map((fala) => (
              <Balao
                key={fala.id}
                fala={fala}
                menu={fala.menu ?? null}
                menuAtivo={!!fala.menu && fala.menu === menuVivo}
                onEscolher={escolher}
                animar={!reduzido}
              />
            ))}

            {digitando && <Digitando />}
          </div>

          {/* ── Composer ─────────────────────────────────────────────── */}
          <form
            className="flex items-center gap-1.5 border-t border-border bg-[var(--chat-surface)] p-2"
            onSubmit={(e) => {
              e.preventDefault()
              enviarTexto(rascunho)
            }}
          >
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label className="sr-only" htmlFor="simulador-mensagem">
              Escreva uma mensagem para o Pet Shop Agrozet
            </label>
            <input
              id="simulador-mensagem"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              placeholder="Mensagem"
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Smile className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={rascunho.trim().length === 0}
              aria-label="Enviar mensagem"
            >
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* ── Fora do aparelho: o que o cliente NÃO veria ──────────────── */}
      <div className="mt-3 space-y-3">
        {silencio && (
          <div
            className="reveal-rise flex gap-2 rounded-lg border border-border bg-card p-3 text-[12px] leading-snug text-muted-foreground"
            role="status"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-laranja-escuro"
              aria-hidden="true"
            />
            <p>
              <span className="font-semibold text-foreground">
                O bot ficou em silêncio de propósito.
              </span>{' '}
              {silencio.texto}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {estado.servicoEscolhido
              ? 'Escolha registrada — no CRM esta conversa já aparece etiquetada.'
              : 'Toque nos botões: é o bot de verdade decidindo.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={recomecar}
            disabled={estado.falas.length === 0}
          >
            <RotateCcw className="size-3.5" />
            Recomeçar
          </Button>
        </div>
      </div>
    </div>
  )
}
