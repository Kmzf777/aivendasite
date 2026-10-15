import type { Metadata } from "next";
import FormularioCadastro from "./FormularioCadastro";
import { temCredenciaisServidor } from "@/lib/supabase/servidor";
import estilo from "../login/login.module.css";

export const metadata: Metadata = {
  title: "Criar conta · Vistra CRM",
  description: "Acesso ao CRM da Vistra.",
};

// A placa da esquerda muda de assunto em relação ao login: aqui ela explica
// o que a conta dá e o que ela não dá. Quem está criando conta não sabe
// ainda o que é "o poço" nem por que atribuir lead importa.
export default function PaginaCadastro() {
  const temChaves = temCredenciaisServidor();

  return (
    <div className={estilo.tela}>
      <section className={estilo.placa}>
        <span className="rotulo">nova conta</span>

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
            <dt className="rotulo">a lista</dt>
            <dd>compartilhada — todo vendedor vê os mesmos leads</dd>
            <dt className="rotulo">seu nome</dt>
            <dd>aparece no lead que você pegar</dd>
            <dt className="rotulo">seus leads</dt>
            <dd>só você mexe no que está na sua mão</dd>
          </dl>
        </div>
      </section>

      <section className={estilo.console}>
        <FormularioCadastro />
      </section>
    </div>
  );
}
