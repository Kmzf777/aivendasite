// Layout mínimo das rotas de autenticação: só centraliza o conteúdo sobre o
// fundo neutro do sistema. Sem Sidebar — quem está aqui ainda não tem sessão.
// Sem decoração: é a mesma superfície do CRM, não uma capa de landing page.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
