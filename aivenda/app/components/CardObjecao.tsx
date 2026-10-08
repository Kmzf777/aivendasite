"use client";

import type { Card } from "@/hooks/motorCopiloto";
import estilo from "./CardObjecao.module.css";

type Props = {
  card: Card;
};

// Uma frase, centralizada. Nada mais.
//
// As versões anteriores empilhavam nome, deixa, confiança, pivot e tempo.
// Cada um defensável sozinho, e juntos um parágrafo de formulário numa tela
// que tem milissegundos para ser lida. O vendedor não vai conferir
// porcentagem com um cliente falando no ouvido: ou ele bate o olho e fala,
// ou o card falhou.
//
// O que foi cortado e por quê:
//   nome da objeção  -> o argumento já diz de que se trata;
//   confiança e ms   -> telemetria de quem depura, não de quem vende;
//   pivot            -> é regra de treino, não fala de call;
//   caixa e borda    -> moldura não é conteúdo.
export default function CardObjecao({ card }: Props) {
  const texto = card.argumento || card.headline || card.falaCliente || "";
  if (!texto) return null;

  return (
    // A animação de entrada depende de este nó ser NOVO a cada decisão.
    // Quem garante é a `key` no ponto de uso, não uma key aqui dentro.
    // Sem ela, trocar de objeção não daria sinal nenhum de mudança — e sem
    // nome nem borda, a entrada é o ÚNICO aviso de que o card é outro.
    <p className={`${estilo.fala} ${card.tipo === "alerta" ? estilo.semScript : ""}`}>
      {texto}
    </p>
  );
}
