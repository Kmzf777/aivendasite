"use client";

import { useEffect, useState } from "react";
import type { Fluxo } from "./motorCopiloto";

// O fluxo como a tela o recebe: o que o motor consome (Fluxo) mais o
// objetivo, que não é usado por máquina nenhuma — é a frase que faz o
// vendedor escolher o botão certo.
export type FluxoListado = Fluxo & { objetivo?: string };

// Carrega a lista de fluxos de /api/fluxos.
//
// Ao contrário do useCatalogo, este hook NÃO entrega nada ao motor: quem
// escolhe é o vendedor, no clique do SeletorFluxo. Deduzir por ele é a
// aposta mais cara da tela — fluxo errado dá dica errada a ligação inteira.
//
// Lista vazia também não é erro: sem fluxo o copiloto funciona como antes,
// só com card de objeção. Por isso `erro` só enche quando a busca falha de
// verdade, e `pronto` existe para o modal não dizer "nenhum fluxo" no meio
// segundo em que a resposta ainda está no ar.
//
// Buscar duas vezes (StrictMode) é inofensivo: é GET e a segunda resposta
// repõe o mesmo conteúdo. O AbortController está aqui para não escrever
// estado numa tela que já saiu.
export function useFluxos(): { fluxos: FluxoListado[]; erro: string | null; pronto: boolean } {
  const [fluxos, setFluxos] = useState<FluxoListado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const corte = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/fluxos", { signal: corte.signal });
        const l = (await r.json()) as FluxoListado[];
        if (corte.signal.aborted) return;
        setFluxos(Array.isArray(l) ? l : []);
        setErro(null);
        setPronto(true);
      } catch (e) {
        if (corte.signal.aborted) return;
        setErro("Não consegui ler os fluxos: " + (e as Error).message);
        setPronto(true);
      }
    })();
    return () => corte.abort();
  }, []);

  return { fluxos, erro, pronto };
}
