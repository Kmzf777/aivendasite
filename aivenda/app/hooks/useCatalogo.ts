"use client";

import { useEffect, useState } from "react";
import { obterMotor, type Objecao } from "./motorCopiloto";
import { aplicarLimiares } from "@/lib/decisao";

// Carrega o catálogo de objeções e os limiares, e entrega ao motor.
//
// Os limiares vêm de /api/limiares, separado do catálogo porque o GET de
// /api/objecoes precisa continuar devolvendo um array puro — a extensão do
// Chrome consome aquele endpoint e quebraria com envelope.
//
// Sem esta chamada o que a tela /objecoes grava não chega na decisão: o
// CONFIG do lib/decisao.js continuaria com os padrões e os controles da
// tela seriam enfeite.
//
// Buscar duas vezes (StrictMode) é inofensivo: é GET e a última resposta
// sobrescreve a anterior com o mesmo conteúdo. O AbortController existe
// para não escrever num motor depois de a tela ter saído.
export function useCatalogo(): { objecoes: Objecao[]; erro: string | null } {
  const [objecoes, setObjecoes] = useState<Objecao[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const corte = new AbortController();
    (async () => {
      try {
        // Os limiares primeiro: valem para a primeira decisão, não da segunda
        // em diante. Se falharem, os padrões do CONFIG seguem valendo — é
        // degradação aceitável, não motivo para impedir a call.
        try {
          const rl = await fetch("/api/limiares", { signal: corte.signal });
          if (rl.ok) aplicarLimiares(await rl.json());
        } catch {}

        const r = await fetch("/api/objecoes", { signal: corte.signal });
        const l = (await r.json()) as Objecao[];
        if (corte.signal.aborted) return;
        if (!Array.isArray(l) || !l.length) {
          setErro("O catálogo voltou vazio. Cadastre as objeções antes da call.");
          return;
        }
        obterMotor().definirCatalogo(l);
        setObjecoes(l);
        setErro(null);
      } catch (e) {
        if (corte.signal.aborted) return;
        setErro("Não consegui ler o catálogo: " + (e as Error).message);
      }
    })();
    return () => corte.abort();
  }, []);

  return { objecoes, erro };
}
