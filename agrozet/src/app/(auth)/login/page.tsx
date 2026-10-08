'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MODO_MOCK } from '@/lib/mock/modo'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'A senha tem no mínimo 8 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>

// MODO MOCK — a escolha, e por quê.
//
// Duas opções estavam na mesa: redirecionar `/login` direto para `/conversas`,
// ou manter a tela com UM botão "Entrar (modo demonstração)". Ficou o botão.
//
// O motivo é o botão "Sair" da Sidebar, que existe e continua existindo no
// mockup: ele navega para `/login`. Com redirect automático, apertar "Sair" na
// frente da dona do petshop devolveria ela a `/conversas` num pisco — a leitura
// inevitável é "o sistema não deixa sair" ou "travou". Com o botão, "Sair"
// chega numa tela de login reconhecível, com a marca, e UM clique volta para
// dentro: o fluxo se explica sozinho e ninguém digita uma senha que não existe.
// De quebra, a tela de login — que é parte do produto — continua visível na
// apresentação, só sem autenticação por trás.
//
// Branch no topo do componente para que o caminho de produção (flag ausente)
// seja literalmente o mesmo código de antes, com os mesmos hooks.
export default function LoginPage() {
  return MODO_MOCK ? <LoginDemonstracao /> : <LoginSupabase />
}

/** Tela de login do modo demonstração: entra sem autenticar nada. */
function LoginDemonstracao() {
  const router = useRouter()

  return (
    <Card className="w-full">
      <CardHeader className="items-center gap-3 text-center">
        <Image
          src="/agrozet-logo.png"
          alt="Pet Shop Agrozet"
          width={391}
          height={120}
          priority
          className="mx-auto h-10 w-auto"
        />
        <CardTitle className="font-display text-lg font-semibold tracking-tight">
          Entrar no CRM
        </CardTitle>
        <CardDescription>Atendimento WhatsApp do Pet Shop Agrozet</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => router.replace('/conversas')}
        >
          Entrar
        </Button>
      </CardContent>
    </Card>
  )
}

// Não há cadastro nem "esqueci minha senha": as contas das atendentes são
// criadas pelo admin no dashboard do Supabase (Authentication → Users).
function LoginSupabase() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginFormData) {
    setLoading(true)
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    setLoading(false)

    if (error) {
      toast.error(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos'
          : 'Não foi possível entrar. Tente novamente.'
      )
      return
    }

    router.replace('/conversas')
    // refresh() para o layout servidor reler a sessão recém-gravada no cookie.
    router.refresh()
  }

  return (
    <Card className="w-full">
      <CardHeader className="items-center gap-3 text-center">
        <Image
          src="/agrozet-logo.png"
          alt="Pet Shop Agrozet"
          width={391}
          height={120}
          priority
          className="mx-auto h-10 w-auto"
        />
        <CardTitle className="font-display text-lg font-semibold tracking-tight">
          Entrar no CRM
        </CardTitle>
        <CardDescription>Atendimento WhatsApp do Pet Shop Agrozet</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@agrozet.com.br"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
