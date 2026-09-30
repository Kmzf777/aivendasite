import ObjecoesEditor from "@/components/ObjecoesEditor";
import { normalizarLimiares } from "@/components/ObjecoesTipos";
import { lerObjecoes, lerLimiares } from "@/lib/servidor";

/**
 * Tela de configuração do Jev: o catálogo de objeções e os limiares.
 *
 * A carga inicial vem do disco aqui, no servidor, e não de um fetch no
 * cliente, por dois motivos:
 *   1. GET /api/objecoes devolve um ARRAY PURO porque a extensão do Chrome
 *      consome esse endpoint e quebraria com envelope — então não há como os
 *      limiares chegarem por ali.
 *   2. Sem fetch no cliente a tela abre já preenchida, sem piscar vazia.
 *
 * O salvamento, sim, vai por PUT /api/objecoes com {lista, limiares}.
 */
export const dynamic = "force-dynamic";

export default function PaginaObjecoes() {
  const lista = lerObjecoes();
  // Ausente ou incompleto, limiares.json cai nos padrões do CONFIG.
  const limiares = normalizarLimiares(lerLimiares());

  return <ObjecoesEditor listaInicial={lista} limiaresIniciais={limiares} />;
}
