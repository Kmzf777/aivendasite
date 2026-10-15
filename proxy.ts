// ===================================================================
// Proxy — o antigo `middleware.ts`.
//
// No Next 16 a convenção `middleware` foi DEPRECADA e renomeada para `proxy`:
// mesmo comportamento, outro nome de arquivo e de função. Um `middleware.ts`
// ainda funciona, mas imprime aviso de depreciação em todo build. É o mesmo
// middleware que o Supabase documenta — só o nome mudou.
//
// Ele faz duas coisas, e a segunda é a que ninguém espera:
//
//   1. PROTEGE a rota. Sem sessão, tudo que não é /login vira redirect para
//      /login?de=<rota>. Com sessão, /login devolve para o trabalho.
//
//   2. RENOVA a sessão. O access token do Supabase dura cerca de uma hora. Sem
//      alguém pedindo o refresh e REGRAVANDO o cookie, ele simplesmente expira
//      e o vendedor é deslogado no meio do trabalho. Server Component não pode
//      escrever cookie (veja o try/catch em lib/supabase/servidor.ts), então
//      este arquivo é o único lugar da aplicação onde essa renovação cabe.
//      É por isso que o proxy existe mesmo em rota que já checaria sessão.
// ===================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Constantes repetidas de propósito: `lib/auth.ts` importa `next/headers` e
// `redirect`, que não existem no runtime do proxy. Importar de lá arrastaria
// o módulo inteiro para cá e quebraria o build.
const ROTA_LOGIN = "/login";
const ROTA_CADASTRO = "/cadastro";
const ROTA_INICIO = "/leads";

// Lidas no topo do módulo: NEXT_PUBLIC_* são embutidas no build, não existe
// leitura de .env em tempo de requisição aqui.
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// As duas portas que existem sem sessão. Quem já tem sessão e cai numa
// delas é devolvido ao trabalho — ficar numa tela de entrar já estando
// dentro só confunde.
function ePublica(caminho: string): boolean {
  return [ROTA_LOGIN, ROTA_CADASTRO].some(
    (r) => caminho === r || caminho.startsWith(`${r}/`)
  );
}

/**
 * Valida o `?de=`. Só aceita caminho interno: `//outrodominio.com` é URL
 * absoluta disfarçada de caminho, e aceitá-la transformaria o login num
 * redirecionador aberto para phishing.
 */
function destinoSeguro(de: string | null | undefined): string | null {
  if (!de) return null;
  if (!de.startsWith("/") || de.startsWith("//")) return null;
  if (de.startsWith(ROTA_LOGIN)) return null;
  return de;
}

/**
 * Um redirect é uma resposta NOVA: os cookies renovados que o Supabase acabou
 * de escrever na resposta original morreriam aqui. Sem esta cópia, toda vez
 * que o token fosse renovado durante um redirect o navegador ficaria com o
 * token velho — e o loop de refresh nunca fecharia.
 */
/**
 * "Supabase fora do ar" é diferente de "não tem sessão", e os dois chegam pelo
 * MESMO campo `error` — falha de rede no auth não vira exceção. Distinguir é o
 * que evita deslogar o vendedor por causa de um soluço de rede.
 *
 * O `@supabase/supabase-js` não reexporta o `isAuthRetryableFetchError`, e o
 * `@supabase/auth-js` é dependência transitiva — importar direto de lá
 * quebraria no dia em que a árvore de pacotes mudar. A checagem por `name` é
 * literalmente a mesma que aquela função faz.
 */
function eFalhaDeInfra(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    (erro as { name?: unknown }).name === "AuthRetryableFetchError"
  );
}

function levarCookies(de: NextResponse, para: NextResponse): void {
  de.cookies.getAll().forEach((cookie) => para.cookies.set(cookie));
  // Resposta que troca cookie de sessão não pode ser cacheada por CDN ou proxy
  // reverso: o token de um usuário acabaria servido para outro.
  for (const nome of ["cache-control", "expires", "pragma"]) {
    const valor = de.headers.get(nome);
    if (valor) para.headers.set(nome, valor);
  }
}

