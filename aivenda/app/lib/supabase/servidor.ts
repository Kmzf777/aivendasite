import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor, para Server Components e route handlers.
// Lê e escreve a sessão nos cookies.
export async function criarClienteServidor() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (lista) => {
          // Em Server Component puro isto lança: só route handler e Server
          // Action podem escrever cookie. O middleware ja renova a sessao,
          // entao engolir aqui e correto, nao preguica.
          try {
            lista.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}

export function temCredenciaisServidor() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
