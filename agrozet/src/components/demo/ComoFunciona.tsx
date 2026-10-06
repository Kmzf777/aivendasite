import { BOT_OPCOES_DEMO } from '@/lib/demo/dados'

// Os três passos, contados do ponto de vista da dona da loja.
//
// Os assuntos do passo 2 saem de BOT_OPCOES_DEMO, que espelha o seed real do
// banco. Isso é de propósito: se a página listar um serviço que o menu do bot
// não tem, a cliente cobra depois — e com razão.

type Passo = {
  titulo: string
  texto: string
}

const PASSOS: Passo[] = [
  {
    titulo: 'O cliente manda mensagem',
    texto:
      'Ele usa o WhatsApp da loja, do jeito que já usa hoje. Não precisa baixar nada, não precisa link, não precisa aprender nada novo.',
  },
  {
    titulo: 'O robô pergunta e já responde',
    texto:
      'Em segundos ele manda uma saudação com os assuntos da loja em botões. O cliente toca em um e recebe a resposta na hora — às sete da manhã ou às onze da noite.',
  },
  {
    titulo: 'A conversa chega etiquetada',
    texto:
      'Na tela de atendimento a conversa aparece com o nome do cliente e o assunto que ele escolheu. Quem está no balcão já abre sabendo do que se trata.',
  },
]

export default function ComoFunciona() {
  return (
    <section
      aria-labelledby="como-funciona-titulo"
      className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24"
    >
      <p className="reveal-slide text-[0.7rem] font-bold tracking-[0.16em] text-laranja-escuro uppercase">
        Como funciona
      </p>
      <h2
        id="como-funciona-titulo"
        className="reveal-rise mt-3 max-w-[20ch] text-3xl leading-tight font-semibold text-balance sm:text-5xl"
        style={{ animationDelay: '80ms' }}
      >
        Três passos, e nenhum deles é seu.
      </h2>

      <ol className="mt-12 grid gap-10 sm:gap-12 md:grid-cols-3">
        {PASSOS.map((passo, i) => (
          <li
            key={passo.titulo}
            className="reveal-rise relative"
            style={{ animationDelay: `${160 + i * 110}ms` }}
          >
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="font-display text-5xl leading-none font-semibold text-laranja/35 sm:text-6xl"
              >
                {i + 1}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <h3 className="mt-4 text-lg leading-snug font-semibold sm:text-xl">
              {passo.titulo}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {passo.texto}
            </p>

            {/* Os assuntos reais do menu, ilustrando o passo 2. */}
            {i === 1 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {BOT_OPCOES_DEMO.filter((o) => o.ativo).map((opcao) => (
                  <li
                    key={opcao.botao_id}
                    className="rounded-full border border-laranja/25 bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
                  >
                    {opcao.titulo}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <p
        className="reveal-rise mt-12 max-w-[56ch] text-sm leading-relaxed text-muted-foreground"
        style={{ animationDelay: '500ms' }}
      >
        Se o cliente não quiser escolher nada e preferir escrever do jeito dele,
        o robô oferece o menu de novo uma vez e depois sai da frente — a conversa
        fica esperando a atendente, sem robô insistindo com o seu cliente.
      </p>
    </section>
  )
}
