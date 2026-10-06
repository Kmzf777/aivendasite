import Link from 'next/link'
import { Button } from '@/components/ui/button'
import CartoesNumeros from '@/components/demo/CartoesNumeros'
import ComoFunciona from '@/components/demo/ComoFunciona'
import HeroDemo from '@/components/demo/HeroDemo'
import SimuladorWhatsApp from '@/components/demo/SimuladorWhatsApp'

// Página que a dona do Pet Shop Agrozet abre (provavelmente no celular, com o
// dono do projeto do lado explicando). A ordem é deliberada: ela entende em uma
// frase, USA o robô, e só depois lê como funciona. A seção do simulador é a
// mais importante da página e por isso é a única em laranja cheio.

/** Toldo listrado com a barra recortada — a borda superior da seção laranja. */
const TOLDO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='24' viewBox='0 0 40 24'%3E%3Cpath d='M0 0H20V14A10 10 0 0 1 0 14Z' fill='%23fff3e7'/%3E%3Cpath d='M20 0H40V14A10 10 0 0 1 20 14Z' fill='%23ffc133'/%3E%3C/svg%3E\")"

const PRONTO = [
  'Atendimento automático por botões no WhatsApp da loja',
  'Tela de conversas, com as pendentes na frente da fila',
  'Etiqueta de assunto em cada conversa',
  'Cadastro do cliente pelo nome e telefone',
  'Fotos e áudios que o cliente manda chegando na tela',
]

const DEPOIS = [
  'Ficha do pet editável pela tela (hoje ela aparece, mas só de leitura)',
  'Mensagens agendadas — lembrete de banho, aviso de ração chegando',
  'Edição do menu do robô pela própria tela, sem precisar de ninguém',
]

export default function DemoPage() {
  return (
    <main>
      <HeroDemo />

      {/* ───────────────────── o simulador, em destaque ──────────────────── */}
      <section
        id="simulador"
        tabIndex={-1}
        aria-labelledby="simulador-titulo"
        className="bg-laranja text-foreground focus-visible:outline-none"
      >
        <div
          aria-hidden="true"
          className="h-[24px] w-full [background-position:center_top] [background-repeat:repeat-x] [background-size:40px_24px] sm:h-[36px] sm:[background-size:60px_36px]"
          style={{ backgroundImage: TOLDO }}
        />

        <div className="grain relative mx-auto w-full max-w-5xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24">
          <p className="reveal-slide text-[0.7rem] font-bold tracking-[0.16em] uppercase">
            Pode tocar — é de verdade
          </p>
          <h2
            id="simulador-titulo"
            className="reveal-rise mt-3 max-w-[24ch] text-3xl leading-tight font-semibold text-balance sm:text-5xl"
            style={{ animationDelay: '80ms' }}
          >
            Faça de conta que você é a sua cliente.
          </h2>
          <p
            className="reveal-rise mt-4 max-w-[48ch] text-[0.95rem] leading-relaxed sm:text-lg"
            style={{ animationDelay: '140ms' }}
          >
            Mande um &ldquo;oi&rdquo; no celular aí embaixo e toque nos botões
            que aparecerem. Quem responde é o mesmo robô que vai atender a loja —
            nada aqui é vídeo nem imagem parada.
          </p>

          <div
            className="reveal-rise relative z-10 mx-auto mt-10 w-full max-w-[26rem]"
            style={{ animationDelay: '220ms' }}
          >
            <SimuladorWhatsApp />
          </div>
        </div>
      </section>

      <ComoFunciona />
      <CartoesNumeros />

      {/* ──────────────────── o estado real do sistema ───────────────────── */}
      <section
        aria-labelledby="estado-titulo"
        className="border-y border-border bg-secondary/60"
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-[0.7rem] font-bold tracking-[0.16em] text-laranja-escuro uppercase">
            Onde o sistema está hoje
          </p>
          <h2
            id="estado-titulo"
            className="mt-3 max-w-[26ch] text-3xl leading-tight font-semibold text-balance sm:text-4xl"
          >
            O que já funciona e o que ainda vem.
          </h2>

          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-14">
            <div>
              <h3 className="text-base font-semibold">Já está pronto</h3>
              <ul className="mt-4 space-y-3">
                {PRONTO.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-[0.35rem] size-2 shrink-0 rounded-full bg-laranja"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-base font-semibold">Vem na próxima etapa</h3>
              <ul className="mt-4 space-y-3">
                {DEPOIS.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[0.3rem] size-2.5 shrink-0 rounded-full border border-dashed border-laranja/60"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Button
              nativeButton={false}
              render={<Link href="/demo/crm" />}
              className="h-12 rounded-full px-6 text-base font-semibold shadow-sm"
            >
              Ver o painel de atendimento
            </Button>
            <span className="text-sm text-muted-foreground">
              É a tela que a sua atendente usa no dia a dia.
            </span>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── rodapé ────────────────────────────── */}
      <footer className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-display text-base font-semibold">
          Pet Shop Agrozet{' '}
          <span aria-hidden="true" className="text-laranja-escuro">
            ·
          </span>{' '}
          Segismundo Pereira, Uberlândia
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Página de demonstração. Clientes, conversas e números são exemplos
          inventados para esta apresentação.
        </p>
      </footer>
    </main>
  )
}
