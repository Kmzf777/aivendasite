import Link from "next/link";
import { lerObjecoes, chave } from "@/lib/servidor";
import estilo from "./home.module.css";

// A home nao e uma dashboard. E um seletor de instrumento: duas portas e o
// estado do sistema. Se o servidor ou a chave estiverem errados, voce
// descobre AQUI, e nao no meio de uma call.
export const dynamic = "force-dynamic";

export default function Home() {
  const objecoes = lerObjecoes();
  const temChave = !!chave();

  return (
    <main className={estilo.tela}>
      <header className={estilo.topo}>
        <div>
          <h1 className={estilo.marca}>Copiloto</h1>
          <p className={estilo.lema}>
            O Jev decide <em>qual</em> objeção é. O argumento é seu.
          </p>
        </div>
        <div className={estilo.estado}>
          <span className={`${estilo.luz} ${temChave ? estilo.acesa : estilo.apagada}`} />
          <span className="telemetria">
            {temChave ? "chave ok" : "sem chave no .env"} · {objecoes.length} objeções
          </span>
        </div>
      </header>

      <div className={estilo.portas}>
        <Link href="/coldcall" className={`${estilo.porta} ${estilo.principal}`}>
          <span className="rotulo">modo foco</span>
          <h2>Cold call</h2>
          <p>
            Abre o modal, você liga, e a tela vira só o card. Push-to-talk, curva de voz,
            e a objeção que o cliente acabou de levantar.
          </p>
          <span className={estilo.seta} aria-hidden>→</span>
        </Link>

        <Link href="/objecoes" className={estilo.porta}>
          <span className="rotulo">configuração</span>
          <h2>Objeções</h2>
          <p>
            O catálogo e os limiares do Jev. Como cada objeção soa, a frase que você diz
            e a regra que você não pode esquecer.
          </p>
          <span className={estilo.seta} aria-hidden>→</span>
        </Link>
      </div>

      {!temChave && (
        <p className={estilo.alerta}>
          Falta a <code>TYPESAFE_API_KEY</code> no <code>.env</code> da pasta{" "}
          <code>aivenda</code>. Sem ela nenhuma decisão acontece.
        </p>
      )}
    </main>
  );
}
