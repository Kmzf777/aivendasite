'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Abertura da página de demonstração.
//
// É client component por um motivo só: o botão primário rola até o simulador
// com `scrollIntoView`, respeitando `prefers-reduced-motion`. Sem JS o <a>
// continua funcionando como âncora normal — o botão nunca fica morto.

const ID_SIMULADOR = 'simulador'

export default function HeroDemo() {
  function rolarAteSimulador(evento: React.MouseEvent<HTMLElement>) {
    const alvo = document.getElementById(ID_SIMULADOR)
    if (!alvo) return // sem alvo, deixa o href fazer o salto padrão
    evento.preventDefault()
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    alvo.scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'start' })
    // Move o foco também: quem navega por teclado ou leitor de tela precisa
    // chegar na seção, não só ver a página deslizar.
    alvo.focus({ preventScroll: true })
  }

  return (
    <header className="grain relative isolate overflow-hidden">
      {/* Mancha creme orgânica atrás do conteúdo, como no site da loja. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 -z-10 h-[26rem] w-[26rem] rounded-full bg-accent/70 blur-3xl sm:-right-20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-28 -z-10 h-72 w-72 rounded-full bg-secondary blur-2xl"
      />

      <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20">
        <Image
          src="/agrozet-logo.png"
          alt="Pet Shop Agrozet"
          width={391}
          height={120}
          priority
          className="reveal-rise h-auto w-[150px] sm:w-[190px]"
        />

        <p
          className="reveal-rise mt-9 inline-flex items-center gap-2 rounded-full border border-laranja/35 bg-secondary px-3 py-1 text-[0.7rem] font-bold tracking-[0.16em] text-laranja-escuro uppercase"
          style={{ animationDelay: '80ms' }}
        >
          Demonstração do sistema
        </p>

        <h1
          className="reveal-rise mt-5 max-w-[22ch] text-[2.1rem] leading-[1.06] font-semibold text-balance sm:text-6xl"
          style={{ animationDelay: '160ms' }}
        >
          Ninguém mais fica{' '}
          <span className="relative inline-block">
            <span
              aria-hidden="true"
              className="absolute inset-x-[-0.08em] bottom-[0.1em] h-[0.3em] rounded-full bg-amarelo/75"
              style={{ transform: 'rotate(-0.8deg)' }}
            />
            <span className="relative">sem resposta</span>
          </span>{' '}
          no WhatsApp da loja.
        </h1>

        <p
          className="reveal-rise mt-6 max-w-[46ch] text-base leading-relaxed text-muted-foreground sm:text-lg"
          style={{ animationDelay: '240ms' }}
        >
          Quando um cliente manda mensagem, o sistema recebe na hora, pergunta o
          que ele precisa e já responde o básico — de manhã, de noite ou no meio
          do banho de um cachorro. Depois a conversa aparece na tela da
          atendente, com o assunto já etiquetado.
        </p>

        <div
          className="reveal-rise mt-9 flex flex-wrap items-center gap-3"
          style={{ animationDelay: '320ms' }}
        >
          <Button
            render={<a href={`#${ID_SIMULADOR}`} />}
            onClick={rolarAteSimulador}
            className="h-12 rounded-full px-6 text-base font-semibold shadow-sm"
          >
            Experimentar o robô agora
          </Button>
          <Button
            variant="outline"
            render={<Link href="/demo/crm" />}
            className="h-12 rounded-full border-laranja/35 bg-transparent px-6 text-base font-semibold text-laranja-escuro hover:bg-secondary"
          >
            Ver o painel de atendimento
          </Button>
        </div>

        <p
          className="reveal-rise mt-10 max-w-[44ch] border-l-2 border-amarelo pl-4 text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: '400ms' }}
        >
          Tudo nesta página é de mentirinha no bom sentido: os clientes e as
          conversas são exemplos, mas o robô que responde ali embaixo é{' '}
          <strong className="font-semibold text-foreground">
            exatamente o mesmo
          </strong>{' '}
          que vai atender a loja.
        </p>
      </div>
    </header>
  )
}
