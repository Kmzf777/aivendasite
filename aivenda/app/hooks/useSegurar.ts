"use client";

import { useEffect, useState } from "react";

// Verdadeiro enquanto a tecla `codigo` estiver presa.
//
// Usado para a seta ↓ (ver o argumento completo). NUNCA passe "Space"
// aqui: o espaço é o push-to-talk e é o motor quem o escuta, com
// timestamp de evento, porque ele rotula quem falou.
//
// O blur solta a tecla: perder o foco com ela presa deixaria o argumento
// aberto para sempre, cobrindo a headline, que é o que importa.
export function useSegurar(codigo: string, ativo = true): boolean {
  const [preso, setPreso] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setPreso(false);
      return;
    }
    const baixo = (e: KeyboardEvent) => {
      if (e.code !== codigo || e.repeat) return;
      const alvo = document.activeElement;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      e.preventDefault();
      setPreso(true);
    };
    const alto = (e: KeyboardEvent) => {
      if (e.code !== codigo) return;
      e.preventDefault();
      setPreso(false);
    };
    const solta = () => setPreso(false);

    document.addEventListener("keydown", baixo);
    document.addEventListener("keyup", alto);
    window.addEventListener("blur", solta);
    return () => {
      document.removeEventListener("keydown", baixo);
      document.removeEventListener("keyup", alto);
      window.removeEventListener("blur", solta);
      setPreso(false);
    };
  }, [codigo, ativo]);

  return preso;
}
