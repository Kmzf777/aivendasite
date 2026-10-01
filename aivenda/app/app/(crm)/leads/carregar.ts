import { LEADS_EXEMPLO, VENDEDOR_EXEMPLO, type LeadDoPoco } from "@/lib/leadsExemplo";
import { criarClienteServidor, temCredenciaisServidor } from "@/lib/supabase/servidor";

// Carregamento compartilhado pelas duas telas de lead.
//
// São duas porque servem a perguntas diferentes:
//   /lista  — "o que ainda não foi pego?"  (universal, a equipe inteira)
//   /leads  — "o que eu tenho em mãos?"    (só os meus)
//
// Os dados são os mesmos; o recorte e a leitura é que mudam. Por isso a
// consulta mora aqui e cada página só decide o que fazer com ela.

export type Carga =
  | { estado: "demonstracao"; leads: LeadDoPoco[]; meuId: string; meuNome: string }
  | { estado: "anonimo" }
  | { estado: "erro"; mensagem: string; dica: "schema" | "credenciais" }
  | { estado: "ok"; leads: LeadDoPoco[]; meuId: string; meuNome: string | null };

export async function carregarLeads(): Promise<Carga> {
  // Sem credenciais não existe poço. Em vez de girar para sempre ou estourar
  // erro de rede, devolve leads de mentira — e a tela diz que são de mentira.
  if (!temCredenciaisServidor()) {
    return {
      estado: "demonstracao",
      leads: LEADS_EXEMPLO,
      meuId: VENDEDOR_EXEMPLO.id,
      meuNome: VENDEDOR_EXEMPLO.nome,
    };
  }

  try {
    const sb = await criarClienteServidor();

    const { data: sessao, error: erroSessao } = await sb.auth.getUser();
    if (erroSessao || !sessao.user) return { estado: "anonimo" };
    const meuId = sessao.user.id;

    // Os contatos vêm junto porque são o ativo que a ligação produziu: a
    // linha do lead qualificado mostra o telefone de quem decide, não só
    // um selo dizendo que existe.
    const [resLeads, resPerfil] = await Promise.all([
      sb
        .from("leads")
        .select("*, perfis(id, nome), contatos(id, nome, cargo, telefone, e_decisor)")
        .order("nota", { ascending: false, nullsFirst: false })
        .order("avaliacoes", { ascending: false, nullsFirst: false }),
      sb.from("perfis").select("nome").eq("id", meuId).maybeSingle(),
    ]);

    if (resLeads.error) {
      return { estado: "erro", mensagem: resLeads.error.message, dica: "schema" };
    }

    return {
      estado: "ok",
      leads: (resLeads.data ?? []) as LeadDoPoco[],
      meuId,
      meuNome: resPerfil.data?.nome || sessao.user.email || null,
    };
  } catch (e) {
    // URL errada, projeto pausado, rede fora: tudo cai aqui, e aqui a tela
    // conta o que aconteceu em vez de ficar carregando.
    return {
      estado: "erro",
      mensagem: e instanceof Error ? e.message : String(e),
      dica: "credenciais",
    };
  }
}
