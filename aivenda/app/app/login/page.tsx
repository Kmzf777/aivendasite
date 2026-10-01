import type { Metadata } from "next";
import { temCredenciaisServidor } from "@/lib/supabase/servidor";
import FormularioLogin from "./FormularioLogin";
import estilo from "./login.module.css";

export const metadata: Metadata = {
  title: "Entrar · Copiloto",
  description: "Acesso ao copiloto de call. Por convite.",
};

// Esta tela é a primeira coisa que a pessoa vê todo dia, e o resto do produto
// é um painel de instrumento. Então ela também é: placa à esquerda (quem é a
// máquina e em que estado ela está), console à direita (o único controle que
// existe aqui). Nada centralizado no vazio.
//
// Server Component de propósito: o estado das credenciais é um fato do
// servidor, e chega pronto no primeiro byte de HTML. Ninguém vê um formulário
// funcionando por meio segundo para depois descobrir que não há Supabase.
export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const bruto = params.de;
  const de = typeof bruto === "string" ? bruto : undefined;

  // Só caminho interno. `//outrodominio.com` parece caminho e é URL absoluta —
  // aceitá-lo faria do login um redirecionador aberto.
  const destino = de && de.startsWith("/") && !de.startsWith("//") && !de.startsWith("/login") ? de : null;

  const temChaves = temCredenciaisServidor();

  return (
    <div className={estilo.tela}>
      <section className={estilo.placa}>
        <span className="rotulo">acesso restrito</span>

        <div>
          <h1 className={estilo.marca}>Copiloto</h1>
          <p className={estilo.lema}>
            O Jev decide <em>qual</em> objeção é. O argumento é seu.
          </p>
        </div>

        <div className={estilo.base}>
          <div className={estilo.estado}>
            <span className={`${estilo.luz} ${temChaves ? estilo.acesa : estilo.apagada}`} />
            <span className="telemetria">
              {temChaves ? "supabase ligado" : "sem credenciais do supabase"}
            </span>
          </div>

          <dl className={estilo.ficha}>
            <dt className="rotulo">sessão</dt>
            <dd>cookie, renovada a cada requisição</dd>
            <dt className="rotulo">acesso</dt>
            <dd>por convite — não há cadastro aberto</dd>
            <dt className="rotulo">dados</dt>
            <dd>cada lead protegido por RLS no banco</dd>
          </dl>
        </div>
      </section>

      <section className={estilo.console}>
        <FormularioLogin destino={destino} temChaves={temChaves} />
      </section>
    </div>
  );
}
