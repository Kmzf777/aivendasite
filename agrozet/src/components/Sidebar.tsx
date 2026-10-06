'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  LogOut,
  MessageSquare,
  Send,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { MODO_MOCK } from '@/lib/mock/modo'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Rota ainda não implementada: link renderizado apagado, com title="Em breve". */
  soon?: boolean
  adminOnly?: boolean
}

// Na Fase 1 só /conversas existe. Os outros itens já estão aqui, DESABILITADOS,
// de propósito: quando a Fase 2 criar as telas, basta remover o `soon` — nenhum
// outro agente precisa editar este arquivo para "adicionar o link".
//
// MODO_MOCK: com a flag ligada as quatro telas existem (em memória), então o
// `soon` é ignorado e os quatro viram link de verdade — ver `desabilitado`.
const navItems: NavItem[] = [
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/clientes', label: 'Clientes', icon: Users, soon: true },
  { href: '/disparos', label: 'Disparos', icon: Send, soon: true },
  { href: '/bot', label: 'Bot', icon: Bot, soon: true, adminOnly: true },
  { href: '/erros', label: 'Erros', icon: TriangleAlert, soon: true, adminOnly: true },
]

// Linha de navegação: altura de 36px, raio médio, sem sombra nem gradiente. É a
// mesma métrica do item de menu do shadcn — densidade de ferramenta, não de
// landing page.
const itemBase =
  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  // isAdmin cai para false enquanto carrega; usamos isLoading para NÃO renderizar
  // os itens admin antes de resolver — senão eles apareceriam e desapareceriam.
  //
  // MODO_MOCK: `useIsAdmin` lê `auth.getUser()` do Supabase e com a flag ligada
  // não há sessão nem projeto — ele resolveria para `false` e esconderia Bot e
  // Erros, justamente as telas que a flag existe para destravar. A correção fica
  // AQUI, sobre o resultado do hook, porque `src/hooks/useIsAdmin.ts` não é
  // deste escopo; o hook continua sendo chamado (nada de hook condicional) e
  // com a flag desligada seu resultado é usado como sempre.
  const admin = useIsAdmin()
  const isAdmin = MODO_MOCK ? true : admin.isAdmin
  const isLoading = MODO_MOCK ? false : admin.isLoading

  async function handleLogout() {
    // MODO_MOCK: não há sessão para encerrar, e `getSupabaseBrowserClient()`
    // lança sem as variáveis do projeto — sem esta guarda o botão "Sair"
    // quebraria em vez de navegar.
    if (!MODO_MOCK) await getSupabaseBrowserClient().auth.signOut()
    // Cache por usuário (identidade, conversas) não pode vazar para o próximo
    // login nesta mesma aba.
    queryClient.clear()
    router.replace('/login')
    router.refresh()
  }

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || (!isLoading && isAdmin)
  )

  return (
    // Em tela estreita a sidebar vira trilha de ícones (w-14): com 240px fixos
    // ela sozinha comeria dois terços de um celular de 375px e a conversa
    // ganharia scroll horizontal.
    <aside className="flex h-full w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-60">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-2 md:px-4">
        <Image
          src="/agrozet-logo.png"
          alt="Pet Shop Agrozet"
          width={391}
          height={120}
          priority
          className="h-auto w-full max-w-[120px] object-contain"
        />
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`)

          // Com a flag ligada as telas existem: o item deixa de ser "em breve".
          const desabilitado = item.soon && !MODO_MOCK

          if (desabilitado) {
            return (
              <span
                key={item.href}
                title="Em breve"
                aria-disabled="true"
                className={cn(itemBase, 'cursor-not-allowed opacity-40')}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="hidden flex-1 truncate md:block">{item.label}</span>
                <span className="hidden text-[10px] tracking-wide uppercase md:block">
                  em breve
                </span>
              </span>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              className={cn(
                itemBase,
                // Único lugar da sidebar onde o laranja da marca aparece. O par
                // sidebar-primary / sidebar-primary-foreground é o que garante
                // o contraste do rótulo sobre ele.
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="hidden flex-1 truncate md:block">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={handleLogout}
          title="Sair"
          className={cn(
            itemBase,
            'w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <LogOut aria-hidden className="size-4 shrink-0" />
          <span className="hidden flex-1 truncate text-left md:block">Sair</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
