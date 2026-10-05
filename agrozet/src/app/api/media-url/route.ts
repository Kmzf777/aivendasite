import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getAdminSupabase } from '@/lib/supabaseAdmin'
import { BUCKET } from '@/lib/mediaStorage'

// O bucket `media` é privado; a UI nunca tem a URL do objeto, só o
// `messages.media_path`. Esta rota troca o path por uma URL assinada.

// `caminhoMidia()` só produz `[A-Za-z0-9._-]` (ele mesmo sanitiza o wamid), e é
// a ÚNICA origem de paths neste bucket — então a allowlist não restringe nada
// legítimo. Sem ela, `?path=../outro-bucket/x` escapa do prefixo do bucket:
// path traversal no Storage. Allowlist, não blocklist de `..`, porque a
// blocklist erra com encoding (`%2e%2e`) e barra invertida.
const PATH_RE = /^[A-Za-z0-9._-]+$/

// 7 dias. Deliberadamente longo: o plano free do Supabase dá 5 GB de egress por
// mês, e uma URL curta (1h) faria o browser rebaixar a MESMA foto a cada
// recarregamento da conversa. Com 7 dias o cache do browser absorve as
// releituras. Não é um vazamento de longa duração: a URL é assinada por objeto,
// e o path só chega a quem já tem sessão.
const VALIDADE_SEGUNDOS = 604800

export async function GET(request: NextRequest) {
  // Sessão validada na rota, não só no middleware: esta rota assina com
  // service_role, então sem a checagem qualquer anônimo que adivinhe um path lê
  // a mídia das conversas. Cliente de sessão, nunca `getAdminSupabase()`.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const path = request.nextUrl.searchParams.get('path')
  if (!path || !PATH_RE.test(path)) {
    return NextResponse.json({ error: 'path invalido ou ausente' }, { status: 400 })
  }

  const { data, error } = await getAdminSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, VALIDADE_SEGUNDOS)

  if (error || !data?.signedUrl) {
    // O Storage responde 400/404 "Object not found" para objeto inexistente.
    // Virar 404 aqui deixa a UI distinguir "mídia expirada/apagada pela
    // retenção de 90 dias" de "o assinador quebrou" — são reações diferentes.
    const msg = error?.message ?? 'objeto nao encontrado'
    const naoExiste = /not found|does not exist|no such/i.test(msg)
    return NextResponse.json({ error: msg }, { status: naoExiste ? 404 : 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
