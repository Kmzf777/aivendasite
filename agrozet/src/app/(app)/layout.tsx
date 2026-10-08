import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { MODO_MOCK } from '@/lib/mock/modo'
import { getSupabaseServerClient } from '@/lib/supabase-server'

// Segunda tranca, de propósito redundante com o middleware.
// O middleware já redireciona quem não tem sessão, mas ele depende de um
// `matcher` correto — um regex mal editado desliga a proteção de uma rota
// inteira sem erro nenhum. Server Component que confia SÓ no middleware é
// padrão conhecido de vazamento de dados; por isso a sessão é reconferida aqui,
// no servidor, antes de qualquer filho renderizar.
//
// MODO MOCK: a checagem inteira é PULADA, e o Supabase não é nem construído
// (sem as variáveis do projeto, `getSupabaseServerClient()` lança — chamar só
// para descartar o resultado trocaria o redirect por um 500). A flag é
// `NEXT_PUBLIC_MOCK === '1'` e, estando ausente, as duas trancas continuam
// exatamente como antes.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!MODO_MOCK) {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
