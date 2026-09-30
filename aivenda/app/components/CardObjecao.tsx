"use client";

import type { Card } from "@/hooks/motorCopiloto";
import estilo from "./CardObjecao.module.css";

type Props = {
  card: Card;
};

// O card é a única coisa acesa na tela. Três camadas, nesta ordem:
//
//   nome      -> que objeção é (identificação, corpo pequeno);
//   deixa     -> a headline, a versão curta (basta numa olhada rápida);
//   ARGUMENTO -> o que o vendedor vai FALAR. É o maior corpo da tela;
//   pivot     -> a regra que evita o erro clássico (--sinal, com alerta).
//
// A primeira versão escondia o argumento atrás de uma tecla e promovia a
// headline. Estava errado: o argumento é o texto que contorna a objeção,
// e é a primeira coisa que o vendedor procura. A headline costuma ser um
// pedaço dele, então servia de resumo e não de substituto.
export default function CardObjecao({ card }: Props) {
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

      {/* A deixa, curta. Fica ACIMA do argumento porque numa olhada de meio
          segundo ela basta; quem precisa do texto inteiro lê a linha de
          baixo. A headline costuma ser um pedaço do próprio argumento. */}
      {card.headline && <p className={estilo.deixa}>{card.headline}</p>}

      {/* O argumento é o que o vendedor vai FALAR para contornar, então é
          ele que ocupa a linha mais nobre e o maior corpo. Foi o que a
          primeira versão errou: escondia atrás de uma tecla justamente o
          texto que resolve a objeção. */}
      {card.argumento ? (
        <p className={estilo.argumento}>{card.argumento}</p>
      ) : (
        <p className={estilo.semArg}>Sem argumento escrito para esta objeção.</p>
      )}

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
        <span className={`telemetria ${estilo.ms}`}>{card.ms} ms</span>
      </footer>
    </article>
  );
}
