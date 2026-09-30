"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Entrada } from "@/hooks/useDispositivos";
import type { Estado, Modo } from "@/hooks/motorCopiloto";
import estilo from "./ModalConfig.module.css";

type Props = {
  entradas: Entrada[];
  erroEntradas: string | null;
  prontoEntradas: boolean;
  estado: Estado;
  quantasObjecoes: number;
  erroCatalogo: string | null;
  lerNiveis: () => { v: number; c: number };
  aoTestar: (op: { idV: string; idC: string; modo: Modo }) => void;
  aoPararTeste: () => void;
  aoLigar: (op: { idV: string; idC: string; modo: Modo }) => void;
};

// ------------------------------------------------------------------
// Medidor de nível. Lê o motor num requestAnimationFrame e escreve a
// largura direto no elemento: não passa por estado de React, porque
// 20 amostras por segundo não são informação nova para a árvore toda.
// ------------------------------------------------------------------
function Medidor({
  ler,
  canal,
  ativo,
}: {
  ler: () => { v: number; c: number };
  canal: "v" | "c";
  ativo: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ativo) {
      if (ref.current) ref.current.style.width = "0%";
      return;
    }
    let quadro = 0;
    const passo = () => {
      quadro = requestAnimationFrame(passo);
      const el = ref.current;
      if (!el) return;
      const n = ler();
      el.style.width = (canal === "v" ? n.v : n.c).toFixed(1) + "%";
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [ler, canal, ativo]);

  return (
    <div className={`${estilo.medidor} ${canal === "v" ? estilo.mV : estilo.mC}`}>
      <span ref={ref} />
    </div>
  );
}

// ==================================================================
// O modal de configuração. É a porta de entrada da tela: escolher a
// entrada, escolher o modo, ligar. Depois disso ele sai da frente e a
// tela vira só o card.
// ==================================================================
export default function ModalConfig({
  entradas,
  erroEntradas,
  prontoEntradas,
  estado,
  quantasObjecoes,
  erroCatalogo,
  lerNiveis,
  aoTestar,
  aoPararTeste,
  aoLigar,
}: Props) {
  const [modo, setModo] = useState<Modo>("tecla");
  const [idV, setIdV] = useState("");
  const [idC, setIdC] = useState("");

  // Quando a lista chega, escolhe a primeira entrada. Poupa um clique no
  // caso comum (um microfone só) sem esconder a escolha.
  useEffect(() => {
    if (!idV && entradas.length) setIdV(entradas[0].id);
  }, [entradas, idV]);

  const doisIguais = modo === "dois" && !!idV && idV === idC;
  const faltaC = modo === "dois" && !idC;
  // Sem catálogo o Jev não tem o que escolher: ligar seria ligar um
  // sistema que nunca mostra card. Melhor travar o botão e dizer por quê.
  const podeLigar =
    !!idV && !faltaC && !doisIguais && quantasObjecoes > 0 && estado.situacao === "parado";

  const ajuda =
    modo === "tecla"
      ? "Uma entrada só. Segure ESPAÇO enquanto você fala; solto, é o cliente. Sem hardware nenhum, e funciona com viva-voz ou presencial."
      : "Duas entradas separadas (ex.: microfone + placa USB com o cabo do celular). Determinístico, mas precisa de hardware.";

  const trocarModo = (m: Modo) => {
    if (m === modo) return;
    aoPararTeste();
    setModo(m);
  };

  return (
    <div className={estilo.fundo}>
      <section
        className={estilo.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tituloConfig"
      >
        <header className={estilo.topo}>
          <div>
            <span className="rotulo">modo foco</span>
            <h1 id="tituloConfig" className={estilo.titulo}>
              Cold call
            </h1>
          </div>
          <Link href="/" className={estilo.voltar}>
            ← painel
          </Link>
        </header>

        <div className={estilo.grupo}>
          <span className="rotulo">1 · como separar as vozes</span>
          <div className={estilo.modos}>
            <button
              type="button"
              className={`${estilo.modo} ${modo === "tecla" ? estilo.ativo : ""}`}
              onClick={() => trocarModo("tecla")}
            >
              Push-to-talk
            </button>
            <button
              type="button"
              className={`${estilo.modo} ${modo === "dois" ? estilo.ativo : ""}`}
              onClick={() => trocarModo("dois")}
            >
              Duas entradas
            </button>
          </div>
          <p className={estilo.ajuda}>{ajuda}</p>
        </div>

        <div className={estilo.grupo}>
          <span className="rotulo">2 · entradas</span>

          <label className={estilo.rot} htmlFor="entV">
            {modo === "tecla" ? "Microfone (ouve você e o cliente)" : "Você (microfone / headset)"}
          </label>
          <select
            id="entV"
            className="campo"
            value={idV}
            onChange={(e) => setIdV(e.target.value)}
            disabled={!entradas.length}
          >
            {!entradas.length && <option value="">— sem entradas —</option>}
            {entradas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </select>
          <Medidor ler={lerNiveis} canal="v" ativo={estado.testando} />

          {modo === "dois" && (
            <>
              <label className={`${estilo.rot} ${estilo.rotC}`} htmlFor="entC">
                Cliente (cabo / placa USB / linha)
              </label>
              <select
                id="entC"
                className="campo"
                value={idC}
                onChange={(e) => setIdC(e.target.value)}
                disabled={!entradas.length}
              >
                <option value="">— escolher —</option>
                {entradas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
              <Medidor ler={lerNiveis} canal="c" ativo={estado.testando} />
            </>
          )}

          <button
            type="button"
            className={`btn ${estilo.testar}`}
            onClick={() =>
              estado.testando ? aoPararTeste() : aoTestar({ idV, idC, modo })
            }
            disabled={!idV || estado.situacao !== "parado"}
          >
            {estado.testando ? "Parar teste" : "Testar níveis"}
          </button>

          {estado.testando && (
            <p className={estilo.ajuda}>
              {modo === "dois"
                ? "Fale: só a barra azul deve subir. Peça para o cliente falar: só a laranja. Se as duas sobem juntas, há vazamento — use fone."
                : "Fale e veja a barra subir. É a mesma entrada que vai ouvir os dois lados; quem separa as vozes é a tecla."}
            </p>
          )}

          {doisIguais && (
            <p className={estilo.ruim}>
              As duas entradas são o mesmo dispositivo. Sem dois canais fisicamente separados
              não dá para saber quem falou.
            </p>
          )}
        </div>

        {(erroEntradas || estado.erro) && <p className={estilo.ruim}>{erroEntradas || estado.erro}</p>}
        {estado.aviso && <p className={estilo.morno}>{estado.aviso}</p>}
        {erroCatalogo && <p className={estilo.morno}>{erroCatalogo}</p>}

        <footer className={estilo.pe}>
          <button
            type="button"
            className={`btn btn-forte ${estilo.ligar}`}
            onClick={() => aoLigar({ idV, idC, modo })}
            disabled={!podeLigar}
          >
            {estado.situacao === "ligando" ? "Ligando…" : "Ligar"}
          </button>
          <span className={`telemetria ${estilo.conta}`}>
            {quantasObjecoes ? quantasObjecoes + " objeções" : "carregando catálogo"} ·{" "}
            {estado.modelo}
            {!prontoEntradas && " · procurando entradas"}
          </span>
        </footer>

        {modo === "tecla" && (
          <p className={estilo.nota}>
            Mantenha esta janela em foco durante a call: é ela que recebe o espaço.
          </p>
        )}
      </section>
    </div>
  );
}
