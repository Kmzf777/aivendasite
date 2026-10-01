import Link from "next/link";
import LeadsPoco from "@/components/LeadsPoco";
import { LEADS_EXEMPLO, VENDEDOR_EXEMPLO, type LeadDoPoco } from "@/lib/leadsExemplo";
import { criarClienteServidor, temCredenciaisServidor } from "@/lib/supabase/servidor";
import estilo from "./poco.module.css";

// O poço muda a cada ação de qualquer vendedor da equipe. Cache aqui seria
// mentira: dois vendedores ligando para o mesmo pet shop é justo o que esta
// tela existe para evitar.
export const dynamic = "force-dynamic";

/** Recado de tela cheia para quando não há o que listar. Honesto, não bonito. */
function Recado({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <main className={estilo.recado}>
      <span className="rotulo">o poço</span>
      <h1>{titulo}</h1>
      <div className={estilo.corpo}>{children}</div>
      {acao}
    </main>
  );
}

export default async function PaginaLeads() {
  /* ----------------------------------------------------------------
     Sem credenciais não existe poço. Em vez de girar para sempre ou
     estourar um erro de rede, a tela mostra leads de mentira e diz, em
     letras grandes, que são de mentira.
     ---------------------------------------------------------------- */
  if (!temCredenciaisServidor()) {
    return (
      <LeadsPoco
        leads={LEADS_EXEMPLO}
        meuId={VENDEDOR_EXEMPLO.id}
        meuNome={VENDEDOR_EXEMPLO.nome}
        demonstracao
      />
    );
  }

  let meuId: string | null = null;
  let meuNome: string | null = null;
  let leads: LeadDoPoco[] = [];

  try {
    const sb = await criarClienteServidor();

    const { data: sessao, error: erroSessao } = await sb.auth.getUser();
    if (erroSessao || !sessao.user) {
      return (
        <Recado titulo="Entre para ver o poço">
          <p>
            O poço é compartilhado: todos os vendedores leem a lista inteira, e é por isso que a
            atribuição avisa os outros. Para saber quem é você, precisa de sessão.
          </p>
          <p>
            <Link href="/login" className="btn btn-forte">
              Entrar
            </Link>
          </p>
        </Recado>
      );
    }
    meuId = sessao.user.id;

    // Os contatos vêm junto porque é o ativo que a ligação produziu: a linha
    // do lead qualificado mostra o telefone de quem decide, não só um selo.
    const [resLeads, resPerfil] = await Promise.all([
      sb
        .from("leads")
        .select(
          "*, perfis(id, nome), contatos(id, nome, cargo, telefone, e_decisor)"
        )
        .order("nota", { ascending: false, nullsFirst: false })
        .order("avaliacoes", { ascending: false, nullsFirst: false }),
      sb.from("perfis").select("nome").eq("id", meuId).maybeSingle(),
    ]);

    if (resLeads.error) {
      return (
        <Recado titulo="O poço não carregou">
          <p>O banco respondeu com erro ao listar os leads:</p>
          <pre className={estilo.cru}>{resLeads.error.message}</pre>
          <p>
            Se o schema ainda não foi aplicado, rode <code>supabase/schema.sql</code> no SQL
            Editor do projeto.
          </p>
        </Recado>
      );
    }

    leads = (resLeads.data ?? []) as LeadDoPoco[];
    meuNome = resPerfil.data?.nome || sessao.user.email || null;
  } catch (e) {
    // URL errada, projeto pausado, rede fora: tudo cai aqui, e aqui a tela
    // conta o que aconteceu em vez de ficar carregando.
    return (
      <Recado titulo="Não deu para falar com o banco">
        <p>A chamada ao Supabase falhou antes de chegar a uma resposta:</p>
        <pre className={estilo.cru}>{e instanceof Error ? e.message : String(e)}</pre>
        <p>
          Confira <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no <code>.env</code> do app.
        </p>
      </Recado>
    );
  }

  return <LeadsPoco leads={leads} meuId={meuId} meuNome={meuNome} />;
}
