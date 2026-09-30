"use client";

import CurvaVoz from "./CurvaVoz";
import type { Amostra, Modo } from "@/hooks/motorCopiloto";
import estilo from "./PttFaixa.module.css";

type Props = {
  modo: Modo;
  apertado: boolean;
  ouvindo: boolean;
  ouvindoVoz: boolean;
  decidindo: boolean;
  esperando: boolean;
  faseCall: string | null;
  ler: () => Amostra[];
  escala: (x: number) => number;
  aoDesligar: () => void;
};

// Faixa de cima: quem está falando e a curva de voz.
//
// É o único lugar da tela que muda o tempo todo, e de propósito fica no
// canto mais alto e mais apagado: em modo foco se lê o card, não isto.
export default function PttFaixa({
  modo,
  apertado,
  ouvindo,
  ouvindoVoz,
  decidindo,
  esperando,
  faseCall,
  ler,
  escala,
  aoDesligar,
}: Props) {
  const seu = modo === "tecla" ? apertado : false;

  const situacao = decidindo
    ? "decidindo"
    : esperando
      ? "frase cortada · esperando o resto"
      : ouvindoVoz
        ? "ouvindo"
        : "reerguendo";

  return (
    <header className={`${estilo.faixa} ${seu ? estilo.seu : ""}`}>
      <div className={estilo.quem}>
        <span className={estilo.blocos} aria-hidden>
          <i /> <i /> <i />
        </span>
        <span className={`rotulo ${estilo.papel}`}>
          {modo === "tecla"
            ? seu
              ? "você falando"
              : "cliente na linha"
            : "duas entradas"}
        </span>
        {modo === "tecla" && <kbd className={estilo.tecla}>espaço</kbd>}
      </div>

      <div className={estilo.curva}>
        <CurvaVoz ler={ler} escala={escala} modo={modo} ativo={ouvindo} />
      </div>

      <div className={estilo.direita}>
        {faseCall && <span className={`telemetria ${estilo.fase}`}>{faseCall}</span>}
        <span className={`telemetria ${estilo.situacao}`}>
          <i className={`${estilo.luz} ${ouvindoVoz ? estilo.viva : ""}`} />
          {situacao}
        </span>
        <button type="button" className={estilo.desligar} onClick={aoDesligar}>
          desligar
        </button>
      </div>
    </header>
  );
}
