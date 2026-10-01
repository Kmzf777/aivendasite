"use client";

import type { FluxoListado } from "@/hooks/useFluxos";
import estilo from "./SeletorFluxo.module.css";

type Props = {
  fluxos: FluxoListado[];
  escolhido: string | null;
  aoEscolher: (fluxo: FluxoListado) => void;
};

// ==================================================================
// Que ligação é esta. Um botão por fluxo, com o nome e o objetivo.
//
// POR QUE O VENDEDOR ESCOLHE e o sistema não deduz: ele está olhando a
// ficha do lead e já sabe qual das duas ligações vai fazer, então é a
// decisão mais fácil de acertar num clique — e a mais cara de errar, porque
// fluxo errado dá dica errada da primeira frase até desligar.
//
// O objetivo aparece no botão porque é ele que desempata: os nomes são
// curtos e parecidos de longe; "sair com o nome e o WhatsApp do dono" e
// "sair com o pagamento feito" não se confundem.
// ==================================================================
export default function SeletorFluxo({ fluxos, escolhido, aoEscolher }: Props) {
  return (
    <div className={estilo.lista} role="group">
      {fluxos.map((f) => {
        const ativo = f.id === escolhido;
        return (
          <button
            key={f.id}
            type="button"
            className={`${estilo.fluxo} ${ativo ? estilo.ativo : ""}`}
            aria-pressed={ativo}
            // aoEscolher quer dizer "trocou", não "confirmou": quem recebe
            // pode estar zerando estado de ligação com ele (definirFluxo
            // zera etapa e colheita). Reclicar o mesmo botão não avisa
            // ninguém — é o mesmo cuidado do trocarModo do modal.
            onClick={() => {
              if (ativo) return;
              aoEscolher(f);
            }}
          >
            <span className={estilo.nome}>{f.nome || f.id}</span>
            {f.objetivo && <span className={estilo.objetivo}>{f.objetivo}</span>}
          </button>
        );
      })}
    </div>
  );
}
