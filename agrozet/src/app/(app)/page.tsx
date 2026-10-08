import { redirect } from 'next/navigation'

// A raiz do app não tem tela própria: o trabalho começa nas conversas.
export default function AppIndexPage() {
  redirect('/conversas')
}
