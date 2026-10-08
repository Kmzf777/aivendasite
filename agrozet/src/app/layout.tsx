import type { Metadata } from 'next'
import { Archivo, Hanken_Grotesk, Geist_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import Providers from './providers'
import './globals.css'

// Display — grotesca neutra para títulos. Nada de serifada: a landing do
// petshop pode ter personalidade, o CRM é ferramenta de trabalho.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

// Corpo / UI — humanista-grotesca, legível em lista densa e em tamanho pequeno.
const hanken = Hanken_Grotesk({
  variable: '--font-hanken',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

// Dados / Mono — hora e telefone em coluna. Dígitos tabulares (globals.css)
// para o número não "dançar" de linha em linha.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'CRM Agrozet',
  description: 'Atendimento WhatsApp do Pet Shop Agrozet: conversas, agendamentos e clientes.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${hanken.variable} ${geistMono.variable} h-full`}
    >
      <body className="h-full font-sans antialiased" suppressHydrationWarning>
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
