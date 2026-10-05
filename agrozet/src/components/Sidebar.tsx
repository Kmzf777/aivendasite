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
import { Separator } from '@/components/ui/separator'
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
const navItems: NavItem[] = [
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/clientes', label: 'Clientes', icon: Users, soon: true },
  { href: '/disparos', label: 'Disparos', icon: Send, soon: true },
  { href: '/bot', label: 'Bot', icon: Bot, soon: true, adminOnly: true },
  { href: '/erros', label: 'Erros', icon: TriangleAlert, soon: true, adminOnly: true },
]

const itemBase =
  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  // isAdmin cai para false enquanto carrega; usamos isLoading para NÃO renderizar
  // os itens admin antes de resolver — senão eles apareceriam e desapareceriam.
  const { isAdmin, isLoading } = useIsAdmin()

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut()
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
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-7 pb-5">
        <Image
          src="/agrozet-logo.png"
          alt="Pet Shop Agrozet"
          width={391}
          height={120}
          priority
          className="h-10 w-auto"
        />
        <p className="mt-3 text-[9px] tracking-[0.22em] uppercase opacity-50">
          Atendimento
        </p>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`)

          if (item.soon) {
            return (
              <span
                key={item.href}
                title="Em breve"
                aria-disabled="true"
                className={cn(itemBase, 'cursor-not-allowed opacity-35')}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[9px] tracking-wider uppercase opacity-80">
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
              className={cn(
                itemBase,
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            itemBase,
            'w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <LogOut className="size-4 shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
