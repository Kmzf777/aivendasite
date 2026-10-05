import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getAdminSupabase } from '@/lib/supabaseAdmin'
import { sendWhatsAppMessage } from '@/lib/metaApi'
import { normalizePhone } from '@/lib/phoneUtils'
import { logOperationalError } from '@/lib/errorLog'

// Envio de texto pelo composer da tela de conversas. Existe para manter o
// META_TOKEN no servidor: o composer é "use client" e não pode falar com a
// Graph API direto.
//
// 4096 é o teto do corpo de texto da Cloud API. Acima disso a Meta devolve um
// 400 genérico, então barramos aqui com erro legível.
const MAX_TEXTO = 4096

const Body = z.object({
  phone: z.string().min(1, 'phone obrigatorio'),
  text: z.string().min(1, 'text obrigatorio').max(MAX_TEXTO, `text excede ${MAX_TEXTO} caracteres`),
})

export async function POST(request: NextRequest) {
  // Sessão validada NA ROTA, não só no middleware. O matcher do middleware
  // cobre esta rota hoje, mas uma rota que confia só nele vira um proxy
  // público para o WhatsApp do petshop na primeira vez que o matcher mudar:
  // qualquer anônimo mandaria mensagem em nome da loja.
  // Deliberadamente o cliente de sessão (anon + cookie), NUNCA o service_role:
  // o admin ignora RLS e não tem usuário, logo nunca reprovaria.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'payload invalido', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { phone, text } = parsed.data

  // Identidade canônica da conversa: só dígitos, exatamente como o webhook
  // grava o `wa_id` da Meta. A coluna `messages.phone` tem que receber a MESMA
  // string que o inbound, senão a conversa racha em dois cards na timeline.
  // O DDI 55 é problema do `buildRecipient` dentro de `metaApi` — aqui não se
  // reescreve o número, só se tira a formatação.
  const canonico = normalizePhone(phone)
  if (!canonico) return NextResponse.json({ error: 'phone sem digitos' }, { status: 400 })

  // ORDEM DELIBERADA: Meta primeiro, banco depois. Se a Meta recusar, não pode
  // sobrar em `messages` uma linha de mensagem que nunca saiu — o atendente
  // leria a timeline como se o cliente tivesse recebido.
  let metaMessageId: string | null
  try {
    metaMessageId = await sendWhatsAppMessage(canonico, text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logOperationalError('send-message.meta', msg, { phone: canonico })
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // `message_id` é UNIQUE NOT NULL: sem o fallback, um retorno nulo da Meta
  // (envio aceito mas sem id no corpo) derrubaria o insert inteiro.
  const messageId = metaMessageId ?? `outbound_${crypto.randomUUID()}`

  const { error } = await getAdminSupabase().from('messages').insert({
    message_id: messageId,
    phone: canonico,
    direction: 'outbound',
    message_type: 'text',
    content: text,
  })

  if (error) {
    // A mensagem JÁ chegou no cliente. Devolver erro aqui faria o atendente
    // reenviar e o cliente receber duas vezes — pior que a timeline ficar com
    // um furo. Registra o erro operacional e responde 200.
    await logOperationalError('send-message.insert', error.message, {
      phone: canonico,
      messageId,
    })
  }

  return NextResponse.json({ messageId })
}