export async function proxy(pedido: NextRequest) {
  const url = pedido.nextUrl;
  const caminho = url.pathname;

  // --- sem credenciais do Supabase ---
  // Não há sessão para validar: nenhuma chave, nenhum token, nenhum servidor.
  // Travar tudo aqui deixaria o app inteiro inacessível (as telas caem nos
  // dados de demonstração) sem proteger um dado sequer. Então passa reto, e a
  // /login é quem explica, por escrito, o que está faltando.
  if (!URL_SUPABASE || !CHAVE_ANON) return NextResponse.next();

  // A resposta nasce ANTES da conversa com o Supabase: é nela que os cookies
  // renovados vão ser escritos, de dentro do setAll abaixo.
  let resposta = NextResponse.next({ request: pedido });

  const supabase = createServerClient(URL_SUPABASE, CHAVE_ANON, {
    cookies: {
      getAll: () => pedido.cookies.getAll(),
      setAll: (lista, cabecalhos) => {
        // Aqui está a parte contraintuitiva. O token novo precisa aparecer em
        // DOIS lugares, e esquecer qualquer um deles dá um bug silencioso:
        //
        // (1) no PEDIDO — senão o Server Component que renderiza logo depois
        //     ainda lê o cookie velho e consulta o banco como deslogado;
        // (2) na RESPOSTA — senão o navegador nunca recebe o token novo e na
        //     requisição seguinte tudo recomeça, gerando refresh infinito.
        lista.forEach(({ name, value }) => pedido.cookies.set(name, value));
        resposta = NextResponse.next({ request: pedido });
        lista.forEach(({ name, value, options }) =>
          resposta.cookies.set(name, value, options)
        );
        Object.entries(cabecalhos ?? {}).forEach(([chave, valor]) =>
          resposta.headers.set(chave, valor)
        );
      },
    },
  });

  let temSessao = false;
  try {
    // É ESTA chamada que renova a sessão: o getClaims valida o access token e,
    // se ele está perto de expirar, faz o refresh antes de responder — o que
    // dispara o setAll acima. Tem que acontecer agora, antes de qualquer
    // resposta ser fechada, porque depois não há mais onde gravar o cookie.
    const { data, error } = await supabase.auth.getClaims();

    // Rede fora / DNS / projeto pausado: a gente não sabe se há sessão.
    // Deixamos passar de propósito: jogar o vendedor para o login no meio do
    // trabalho por causa de um soluço de rede é pior do que renderizar uma
    // tela sem dados. Nada
    // vaza: sem JWT válido o RLS nega toda consulta, e o próprio Next define
    // o proxy como checagem otimista, não como a autorização final.
    if (eFalhaDeInfra(error)) return resposta;

    temSessao = !error && Boolean(data?.claims?.sub);
  } catch {
    // Exceção de verdade (bug, runtime). Mesmo raciocínio: não derruba ninguém.
    return resposta;
  }

  // --- sem sessão, rota protegida ---
  if (!temSessao && !ePublica(caminho)) {
    // Rota de API responde 401 em JSON. Um 302 para HTML faria o fetch do
    // navegador engasgar no parse e o vendedor veria um erro incompreensível
    // em vez de "sua sessão caiu".
    if (caminho.startsWith("/api/")) {
      const r = NextResponse.json(
        { erro: "sem_sessao", mensagem: "Sessão expirada. Entre de novo.", entrar: ROTA_LOGIN },
        { status: 401 }
      );
      levarCookies(resposta, r);
      return r;
    }

    const destino = url.clone();
    destino.pathname = ROTA_LOGIN;
    destino.search = "";
    // O `de` é o que faz a pessoa voltar para onde estava, e não para a home.
    destino.searchParams.set("de", caminho + url.search);
    const r = NextResponse.redirect(destino);
    levarCookies(resposta, r);
    return r;
  }

  // --- com sessão, parado no login ---
  if (temSessao && ePublica(caminho)) {
    const paraOnde = destinoSeguro(url.searchParams.get("de")) ?? ROTA_INICIO;
    // `new URL(caminho, origem)` separa path de query sozinho. Atribuir o
    // valor em `pathname` escaparia o "?" e o destino viraria literalmente
    // "/funil%3Faba=x" — uma rota que não existe. A origem fixa é o que
    // impede o `de` de apontar para fora, junto com o destinoSeguro().
    const destino = new URL(paraOnde, url.origin);
    const r = NextResponse.redirect(destino);
    levarCookies(resposta, r);
    return r;
  }

  return resposta;
}

export const config = {
  // Sem matcher o proxy rodaria em cima de CSS, fonte e imagem, e cada
  // asset pagaria uma validação de token. Negamos o que é estático e
  // deixamos passar o resto — inclusive /api, que precisa do 401.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|txt|map)$).*)",
  ],
};
