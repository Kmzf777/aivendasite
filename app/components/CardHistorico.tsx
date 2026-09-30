"use client";

import type { ItemHistorico } from "@/hooks/motorCopiloto";
import estilo from "./CardHistorico.module.css";

type Props = {
  itens: ItemHistorico[];
  decisoes: number;
  latencia: number | null;
  custo: number;
  modelo: string;
};

// Faixa de baixo: o rastro da call, discreto de propósito.
//
// Serve para o vendedor saber o que já apareceu sem tirar o olho do card.
// O mais recente vem primeiro, porque é o que ainda pode importar.
export default function CardHistorico({ itens, decisoes, latencia, custo, modelo }: Props) {
  return (
    <footer className={estilo.faixa}>
      <div className={estilo.rastro}>
        {itens.length === 0 ? (
          <span className={estilo.nada}>nenhuma objeção ainda</span>
        ) : (
          itens.map((o, i) => (
            <span key={o.chave} className={`${estilo.item} ${i === 0 ? estilo.agora : ""}`}>
              {o.nome}
            </span>
          ))
        )}
      </div>

      <div className={estilo.medidas}>
        <span className="telemetria">{decisoes} decisões</span>
        <span className="telemetria">{latencia === null ? "— ms" : latencia + " ms"}</span>
        <span className="telemetria">
          US$ {custo.toFixed(6).replace(".", ",")}
        </span>
        <span className={`telemetria ${estilo.modelo}`}>{modelo}</span>
      </div>
    </footer>
  );
}
