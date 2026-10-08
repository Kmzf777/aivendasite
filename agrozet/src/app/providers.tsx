'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// O QueryClient nasce no state para não ser compartilhado entre requisições no
// SSR — um client no módulo vazaria cache de um usuário para outro.
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Rede de segurança do Realtime, não duplicação dele: um socket morto
            // não avisa ninguém, e sem isto a tela só voltava a andar com F5. Com
            // staleTime de 2 min, alternar de aba rapidamente não refaz nada — só o
            // foco depois de um intervalo real, que é justamente quando a atendente
            // volta para a tela e precisa ver o que chegou.
            refetchOnWindowFocus: true,
            staleTime: 120_000,
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
