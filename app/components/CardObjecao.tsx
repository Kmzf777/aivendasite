"use client";

import type { Card } from "@/hooks/motorCopiloto";
import estilo from "./CardObjecao.module.css";

type Props = {
  card: Card;
  /** A seta ↓ está presa (teclado ou dedo no botão). */
  aberto: boolean;
  aoSegurar: (v: boolean) => void;
};

// O card é a única coisa acesa na tela.
//
// Mostra HEADLINE + PIVOT, não o argumento:
//   headline -> a frase que o vendedor vai FALAR (serifa, corpo grande);
//   pivot    -> a regra que evita o erro (cor --sinal, glifo de alerta).
// O argumento completo é longo demais para ser lido no meio de uma frase
// do cliente; ele fica a uma tecla de distância, segurando a seta ↓.
export default function CardObjecao({ card, aberto, aoSegurar }: Props) {
  const alerta = card.tipo === "alerta";
  const pct = Math.round(card.confianca * 100);

  return (
    // A animação de acender depende de este nó ser NOVO a cada decisão.
    // Quem garante isso é a `key` no ponto de uso (app/coldcall/page.tsx),
    // não uma key aqui dentro — essa não remontaria nada.
    <article className={`${estilo.card} ${alerta ? estilo.alerta : ""}`}>
      <div className={estilo.fio} aria-hidden />

      <header className={estilo.topo}>
        <h2 className={`rotulo ${estilo.nome}`}>{card.rotulo}</h2>
        <span className={estilo.medida}>
          <span className={estilo.numero}>{pct}</span>
          <i>%</i>
        </span>
      </header>

      <p className={estilo.headline}>{card.headline}</p>

      {card.pivot && (
        <>
          <div className={estilo.regua} aria-hidden />
          <p className={estilo.pivot}>
            <span className={estilo.glifo} aria-hidden>
              &#9888;
            </span>
            {card.pivot}
          </p>
        </>
      )}

      {alerta && card.falaCliente && (
        <p className={estilo.fala}>&ldquo;{card.falaCliente}&rdquo;</p>
      )}

      <footer className={estilo.pe}>
        {card.argumento ? (
          <button
            type="button"
            className={`${estilo.segurar} ${aberto ? estilo.segurando : ""}`}
            // Segurar, não clicar: o argumento só fica na tela enquanto a
            // seta está presa. Pointer cobre mouse, dedo e caneta.
            onPointerDown={() => aoSegurar(true)}
            onPointerUp={() => aoSegurar(false)}
            onPointerLeave={() => aoSegurar(false)}
            onPointerCancel={() => aoSegurar(false)}
            aria-expanded={aberto}
          >
            <kbd aria-hidden>&#8595;</kbd>
            <span>{aberto ? "solte para fechar" : "ver argumento"}</span>
          </button>
        ) : (
          <span className={`telemetria ${estilo.semArg}`}>sem argumento no catálogo</span>
        )}
        <span className={`telemetria ${estilo.ms}`}>{card.ms} ms</span>
      </footer>

      {aberto && card.argumento && (
        <div className={estilo.argumento}>
          <span className="rotulo">argumento completo</span>
          <p>{card.argumento}</p>
        </div>
      )}
    </article>
  );
}
