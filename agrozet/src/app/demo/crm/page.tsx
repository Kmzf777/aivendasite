import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import ConversationsDemo from '@/components/demo/ConversationsDemo'

export const metadata: Metadata = {
  title: 'Modo demo · Conversas · CRM Agrozet',
  description:
    'Demonstração da tela de atendimento do CRM Agrozet com conversas fictícias. Nada é enviado.',
  // Rota pública de demonstração com dados fictícios: não é conteúdo para
  // buscador indexar nem para aparecer em resultado como se fosse o produto.
  robots: { index: false, follow: false },
}

/**
 * `/demo/crm` — a tela de conversas rodando com os dados de
 * `src/lib/demo/dados.ts`.
 *
 * POR QUE UMA ROTA PARALELA, e não `/conversas` com um modo demo: esta rota é
 * PÚBLICA de propósito, para a dona do pet shop abrir no celular sem login. Se o
 * demo reaproveitasse a tela autenticada ou dependesse de uma variável de
 * ambiente para decidir entre dado fake e dado real, um `.env` errado no deploy
 * abriria o CRM de verdade — com conversas de clientes reais — na internet.
 * Caminho separado, dado separado, zero acoplamento com a autenticação.
 *
 * Não há Sidebar aqui: a Sidebar depende de sessão (`useIsAdmin`, logout) e numa
 * rota sem login ela só mostraria menus que não abrem. A navegação do demo é o
 * banner abaixo.
 *
 * PENDÊNCIA DE INFRA (não resolvida neste arquivo): o `matcher` de
 * `middleware.ts` casa tudo que não está na lista de exclusões, então `/demo` e
 * `/demo/crm` hoje são redirecionadas para `/login`. Excluir `demo` do matcher é
 * mudança em arquivo de produção e foi deixada para o responsável pelo
 * middleware.
 */
export default function DemoCrmPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Banner inequívoco, e fixo no topo do layout (não rola com a conversa):
          ninguém pode confundir esta tela com o atendimento real, nem achar que
          respondeu de verdade a um cliente. */}
      <header className="z-30 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-vermelho/30 bg-amarelo/30 px-4 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold tracking-wide text-vermelho uppercase">
          <FlaskConical aria-hidden className="size-3.5" />
          Modo demo
        </span>
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-secondary-foreground sm:text-xs">
          Conversas, nomes, telefones e pets são <strong className="font-semibold">fictícios</strong>.
          Nada é enviado por WhatsApp e nada é salvo — o que você escrever aqui existe só nesta
          aba, até recarregar a página.
        </p>
        <Link
          href="/demo"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-vermelho/30 bg-card px-2.5 py-1 text-xs font-semibold text-laranja-escuro hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Voltar à apresentação
        </Link>
      </header>

      <main className="min-h-0 flex-1">
        <ConversationsDemo />
      </main>
    </div>
  )
}
