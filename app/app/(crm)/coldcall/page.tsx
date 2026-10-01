import Link from "next/link";
import Console from "./Console";
import { perfilAtual } from "@/lib/auth";
import { temCredenciaisServidor } from "@/lib/supabase/servidor";
import estilo from "./portao.module.css";

// O Cold call é só para admin.
//
// A checagem mora AQUI, num Server Component, e não no menu nem no proxy:
//   - o menu esconder o link é cosmética; quem digita a URL passa por cima;
//   - o proxy rodaria uma consulta ao banco em TODA requisição do site,
//     inclusive nas que não têm nada com isso.
// Aqui a consulta acontece uma vez, na página que precisa dela, e quem não
// é admin não recebe nem o console.
export const dynamic = "force-dynamic";

function Portao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className={estilo.portao}>
      <span className="rotulo">cold call</span>
      <h1>{titulo}</h1>
      <div className={estilo.corpo}>{children}</div>
      <Link href="/lista" className="btn">
        Voltar para a lista
      </Link>
    </main>
  );
}

export default async function PaginaColdCall() {
  // Sem banco não há como saber quem é admin. Liberar seria abrir a porta
  // justamente quando não dá para conferir a chave.
  if (!temCredenciaisServidor()) {
    return (
      <Portao titulo="Sem banco, sem permissão">
        <p>
          O Cold call é restrito a admin, e sem <code>NEXT_PUBLIC_SUPABASE_URL</code> não dá para
          saber quem é. Configure o <code>.env</code> do projeto e reinicie o servidor.
        </p>
      </Portao>
    );
  }

  const perfil = await perfilAtual();

  if (!perfil) {
    return (
      <Portao titulo="Entre para continuar">
        <p>O Cold call precisa saber quem é você.</p>
        <p>
          <Link href="/login?de=%2Fcoldcall" className="btn btn-forte">
            Entrar
          </Link>
        </p>
      </Portao>
    );
  }

  if (!perfil.admin) {
    return (
      <Portao titulo="Só para admin">
        <p>
          O Cold call está liberado apenas para administradores. Você entrou como{" "}
          <strong>{perfil.nome}</strong>.
        </p>
        <p className={estilo.pista}>
          Quem é admin muda só pelo banco, não pela aplicação — peça a quem administra o
          Supabase.
        </p>
      </Portao>
    );
  }

  return <Console />;
}
