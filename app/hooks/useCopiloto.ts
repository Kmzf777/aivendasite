"use client";

import { useEffect, useSyncExternalStore } from "react";
import { obterMotor, ESTADO_INICIAL, type Estado, type MotorCopiloto } from "./motorCopiloto";

// A tela lê o motor por assinatura, não por estado de React.
//
// POR QUE useSyncExternalStore: o motor vive fora do React de propósito
// (ver o bloco da trava em motorCopiloto.ts). Este hook é só uma janela
// para ele — não cria, não liga e não desliga nada num efeito.
//
// O `reter`/`liberar` do efeito existe para o caminho oposto: sair da
// tela de verdade tem que desligar o microfone. A soltura é adiada
// dentro do motor justamente porque o StrictMode desmonta e remonta,
// e um desligamento imediato mataria a call num remonte.
export function useCopiloto(): { estado: Estado; motor: MotorCopiloto } {
  const motor = obterMotor();

  // No servidor não existe motor com estado: devolve o inicial, que é o
  // mesmo objeto em toda renderização (exigência do useSyncExternalStore).
  const estado = useSyncExternalStore(motor.assinar, motor.ler, () => ESTADO_INICIAL);

  useEffect(() => {
    motor.reter();
    return () => motor.liberar();
  }, [motor]);

  return { estado, motor };
}
