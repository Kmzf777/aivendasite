import Link from "next/link";
import Kanban from "@/components/Kanban";
import { montarCartoes, type CartaoLead } from "@/components/KanbanTipos";
import { caminhoDeLogin, usuarioAtual } from "@/lib/auth";
import { cartoesExemplo } from "@/lib/funilExemplo";
import { criarClienteServidor, temCredenciaisServidor } from "@/lib/supabase/servidor";
import type { Contato, Evento, Lead } from "@/lib/tipos";
import estilo from "./funil.module.css";

// Lê cookie de sessão: nunca pode ser pré-renderizada em build.
export const dynamic = "force-dynamic";

/**
 * O que o servidor conseguiu. Quatro desfechos, e cada um tem uma tela
 * honesta — nenhum deles é "quadro vazio sem explicação".
 */
type Carga =
  | { tipo: "demonstracao"; cartoes: CartaoLead[] }
  | { tipo: "anonimo" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; cartoes: CartaoLead[]; vendedorId: string };

async function carregar(): Promise<Carga> {
  // Sem chaves no .env não existe banco para consultar. Em vez de girar ou
  // estourar um erro de rede, o quadro sobe com dados de demonstração e a
  // tela diz isso em letras grandes.
  if (!temCredenciaisServidor()) {
    return { tipo: "demonstracao", cartoes: cartoesExemplo() };
  }

  // `usuarioAtual()` é o helper de sessão do projeto: valida o token no
  // servidor do Supabase (não acredita no cookie) e devolve null sem explodir.
  // Em operação normal o proxy já teria mandado quem não tem sessão para o
  // /login — mas ele deixa passar de propósito quando a rede falha, então
  // este caminho tem que existir e dizer o que aconteceu.
  const usuario = await usuarioAtual();
  if (!usuario) return { tipo: "anonimo" };
  const vendedorId = usuario.id;

  try {
    const sb = await criarClienteServidor();

    // A regra do quadro, em duas cláusulas: é MEU e está QUALIFICADO.
    // `etapa` não entra no filtro porque o gatilho `leads_coerencia` já
    // garante que todo qualificado tem etapa — duplicar isso aqui seria
    // reimplementar o banco no cliente.
    const { data: leads, error } = await sb
      .from("leads")
      .select("*")
      .eq("vendedor_id", vendedorId)
      .eq("situacao", "qualificado");

    if (error) return { tipo: "erro", mensagem: error.message };

    const linhas = (leads ?? []) as Lead[];
    if (linhas.length === 0) return { tipo: "ok", cartoes: [], vendedorId };

    const ids = linhas.map((l) => l.id);
    const [resContatos, resEventos] = await Promise.all([
      sb.from("contatos").select("*").in("lead_id", ids),
      // O histórico inteiro de um funil de vendedor é pequeno, e trazê-lo
      // junto evita uma segunda viagem quando o painel abre. O teto existe
      // só para o caso patológico.
      sb
        .from("eventos")
        .select("*")
        .in("lead_id", ids)
        .order("criado_em", { ascending: false })
        .limit(800),
    ]);

    if (resContatos.error) return { tipo: "erro", mensagem: resContatos.error.message };
    if (resEventos.error) return { tipo: "erro", mensagem: resEventos.error.message };

    return {
      tipo: "ok",
      vendedorId,
      cartoes: montarCartoes(
        linhas,
        (resContatos.data ?? []) as Contato[],
        (resEventos.data ?? []) as Evento[]
      ),
    };
  } catch (e) {
    // URL inválida, projeto fora do ar, tabela inexistente: tudo cai aqui e
    // vira texto na tela em vez de página branca.
    return { tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) };
  }
}

// ==================================================================
// /funil — o kanban do vendedor.
//
// Server Component: a carga inicial é feita aqui, com a sessão do cookie, e
// desce serializada. O único pedaço de cliente é o quadro, que precisa de
// arraste, teclado e gravação otimista.
// ==================================================================
export default async function Funil() {
  const carga = await carregar();

  return (
    <main className={estilo.tela}>
      <header className={estilo.topo}>
        <div className={estilo.identidade}>
          <p className={estilo.sobretitulo}>o que vem depois do poço</p>
          <h1 className={estilo.titulo}>Funil</h1>
        </div>
        <p className={estilo.regra}>
          Aqui só entra lead <strong>qualificado</strong> — e qualificado quer dizer uma coisa
          só: <em>você tem o número de quem decide</em>. O resto está no{" "}
          <Link href="/leads">poço</Link>.
        </p>
      </header>

      {carga.tipo === "demonstracao" && (
        <p className={estilo.faixa} data-tom="demo">
          <strong>Dados de demonstração.</strong> O <code>.env</code> não tem{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, então
          não há banco para consultar. Estes {carga.cartoes.length} cartões são inventados, o
          quadro se move na tela e <strong>nada é gravado em lugar nenhum</strong>.
        </p>
      )}

      {carga.tipo === "anonimo" && (
        <div className={estilo.parede}>
          <h2>Entre para ver o seu funil</h2>
          <p>
            Este quadro mostra <strong>só os seus</strong> leads qualificados, e quem decide o que
            é seu é a sessão. Sem sessão comprovável não há o que mostrar — isto aparece tanto
            quando você não está logado quanto quando o Supabase não respondeu.
          </p>
          <p>
            <a className="btn btn-forte" href={caminhoDeLogin("/funil")}>
              Ir para o login
            </a>
          </p>
        </div>
      )}

      {carga.tipo === "erro" && (
        <div className={estilo.parede} data-tom="erro">
          <h2>O banco respondeu com erro</h2>
          <p className={estilo.cru}>{carga.mensagem}</p>
          <p>
            As chaves estão no <code>.env</code>, mas a consulta não passou. Normalmente é uma de
            três coisas: o <code>supabase/schema.sql</code> ainda não foi rodado no projeto, a URL
            aponta para outro lugar, ou o RLS está barrando a leitura.
          </p>
        </div>
      )}

      {carga.tipo === "ok" && carga.cartoes.length === 0 && (
        <p className={estilo.faixa}>
          Nenhum lead qualificado seu ainda. Um lead chega aqui quando você consegue o contato de
          quem decide — até então ele vive no <Link href="/leads">poço</Link>.
        </p>
      )}

      {(carga.tipo === "ok" || carga.tipo === "demonstracao") && (
        <div className={estilo.palco}>
          <Kanban
            iniciais={carga.cartoes}
            vendedorId={carga.tipo === "ok" ? carga.vendedorId : null}
            demonstracao={carga.tipo === "demonstracao"}
          />
        </div>
      )}
    </main>
  );
}
