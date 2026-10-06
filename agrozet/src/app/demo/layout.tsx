import type { Metadata } from 'next'

// Layout próprio da área de demonstração.
//
// A rota /demo é PÚBLICA de propósito: ela existe para ser aberta no celular da
// dona do petshop, sem login e sem Supabase. Por isso ela não usa o layout do
// grupo (app) — nada de Sidebar, nada de sessão, nada de hook que bata em
// banco. O <html>/<body>, as fontes (Fraunces + Karla) e os providers já vêm do
// layout raiz; aqui só embrulhamos a página numa superfície de papel.

export const metadata: Metadata = {
  title: 'CRM Agrozet — Demonstração',
  description:
    'Veja como o atendimento do Pet Shop Agrozet funciona no WhatsApp: o robô recebe o cliente, responde o básico e entrega a conversa etiquetada para a atendente.',
}

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-full overflow-x-hidden bg-background text-foreground">
      {children}
    </div>
  )
}
