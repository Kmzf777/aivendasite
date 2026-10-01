"use client";

import type { Dica } from "@/hooks/motorCopiloto";
import estilo from "./PainelDicas.module.css";

type Props = {
  dicas: Dica[];
  etapa: string | null;
  etapaPos: string | null;
};

// Cor por tipo, na mesma precedência de lib/dicas.js.
//
// Mapa em vez de ternário encadeado porque o compilador cobra o caso que
// faltar: nascer um quinto tipo no motor e esta linha quebrar o build é o
// barato. Quebrar em silêncio no meio de uma ligação — a dica mais urgente
// pintada de cinza — é o caro.
const COR: Record<Dica["tipo"], string> = {
  stop: estilo.stop,
  objecao: estilo.objecao,
  lacuna: estilo.lacuna,
  sentimento: estilo.sentimento,
};

// Até três ordens curtas empilhadas, e a etapa da ligação embaixo.
//
// Isto NÃO é o CardObjecao. O card é para falar; a dica é para o vendedor
// ler, raciocinar e falar com as palavras dele. Por isso aqui não entra
// nada do vocabulário visual de citação — nem a serifada do card, nem
// aspas, nem corpo grande. Quem bate o olho aqui tem que receber uma ordem,
// não uma fala para repetir.
export default function PainelDicas({ dicas, etapa, etapaPos }: Props) {
  // Sem dica não há painel — nem para mostrar a etapa.
  // Caixa vazia é pior que nada numa tela de foco: continua sendo um lugar
  // que o olho visita, e volta de lá sem informação nenhuma. A etapa
  // sozinha não paga essa visita.
  if (dicas.length === 0) return null;

  // O teto de verdade é o CONFIG_DICAS.teto de lib/dicas.js, e a ordem já
  // vem resolvida de lá — reordenar aqui faria as linhas trocarem de lugar
  // entre rodadas, que é piscar com outro nome. Este corte é só a trava
  // para o dia em que alguém subir o teto lá: uma quarta linha cresceria o
  // painel e empurraria o card para fora do centro no meio da ligação.
  const naTela = dicas.slice(0, 3);

  return (
    // Sem aria-live de propósito. O vendedor está com um cliente no ouvido:
    // um leitor de tela anunciando cada dica nova falaria por cima da
    // ligação, que é o único canal que não pode ser disputado.
    <aside className={estilo.painel}>
      <ul className={estilo.pilha}>
        {naTela.map((dica) => (
          // `key` pelo id da dica, nunca pelo índice.
          //
          // É a key que decide se a entrada reacende: a dica herdada
          // (nova: false) mantém o MESMO nó do DOM e por isso não anima de
          // novo. Com key por índice, uma dica que sobe de posição porque a
          // de cima saiu herdaria o nó da vizinha e reacenderia sozinha —
          // exatamente o ruído que este sistema foi desenhado para evitar.
          <li
            key={dica.id}
            className={`${estilo.dica} ${COR[dica.tipo]} ${dica.nova ? estilo.nova : ""}`}
          >
            <i className={estilo.marca} aria-hidden />
            <span className={estilo.texto}>{dica.texto}</span>
          </li>
        ))}
      </ul>

      {etapa && (
        <p className={estilo.etapa}>
          <span className="rotulo">{etapa}</span>
          {etapaPos && <span className={`telemetria ${estilo.posicao}`}>{etapaPos}</span>}
        </p>
      )}
    </aside>
  );
}
