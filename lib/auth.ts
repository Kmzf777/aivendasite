// Helpers de sessão do lado do SERVIDOR. Nunca importe daqui num componente
// cliente: este módulo usa `cookies()` e `redirect()`, que só existem no
// servidor. Para o navegador existe `lib/supabase/cliente.ts`.
//
// Regra do projeto: o perfil é criado pelo TRIGGER `ao_criar_usuario` do
// schema, a cada usuário novo em auth.users. Então aqui a gente só LÊ perfil —
// nunca insere. Se inserisse, duplicaria a responsabilidade e abriria a porta
// para um perfil nascer com nome errado.

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { criarClienteServidor, temCredenciaisServidor } from "./supabase/servidor";
import type { Perfil } from "./tipos";

export const ROTA_LOGIN = "/login";
export const ROTA_INICIO = "/leads";

// Re-exporta para quem só quer saber se dá para falar de sessão. Evita a tela
// importar de dois lugares diferentes só para fazer uma pergunta.
export { temCredenciaisServidor as sessaoDisponivel };

/** Nome legível a partir do que o auth tem em mãos. "rafael@x.com" → "rafael". */
export function nomeDeFallback(email: string | null | undefined): string {
  if (!email) return "você";
  return email.split("@")[0] || "você";
}

/** O nome que o auth conhece: metadata `nome` se o convite trouxe, senão o e-mail. */
function nomeDoUsuario(usuario: User): string {
  const doMeta = usuario.user_metadata?.nome;
  if (typeof doMeta === "string" && doMeta.trim()) return doMeta.trim();
  return nomeDeFallback(usuario.email);
}

/**
 * O usuário desta requisição, ou null.
 *
 * Usa `getUser()`, que valida o token no servidor do Supabase. O `getSession()`
 * leria o cookie e acreditaria nele — e cookie é dado do cliente, logo não é
 * prova de nada. Mais caro, porém honesto.
 *
 * Devolve null (em vez de explodir) em três casos: sem credenciais no .env,
 * token inválido/expirado, e falha de rede. Quem chama decide o que fazer.
 */
export async function usuarioAtual(): Promise<User | null> {
  if (!temCredenciaisServidor()) return null;
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    // Rede fora, URL errada, projeto pausado. Sem sessão comprovável.
    return null;
  }
}

/**
 * O perfil (tabela `perfis`) de quem está logado, ou null se não há sessão.
 *
 * Se a linha ainda não existe — trigger que não rodou, usuário criado antes do
 * schema — monta um perfil a partir do auth em vez de devolver null. Nenhuma
 * tela deve ficar sem nome por causa disso, e continuamos sem inserir nada.
 */
export async function perfilAtual(): Promise<Perfil | null> {
  const usuario = await usuarioAtual();
  if (!usuario) return null;

  const deEmergencia: Perfil = {
    id: usuario.id,
    nome: nomeDoUsuario(usuario),
    email: usuario.email ?? "",
    // Sem a linha no banco não dá para saber se é admin. Negar é o certo:
    // o perfil de emergência existe para a tela não ficar sem nome, não
    // para destravar permissão.
    admin: false,
  };

  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("perfis")
      .select("id, nome, email, admin")
      .eq("id", usuario.id)
      .maybeSingle();

    if (error || !data) return deEmergencia;

    // O schema tem `default ''` em nome e email, então vazio é possível.
    return {
      id: data.id,
      nome: data.nome?.trim() || deEmergencia.nome,
      email: data.email?.trim() || deEmergencia.email,
      admin: data.admin === true,
    };
  } catch {
    return deEmergencia;
  }
}

/**
 * Exige sessão num Server Component / route handler. Sem sessão, redireciona
 * para o login carregando de onde a pessoa veio, para voltar depois.
 *
 * Atenção: `redirect()` funciona lançando uma exceção de controle do Next.
 * Não chame isto dentro de um try/catch que engole tudo, senão o redirect
 * morre no catch e a tela renderiza sem usuário.
 */
export async function exigirSessao(de?: string): Promise<User> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(caminhoDeLogin(de));
  return usuario;
}

/** Igual ao `exigirSessao`, quando quem chama precisa do nome e não do token. */
export async function exigirPerfil(de?: string): Promise<Perfil> {
  const perfil = await perfilAtual();
  if (!perfil) redirect(caminhoDeLogin(de));
  return perfil;
}

/** `/login?de=/funil` — o `de` é o que o login usa para devolver a pessoa. */
export function caminhoDeLogin(de?: string): string {
  if (!de || !de.startsWith("/") || de.startsWith(ROTA_LOGIN)) return ROTA_LOGIN;
  return `${ROTA_LOGIN}?de=${encodeURIComponent(de)}`;
}
