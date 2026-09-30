"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Entrada = { id: string; rotulo: string };

const CRU = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

// Lista as entradas de áudio.
//
// Sem permissão os rótulos vêm vazios, então pedimos acesso primeiro e
// soltamos o stream na hora. O `pedido` (useRef) evita que o StrictMode
// peça o microfone duas vezes na montagem dupla — o segundo pedido não
// quebraria nada, mas acende o indicador de gravação do navegador de novo
// sem motivo.
export function useDispositivos() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const pedido = useRef(false);

  const listar = useCallback(async (pedirPermissao: boolean) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setErro("Este navegador não expõe navigator.mediaDevices. Use o Chrome.");
      return;
    }
    if (pedirPermissao) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: CRU });
        s.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const x = e as Error;
        setErro("Preciso de acesso ao microfone para listar as entradas: " + x.name);
        setPronto(true);
        return;
      }
    }
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audioinput"
    );
    setEntradas(
      devs.map((d) => ({ id: d.deviceId, rotulo: d.label || "Entrada " + d.deviceId.slice(0, 6) }))
    );
    setErro(null);
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pedido.current) {
      pedido.current = true;
      void listar(true);
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const aoMudar = () => void listar(false);
    navigator.mediaDevices.addEventListener("devicechange", aoMudar);
    return () => navigator.mediaDevices.removeEventListener("devicechange", aoMudar);
  }, [listar]);

  return { entradas, erro, pronto, recarregar: () => listar(true) };
}
