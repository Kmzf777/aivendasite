import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Não colocar lógica entre createServerClient e getUser — quebra o refresh do token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Redirect preservando os cookies que getUser() acabou de rotacionar.
    // Sem isso, o refresh token novo escrito em supabaseResponse é descartado e o
    // browser reenvia o token antigo já invalidado ("Refresh Token Not Found").
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  return supabaseResponse
}

export const config = {
  // ATENÇÃO antes de "simplificar" este regex — cada exclusão existe por um motivo:
  //
  // • `api/webhook` — a Meta (WhatsApp Cloud API) chama essa rota servidor-a-servidor
  //   e NÃO manda cookie de sessão. Se o middleware rodar ali, ela recebe um 3xx/401,
  //   considera a entrega falha e reentrega a mensagem em loop. É o bug mais caro
  //   possível neste projeto: webhook fora do ar + fila de reentrega da Meta.
  // • `api/cron` — o pg_cron do Supabase chama por HTTP com `Authorization: Bearer`
  //   (CRON_SECRET), também sem cookie. A própria rota valida o segredo; sessão aqui
  //   só derrubaria o agendamento.
  // • `login` — a página de login é o destino do redirect deste middleware. Se ela
  //   estivesse no matcher, visitante sem sessão entraria em redirect infinito.
  // • `demo` — a área de demonstração (`/demo` e `/demo/crm`), pública DE
  //   PROPÓSITO: é o que se mostra à dona do petshop antes de existir projeto
  //   Supabase. Ela não lê nem escreve nada real — roda sobre `src/lib/demo/`,
  //   que é só dado fake em memória, e sobre a lógica PURA de `src/lib/bot.ts`.
  //   É por isso que o demo é uma rota SEPARADA em vez de um "modo" dentro de
  //   `/conversas`: um modo ligado por variável de ambiente abriria o CRM real
  //   se alguém esquecesse a variável num deploy. Aqui o que é público é
  //   público por construção, e o que é privado nunca deixa de ser.
  //   NUNCA faça o demo importar de `src/app/api/`, `src/hooks/` ou dos
  //   clientes Supabase — é essa fronteira que torna seguro deixar a rota
  //   aberta.
  // • `_next/static`, `_next/image`, `favicon.ico` e arquivos estáticos — não têm
  //   sessão para renovar e só gastariam uma chamada ao Supabase por asset.
  matcher: [
    '/((?!api/webhook|api/cron|login|demo|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)',
  ],
}
