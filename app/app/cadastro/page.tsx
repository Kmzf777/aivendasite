import type { Metadata } from "next";
import FormularioCadastro from "./FormularioCadastro";
import { temCredenciaisServidor } from "@/lib/supabase/servidor";
import estilo from "../login/login.module.css";

export const metadata: Metadata = {
  title: "Criar conta · Copiloto",
  description: "Nova conta de vendedor no copiloto de call.",
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
