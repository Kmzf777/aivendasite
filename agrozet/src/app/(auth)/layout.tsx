// Layout mínimo das rotas de autenticação: só centraliza o conteúdo no fundo
// creme. Sem Sidebar — quem está aqui ainda não tem sessão.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grain flex min-h-screen flex-col items-center justify-center bg-secondary px-4 py-10">
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}
