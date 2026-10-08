"use client";

import { useEffect, useRef } from "react";
import type { Amostra, Modo } from "@/hooks/motorCopiloto";
import estilo from "./CurvaVoz.module.css";

type Props = {
  /** Lê a janela de amostras do motor. Chamada a cada quadro. */
  ler: () => Amostra[];
  /** Converte energia crua em 0..1 na escala do caminho de medição ativo. */
  escala: (x: number) => number;
  modo: Modo;
  ativo: boolean;
};

const PASSO = 3; // px por amostra
const CINTURA = 1.6; // largura do traço

// Curva de voz. Desenhada em canvas, dentro de um requestAnimationFrame,
// lendo o motor direto: 20 amostras por segundo virando estado de React
// seriam 20 re-renderizações por segundo numa tela que tem que ser rápida.
export default function CurvaVoz({ ler, escala, modo, ativo }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = ref.current;
    if (!tela) return;
    const pincel = tela.getContext("2d");
    if (!pincel) return;

    let quadro = 0;
    let largura = 0;
    let altura = 0;
    let cVoce = "#5978fd";
    let cCliente = "#d53d00";
    let cMudo = "#2b323c";

    // As cores vêm dos tokens em globals.css: não existe uma segunda
    // paleta escondida aqui dentro.
    const lerCores = () => {
      const cs = getComputedStyle(tela);
      cVoce = cs.getPropertyValue("--voce").trim() || cVoce;
      cCliente = cs.getPropertyValue("--cliente").trim() || cCliente;
      cMudo = cs.getPropertyValue("--linha-viva").trim() || cMudo;
    };

    const medir = () => {
      const r = tela.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      largura = Math.max(1, Math.round(r.width));
      altura = Math.max(1, Math.round(r.height));
      tela.width = Math.round(largura * dpr);
      tela.height = Math.round(altura * dpr);
      pincel.setTransform(dpr, 0, 0, dpr, 0, 0);
      lerCores();
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(tela);

    // Movimento reduzido: a curva é informação, não enfeite, então
    // continua viva — mas a 10 Hz em vez de 60.
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)");
    let ultimo = 0;

    const pintar = (agora: number) => {
      quadro = requestAnimationFrame(pintar);
      if (calmo.matches && agora - ultimo < 100) return;
      ultimo = agora;

      pincel.clearRect(0, 0, largura, altura);

      const meio = altura / 2;
      // Linha de repouso: dá eixo para a curva e mostra que está viva.
      pincel.fillStyle = cMudo;
      pincel.fillRect(0, meio - 0.5, largura, 1);
      if (!ativo) return;

      const todas = ler();
      const quantas = Math.floor(largura / PASSO);
      const inicio = Math.max(0, todas.length - quantas);
      const teto = meio - 2;

      for (let i = inicio; i < todas.length; i++) {
        const a = todas[i];
        const x = largura - (todas.length - i) * PASSO;
        if (x < 0) continue;

        if (modo === "dois") {
          // Duas entradas: você para cima, cliente para baixo. A leitura é
          // literal — qual canal está recebendo som.
          const hV = Math.min(1, escala(a.eV)) * teto;
          const hC = Math.min(1, escala(a.eC)) * teto;
          pincel.fillStyle = cVoce;
          pincel.fillRect(x, meio - hV, CINTURA, hV);
          pincel.fillStyle = cCliente;
          pincel.fillRect(x, meio, CINTURA, hC);
        } else {
          // Push-to-talk: uma entrada só, simétrica, pintada por quem a
          // tecla dizia que estava falando naquele instante.
          const h = Math.min(1, escala(a.eV)) * teto;
          pincel.fillStyle = a.seu ? cVoce : cCliente;
          pincel.fillRect(x, meio - h, CINTURA, h * 2 || 1);
        }
      }
    };

    quadro = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
    };
  }, [ler, escala, modo, ativo]);

  return <canvas ref={ref} className={estilo.tela} aria-hidden />;
}
