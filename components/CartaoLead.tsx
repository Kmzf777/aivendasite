"use client";

import { useRef, useState } from "react";
import type { Etapa } from "@/lib/tipos";
import {
  decisor,
  eTerminal,
  etapaVizinha,
  nomeEtapa,
  rotuloTempo,
  temperatura,
  type CartaoLead as Cartao,
} from "./KanbanTipos";
import estilo from "./CartaoLead.module.css";

type Props = {
  cartao: Cartao;
  /** Gravação em voo: o cartão congela até o banco responder. */
  salvando: boolean;
  arrastando: boolean;
  aoAbrir: (id: string) => void;
  /** `focoApos` é o id do elemento que deve receber o foco quando o cartão
      reaparecer na outra coluna. Ver o comentário das setas, lá embaixo. */
  aoMover: (id: string, destino: Etapa, focoApos?: string) => void;
  aoIniciarArraste: (id: string) => void;
  aoTerminarArraste: () => void;
};

/** `tel:` não gosta de parênteses e espaços. */
function paraDiscagem(telefone: string): string {
  return telefone.replace(/[^\d+]/g, "");
}

// ==================================================================
// O cartão.
//
// Três informações, nesta ordem de importância:
//   1. de quem é o pet shop (o nome, que você fala ao telefone);
//   2. QUEM DECIDE e o número dele — o ativo que a prospecção produziu;
//   3. há quanto tempo ninguém toca neste lead.
//
// O (3) não é enfeite: lead qualificado esquecido é dinheiro morrendo.
// Por isso ele ganha trilho de cor na borda esquerda, que é visível na
// visão periférica — você percebe sem ler.
// ==================================================================
export default function CartaoLead({
  cartao,
  salvando,
  arrastando,
  aoAbrir,
  aoMover,
  aoIniciarArraste,
  aoTerminarArraste,
}: Props) {
  const [copiado, setCopiado] = useState(false);
  const relogioCopia = useRef<number | null>(null);

  const quem = decisor(cartao);
  const temp = temperatura(cartao.etapa, cartao.paradoHoras);
  const terminal = eTerminal(cartao.etapa);
  const anterior = etapaVizinha(cartao.etapa, -1);
  const proxima = etapaVizinha(cartao.etapa, 1);

  const copiar = async (telefone: string) => {
    try {
      await navigator.clipboard.writeText(paraDiscagem(telefone));
      setCopiado(true);
      if (relogioCopia.current) window.clearTimeout(relogioCopia.current);
      relogioCopia.current = window.setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Sem permissão de área de transferência: o número está na tela,
      // dá para ler. Mentir dizendo "copiado" seria pior.
      setCopiado(false);
    }
  };

  const iniciarArraste = (e: React.DragEvent) => {
    if (salvando) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", cartao.id);
    e.dataTransfer.effectAllowed = "move";
    // O navegador fotografa o elemento para o fantasma do arraste DEPOIS que
    // este handler termina. Se a opacidade caísse agora, o fantasma sairia
    // translúcido junto e o arraste ficaria invisível. Um tick resolve.
    window.setTimeout(() => aoIniciarArraste(cartao.id), 0);
  };

  // Clicar no corpo abre o painel. Cliques que nasceram num botão ou link de
  // dentro do cartão são ignorados aqui — eles têm a própria ação. O caminho
  // de teclado para abrir é o botão do título, que é um <button> de verdade.
  const cliqueNoCorpo = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    aoAbrir(cartao.id);
  };

  return (
    <li className={estilo.casa}>
      <article
        className={estilo.cartao}
        data-temp={temp}
        data-arrastando={arrastando ? "sim" : "nao"}
        aria-busy={salvando}
        draggable={!salvando}
        onDragStart={iniciarArraste}
        onDragEnd={aoTerminarArraste}
        onClick={cliqueNoCorpo}
      >
        <h3 className={estilo.cabeca}>
          <button
            type="button"
            id={`cartao-${cartao.id}`}
            className={estilo.titulo}
            onClick={() => aoAbrir(cartao.id)}
          >
            {cartao.nome}
          </button>
        </h3>

        {cartao.categoria && <p className={estilo.categoria}>{cartao.categoria}</p>}

        {quem ? (
          <div className={estilo.decisor}>
            <p className={estilo.quem}>
              <strong>{quem.nome || "nome não anotado"}</strong>
              {quem.cargo && <em>{quem.cargo}</em>}
            </p>
            {quem.telefone ? (
              <p className={estilo.fone}>
                {/* draggable={false} no link: sem isso o navegador trata o
                    link como origem do arraste e o cartão nunca sai do lugar. */}
                <a href={`tel:${paraDiscagem(quem.telefone)}`} draggable={false}>
                  {quem.telefone}
                </a>
                <button
                  type="button"
                  className={estilo.copiar}
                  onClick={() => void copiar(quem.telefone)}
                  aria-label={`Copiar o telefone de ${quem.nome || "quem decide"}`}
                >
                  {copiado ? "copiado" : "copiar"}
                </button>
              </p>
            ) : (
              <p className={estilo.furo}>contato sem telefone</p>
            )}
            {cartao.contatos.length > 1 && (
              <p className={estilo.mais}>
                +{cartao.contatos.length - 1}{" "}
                {cartao.contatos.length - 1 === 1 ? "contato" : "contatos"}
              </p>
            )}
          </div>
        ) : (
          // Não deveria acontecer: sem decisor o lead não seria qualificado.
          // Se acontecer, é furo de dados e o vendedor precisa saber.
          <p className={estilo.furo}>sem contato de quem decide</p>
        )}

        {/* As setas carregam id próprio porque o cartão é DESTRUÍDO e recriado
            na coluna de destino a cada movimento — nó novo, foco perdido para
            o <body>. Quem move pelo teclado seria devolvido ao início do
            documento a cada clique. O quadro usa estes ids para devolver o
            foco à mesma seta depois do movimento. */}
        <footer className={estilo.pe}>
          <button
            type="button"
            id={`seta-tras-${cartao.id}`}
            className={estilo.seta}
            // `disabled` só para o que é impossível (não há coluna antes).
            // Durante a gravação é `aria-disabled`: botão desabilitado perde
            // o foco, e perder o foco no meio de uma gravação jogaria quem
            // usa teclado para fora do cartão.
            disabled={!anterior}
            aria-disabled={salvando}
            onClick={() => {
              if (!anterior || salvando) return;
              aoMover(cartao.id, anterior, `seta-tras-${cartao.id}`);
            }}
            aria-label={
              anterior
                ? `Mover ${cartao.nome} para ${nomeEtapa(anterior)}`
                : `${cartao.nome} já está na primeira coluna`
            }
            title={anterior ? `Mover para ${nomeEtapa(anterior)}` : "Primeira coluna"}
          >
            <span aria-hidden>◀</span>
          </button>

          <span className={estilo.parado} data-temp={temp}>
            <i className={estilo.luz} aria-hidden />
            {terminal ? rotuloTempo(cartao.paradoHoras) : `parado ${rotuloTempo(cartao.paradoHoras)}`}
          </span>

          <button
            type="button"
            id={`seta-frente-${cartao.id}`}
            className={estilo.seta}
            disabled={!proxima}
            aria-disabled={salvando}
            onClick={() => {
              if (!proxima || salvando) return;
              aoMover(cartao.id, proxima, `seta-frente-${cartao.id}`);
            }}
            aria-label={
              proxima
                ? `Mover ${cartao.nome} para ${nomeEtapa(proxima)}`
                : `${cartao.nome} já está na última coluna`
            }
            title={proxima ? `Mover para ${nomeEtapa(proxima)}` : "Última coluna"}
          >
            <span aria-hidden>▶</span>
          </button>
        </footer>

        {salvando && <span className={estilo.gravando} aria-hidden />}
      </article>
    </li>
  );
}
