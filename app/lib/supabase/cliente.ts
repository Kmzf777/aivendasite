"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente do navegador. Usa SÓ a anon key — ela é pública por desenho, e
// quem protege os dados é o RLS do banco, não o sigilo desta chave.
// A service_role NUNCA pode aparecer aqui: ela ignora RLS.
export function criarCliente() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Para a tela avisar com honestidade em vez de quebrar com erro de rede.
export function temCredenciais() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
