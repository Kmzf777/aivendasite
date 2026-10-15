import Link from "next/link";
import LeadsPoco from "@/components/LeadsPoco";
import { carregarLeads } from "@/app/(crm)/leads/carregar";
import estilo from "@/app/(crm)/leads/poco.module.css";

/** Recado de tela cheia para quando não há o que listar. Honesto, não bonito. */
function Recado({
  rotulo,
  titulo,
  children,
  acao,
}: {
  rotulo: string;
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <main className={estilo.recado}>
      <span className="rotulo">{rotulo}</span>
      <h1>{titulo}</h1>
      <div className={estilo.corpo}>{children}</div>
      {acao}
    </main>
  );
}

// Casca compartilhada pelas duas telas de lead. Os estados de borda
// (sem credencial, sem sessão, banco fora) são idênticos nas duas; só o
// recorte da lista muda.
export default async function TelaLeads({ modo }: { modo: "universal" | "meus" }) {
  const carga = await carregarLeads();
  const rotulo = modo === "universal" ? "lista de leads" : "meus leads";

  if (carga.estado === "anonimo") {
    return (
      <Recado rotulo={rotulo} titulo="Entre para ver os leads">
        <p>
          A lista é compartilhada: todos os vendedores leem a lista inteira, e é por isso que a
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

  if (carga.estado === "erro") {
    return (
      <Recado rotulo={rotulo} titulo="A lista não carregou">
        <p>
          {carga.dica === "schema"
            ? "O banco respondeu com erro ao listar os leads:"
            : "A chamada ao Supabase falhou antes de chegar a uma resposta:"}
        </p>
        <pre className={estilo.cru}>{carga.mensagem}</pre>
        <p>
          {carga.dica === "schema" ? (
            <>
              Se o schema ainda não foi aplicado, rode <code>supabase/schema.sql</code> no SQL
              Editor do projeto.
            </>
          ) : (
            <>
              Confira <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no <code>.env</code> do projeto.
            </>
          )}
        </p>
      </Recado>
    );
  }

  // O recorte: a lista universal mostra tudo; "meus leads" mostra só o que
  // está na minha mão. Filtrar aqui, no servidor, e não na tela, evita
  // mandar o poço inteiro para o navegador só para esconder quase tudo.
  const leads =
    modo === "meus" ? carga.leads.filter((l) => l.vendedor_id === carga.meuId) : carga.leads;

  return (
    <LeadsPoco
      modo={modo}
      leads={leads}
      vendedores={carga.vendedores}
      meuId={carga.meuId}
      meuNome={carga.meuNome}
      demonstracao={carga.estado === "demonstracao"}
      fonte={carga.estado === "demonstracao" ? carga.fonte : undefined}
    />
  );
}
