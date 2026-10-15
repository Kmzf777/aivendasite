"use client";

import { useId, useRef, useState } from "react";
import type { Etapa } from "@/lib/tipos";
import CartaoLead from "./CartaoLead";
import { eTerminal, temperatura, type CartaoLead as Cartao } from "./KanbanTipos";
import estilo from "./Kanban.module.css";

type Props = {
  etapa: Etapa;
  nome: string;
  /** Já filtrados e ordenados pelo quadro. */
  cartoes: Cartao[];
  /** Id do cartão em arraste, ou null. */
  arrastando: string | null;
  salvando: ReadonlySet<string>;
  aoAbrir: (id: string) => void;
  aoMover: (id: string, destino: Etapa, focoApos?: string) => void;
  aoIniciarArraste: (id: string) => void;
  aoTerminarArraste: () => void;
};

// ==================================================================
// Uma coluna, e o lado "destino" do arraste nativo de HTML5.
//
// Três armadilhas da API nativa, todas tratadas aqui:
//
// 1. Sem `preventDefault()` no `dragover` o navegador NÃO dispara `drop`.
//    É contraintuitivo e é a razão número um de arraste que não funciona.
//
// 2. `dragenter`/`dragleave` disparam para cada filho por onde o ponteiro
//    passa. Pintar/despintar a coluna direto nesses eventos faz a moldura
//    piscar. Conto profundidade: só apago quando o contador chega a zero.
//
// 3. Durante o `dragover` o `dataTransfer` existe mas os DADOS estão
//    bloqueados por segurança — não dá para saber o que está vindo. Por isso
//    o quadro guarda o id do cartão em arraste num estado e passa para cá:
//    é o que permite ignorar arquivos e textos arrastados de fora.
// ==================================================================
export default function KanbanColuna({
  etapa,
  nome,
  cartoes,
  arrastando,
  salvando,
  aoAbrir,
  aoMover,
  aoIniciarArraste,
  aoTerminarArraste,
}: Props) {
  const [sobre, setSobre] = useState(false);
  const profundidade = useRef(0);
  const idTitulo = useId();

  const daqui = arrastando !== null && cartoes.some((c) => c.id === arrastando);
  const podeReceber = arrastando !== null && !daqui;

  const frios = cartoes.filter((c) => temperatura(c.etapa, c.paradoHoras) === "frio").length;

  const sair = () => {
    profundidade.current = 0;
    setSobre(false);
  };

  return (
    <section
      className={estilo.coluna}
      data-terminal={eTerminal(etapa) ? "sim" : "nao"}
      data-sobre={sobre && podeReceber ? "sim" : "nao"}
      data-alvo={podeReceber ? "sim" : "nao"}
      aria-labelledby={idTitulo}
      onDragEnter={(e) => {
        if (!podeReceber) return;
        e.preventDefault();
        profundidade.current += 1;
        setSobre(true);
      }}
      onDragOver={(e) => {
        if (!podeReceber) return;
        // Ver armadilha 1 no comentário do topo.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={() => {
        if (!podeReceber) return;
        profundidade.current -= 1;
        if (profundidade.current <= 0) sair();
      }}
      onDrop={(e) => {
        if (!podeReceber) return;
        e.preventDefault();
        // O id vem do dataTransfer quando o navegador deixa; o estado do
        // quadro é a rede de segurança (Safari já perdeu `text/plain` em
        // arraste entre elementos da mesma página).
        const id = e.dataTransfer.getData("text/plain") || arrastando;
        sair();
        if (id) aoMover(id, etapa);
      }}
    >
      <header className={estilo.cabeca}>
        <h2 className={estilo.nomeColuna} id={idTitulo}>
          {nome}
        </h2>
        {frios > 0 && (
          <span className={estilo.frios} title={`${frios} parado(s) há mais de 7 dias`}>
            {frios} frio{frios > 1 ? "s" : ""}
          </span>
        )}
        <span className={estilo.conta} aria-label={`${cartoes.length} leads nesta coluna`}>
          {cartoes.length}
        </span>
      </header>

      <ul className={estilo.pilha}>
        {cartoes.map((c) => (
          <CartaoLead
            key={c.id}
            cartao={c}
            salvando={salvando.has(c.id)}
            arrastando={arrastando === c.id}
            aoAbrir={aoAbrir}
            aoMover={aoMover}
            aoIniciarArraste={aoIniciarArraste}
            aoTerminarArraste={aoTerminarArraste}
          />
        ))}

        {cartoes.length === 0 && (
          <li className={estilo.vazia}>{podeReceber ? "solte aqui" : "vazia"}</li>
        )}
      </ul>
    </section>
  );
}
