import type { Metadata } from "next";
import { temCredenciaisServidor } from "@/lib/supabase/servidor";
import FormularioLogin from "./FormularioLogin";
import estilo from "./login.module.css";

export const metadata: Metadata = {
  title: "Entrar · Vistra CRM",
  description: "Acesso ao CRM da Vistra.",
};

// Esta tela é a primeira coisa que a pessoa vê todo dia, e o resto do produto
// é um painel de trabalho. Então ela também é: placa à esquerda (quem é a
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
          <div className={estilo.marca}>
            <svg viewBox="0 0 200 200" width="40" height="40" aria-hidden>
              <circle cx="100" cy="100" r="100" fill="#39FF14" />
              <path d="M52 56 H82 L94 122 L128 56 H158 L104 150 H76 Z" fill="#000" />
            </svg>
            <h1>
              vistra<b>.ia</b> <span>CRM</span>
            </h1>
          </div>
          <p className={estilo.lema}>Engenharia de receita com IA.</p>
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
            <dd>cadastro aberto — qualquer um cria conta</dd>
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
