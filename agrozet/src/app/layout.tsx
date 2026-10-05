import type { Metadata } from 'next'
import { Fraunces, Karla } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import Providers from './providers'
import './globals.css'

// Display — serifada macia, com os eixos SOFT/WONK que dão o tom de bairro
// (mesma escolha do site-agrozet, para o CRM e a landing falarem igual).
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
})

// Corpo / UI — grotesca legível, sem o Inter/Poppins de todo pet shop.
const karla = Karla({
  variable: '--font-karla',
  subsets: ['latin'],
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
      className={`${fraunces.variable} ${karla.variable} h-full`}
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
