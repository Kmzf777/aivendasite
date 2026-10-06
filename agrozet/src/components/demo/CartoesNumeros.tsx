import { Card, CardContent } from '@/components/ui/card'
import { numerosDemo } from '@/lib/demo/dados'

// Os números das conversas de exemplo desta página.
//
// REGRA: todo rótulo aqui diz "no exemplo". Esses valores são derivados do seed
// de demonstração (seis conversas inventadas), não medição de uso real. Vender
// isso como resultado seria mentir para a cliente antes de ela assinar.

export default function CartoesNumeros() {
  const n = numerosDemo()

  const cartoes: { valor: number; rotulo: string }[] = [
    { valor: n.conversas, rotulo: 'conversas na caixa de entrada' },
    { valor: n.pendentes, rotulo: 'esperando resposta da atendente' },
    { valor: n.mensagens, rotulo: 'mensagens trocadas' },
    { valor: n.atendidasPeloBot, rotulo: 'vezes que o robô recebeu o cliente' },
    { valor: n.clientesCadastrados, rotulo: 'clientes com nome no cadastro' },
    { valor: n.pets, rotulo: 'pets conhecidos pelo sistema' },
  ]

  return (
    <section
      aria-labelledby="numeros-titulo"
      className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24"
    >
      <div className="max-w-[40ch]">
        <p className="reveal-slide text-[0.7rem] font-bold tracking-[0.16em] text-laranja-escuro uppercase">
          No exemplo que você acabou de ver
        </p>
        <h2
          id="numeros-titulo"
          className="reveal-rise mt-3 text-3xl leading-tight font-semibold text-balance sm:text-4xl"
          style={{ animationDelay: '80ms' }}
        >
          O que a tela de atendimento mostra
        </h2>
        <p
          className="reveal-rise mt-3 text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: '140ms' }}
        >
          Estes são os números das conversas de demonstração desta página — seis
          conversas que a gente inventou para você ver a tela cheia.{' '}
          <strong className="font-semibold text-foreground">
            Não é resultado de uso real
          </strong>
          , porque o sistema ainda não atendeu nenhum cliente de verdade.
        </p>
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {cartoes.map((c, i) => (
          <li key={c.rotulo}>
            <Card
              size="sm"
              className="reveal-rise h-full gap-0"
              style={{ animationDelay: `${180 + i * 60}ms` }}
            >
              <CardContent>
                <span className="font-display block text-4xl leading-none font-semibold text-laranja-escuro tabular-nums sm:text-5xl">
                  {c.valor}
                </span>
                <span className="mt-2 block text-xs leading-snug text-muted-foreground sm:text-sm">
                  {c.rotulo}
                </span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
