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

/** Um vendedor no placar. Entra mesmo com tudo zerado: quem ainda não
    começou é informação, não ausência de informação. */
export type Vendedor = {
  id: string;
  nome: string;
  emContato: number;
  qualificados: number;
  fechados: number;
};

export type Carga =
  | { estado: "demonstracao"; leads: LeadDoPoco[]; meuId: string; meuNome: string; vendedores: Vendedor[] }
  | { estado: "anonimo" }
  | { estado: "erro"; mensagem: string; dica: "schema" | "credenciais" }
  | {
      estado: "ok";
      leads: LeadDoPoco[];
      meuId: string;
      meuNome: string | null;
      vendedores: Vendedor[];
    };

export async function carregarLeads(): Promise<Carga> {
  // Sem credenciais não existe poço. Em vez de girar para sempre ou estourar
  // erro de rede, devolve leads de mentira — e a tela diz que são de mentira.
  if (!temCredenciaisServidor()) {
    return {
      estado: "demonstracao",
      leads: LEADS_EXEMPLO,
      meuId: VENDEDOR_EXEMPLO.id,
      meuNome: VENDEDOR_EXEMPLO.nome,
      vendedores: [
        { id: VENDEDOR_EXEMPLO.id, nome: VENDEDOR_EXEMPLO.nome, emContato: 2, qualificados: 1, fechados: 0 },
        { id: "demo-2", nome: "Ana Prado", emContato: 1, qualificados: 3, fechados: 2 },
        { id: "demo-3", nome: "Caio Melo", emContato: 0, qualificados: 0, fechados: 0 },
      ],
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
      // Todos os perfis, não só o meu: o placar mostra a equipe inteira, e
      // quem está com zero também aparece.
      sb.from("perfis").select("id, nome"),
    ]);

    if (resLeads.error) {
      return { estado: "erro", mensagem: resLeads.error.message, dica: "schema" };
    }

    const leads = (resLeads.data ?? []) as LeadDoPoco[];
    const perfis = (resPerfil.data ?? []) as { id: string; nome: string }[];

    // O placar é contado aqui, no servidor, e não na tela: são 117 leads e
    // uma varredura só, contra três varreduras por vendedor no cliente.
    const vendedores: Vendedor[] = perfis
      .map((p) => {
        const meus = leads.filter((l) => l.vendedor_id === p.id);
        return {
          id: p.id,
          nome: p.nome || "sem nome",
          // Baldes que NÃO se sobrepõem: um lead cai em exatamente um.
          // Contar qualificado e fechado separado fazia o mesmo registro
          // aparecer duas vezes, e um cartão com "1 fechado, 1 qualificado"
          // parecia dois leads quando era um só.
          emContato: meus.filter((l) => l.situacao === "meu").length,
          qualificados: meus.filter(
            (l) => l.situacao === "qualificado" && l.etapa !== "fechou" && l.etapa !== "perdeu"
          ).length,
          fechados: meus.filter((l) => l.etapa === "fechou").length,
        };
      })
      // Fechado vale mais que qualificado: é o desfecho, não o meio do
      // caminho. Empate desempata por quem tem mais na mão.
      .sort(
        (a, b) =>
          b.fechados - a.fechados ||
          b.qualificados - a.qualificados ||
          b.emContato - a.emContato ||
          a.nome.localeCompare(b.nome, "pt-BR")
      );

    return {
      estado: "ok",
      leads,
      meuId,
      meuNome: perfis.find((p) => p.id === meuId)?.nome || sessao.user.email || null,
      vendedores,
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
