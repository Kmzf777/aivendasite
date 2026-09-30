// ==================================================================
// Tipos, padrões e helpers do catálogo de objeções.
//
// Mora em components/ porque lib/ pertence a outra frente nesta rodada.
// Nada aqui renderiza: é só o contrato dos dados que a tela edita.
// ==================================================================

/**
 * Uma objeção do catálogo.
 *
 * Os 13 campos conhecidos estão declarados, mas a assinatura de índice no fim
 * é deliberada: o arquivo objecoes.json é consumido por outras partes do
 * sistema (a extensão do Chrome, os scripts de medição) e já hoje traz campos
 * que este formulário não mostra — `nucleos_nicho_petshop`, por exemplo.
 * Guardar o objeto INTEIRO no estado, e editar só por spread, é o que garante
 * que esses campos voltem intactos para o disco ao salvar.
 */
export type Objecao = {
  /** Chave estável. O Jev devolve este id para dizer QUAL objeção é. Imutável depois de criada. */
  id: string;
  nome: string;
  tipo: string;
  momento: string;
  /** A descrição que o Jev casa com a fala do cliente. O campo que mais afeta o acerto. */
  comoSoa: string;
  nucleos: string[];
  /** A frase curta do card — o que o vendedor vai falar. */
  headline: string;
  argumento: string;
  /** A regra tática que evita o erro clássico daquela objeção. */
  pivot: string;
  fonte: string;
  evidencia: string;
  precisa_de_prova: boolean;
  [extra: string]: unknown;
};

/**
 * Uma linha da tela: a objeção mais uma chave interna estável.
 *
 * A chave NÃO vai para o disco e nada tem a ver com o `id`. Existe porque o
 * `id` é editável enquanto a objeção é nova, e usar o id para saber qual linha
 * está selecionada fazia o editor pular para OUTRA objeção no instante em que
 * o usuário digitava um id que já existia — e ele seguia editando o registro
 * errado sem perceber.
 */
export type Linha = { chave: string; dado: Objecao };

/** Os campos que este formulário conhece. Tudo fora desta lista é preservado sem ser editado. */
export const CAMPOS_CONHECIDOS: readonly string[] = [
  "id",
  "nome",
  "tipo",
  "momento",
  "comoSoa",
  "nucleos",
  "headline",
  "argumento",
  "pivot",
  "fonte",
  "evidencia",
  "precisa_de_prova",
];

/** Os três campos que fazem o sistema funcionar. Ganham destaque na tela. */
export const CAMPOS_CHAVE: readonly string[] = ["comoSoa", "headline", "pivot"];

// ---------------------------------------------------------------- limiares

export type Limiares = {
  limiarObjecao: number;
  limiarConfianca: number;
  limiarConfiancaSozinha: number;
  limiarTerminou: number;
  modelo: string;
};

/**
 * Os padrões, copiados do objeto CONFIG de lib/decisao.js.
 * Ficam visíveis na tela para o usuário sempre ter como voltar atrás.
 */
export const LIMIARES_PADRAO: Limiares = {
  limiarObjecao: 0.6,
  limiarConfianca: 0.5,
  limiarConfiancaSozinha: 0.95,
  limiarTerminou: 0.5,
  modelo: "jev-1.13.0",
};

/** Só as chaves de 0 a 1. Separadas do `modelo` para o painel poder escrever nelas com tipo. */
export type ChaveNumerica =
  | "limiarObjecao"
  | "limiarConfianca"
  | "limiarConfiancaSozinha"
  | "limiarTerminou";

export type DescricaoLimiar = {
  chave: ChaveNumerica;
  rotulo: string;
  explicacao: string;
  /** Marca a segunda porta, que merece uma explicação mais longa. */
  segundaPorta?: boolean;
};

export const LIMIARES_NUMERICOS: readonly DescricaoLimiar[] = [
  {
    chave: "limiarObjecao",
    rotulo: "Houve objeção?",
    explicacao:
      "Quão certo o Jev precisa estar de que o cliente levantou uma objeção. Mais alto = menos cards e menos falso positivo.",
  },
  {
    chave: "limiarConfianca",
    rotulo: "Qual objeção é?",
    explicacao:
      "Quão certo o Jev precisa estar da escolha dentro do catálogo. Mais alto = só mostra o card quando a escolha está firme.",
  },
  {
    chave: "limiarConfiancaSozinha",
    rotulo: "Segunda porta",
    explicacao:
      "Aprova o card só pela confiança da escolha, ignorando o «houve objeção?». Existe para quando o cliente RESPONDE em vez de objetar — ali o tem_objecao fica baixo de propósito e a escolha vem certíssima.",
    segundaPorta: true,
  },
  {
    chave: "limiarTerminou",
    rotulo: "A frase terminou?",
    explicacao:
      "Abaixo disso a frase do cliente está cortada no meio: o sistema espera o resto antes de decidir.",
  },
];

// ---------------------------------------------------------------- helpers

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/**
 * Preenche os campos conhecidos que estiverem faltando, sem tocar em mais nada.
 * O spread vem PRIMEIRO de propósito: qualquer campo extra do arquivo sobrevive.
 */
export function normalizar(bruto: unknown): Objecao {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    ...o,
    id: texto(o.id),
    nome: texto(o.nome),
    tipo: texto(o.tipo) || "objecao",
    momento: texto(o.momento) || "cold_call",
    comoSoa: texto(o.comoSoa),
    nucleos: Array.isArray(o.nucleos) ? o.nucleos.map(texto).filter(Boolean) : [],
    headline: texto(o.headline),
    argumento: texto(o.argumento),
    pivot: texto(o.pivot),
    fonte: texto(o.fonte),
    evidencia: texto(o.evidencia) || "derivada",
    precisa_de_prova: o.precisa_de_prova === true,
  };
}

/** Uma objeção nova, em branco, pronta para receber o id que o usuário escolher. */
export function objecaoEmBranco(id: string): Objecao {
  return normalizar({ id, tipo: "objecao", momento: "cold_call", evidencia: "derivada" });
}

/** Os pares [campo, valor] que o formulário não mostra — exibidos como preservados. */
export function camposExtras(o: Objecao): [string, unknown][] {
  return Object.entries(o).filter(([k]) => !CAMPOS_CONHECIDOS.includes(k));
}

/** Aceita o que veio de limiares.json (ou nada) e devolve algo sempre completo e dentro da faixa. */
export function normalizarLimiares(bruto: unknown): Limiares {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const num = (v: unknown, padrao: number) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : padrao;
  };
  return {
    limiarObjecao: num(o.limiarObjecao, LIMIARES_PADRAO.limiarObjecao),
    limiarConfianca: num(o.limiarConfianca, LIMIARES_PADRAO.limiarConfianca),
    limiarConfiancaSozinha: num(o.limiarConfiancaSozinha, LIMIARES_PADRAO.limiarConfiancaSozinha),
    limiarTerminou: num(o.limiarTerminou, LIMIARES_PADRAO.limiarTerminou),
    modelo: texto(o.modelo) || LIMIARES_PADRAO.modelo,
  };
}

/**
 * id no formato do catálogo: minúsculas, sem acento, separado por _.
 *
 * Roda a cada tecla enquanto o usuário digita, e por isso NÃO corta o _ do
 * fim: quem digita "ta_caro" passa por "ta_" no caminho, e cortar ali comia
 * o separador antes da próxima letra chegar. O _ inicial, esse sim, cai.
 */
export function paraId(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+/, "")
    .slice(0, 48);
}

/** Um id livre a partir de uma base, para não colidir com o que já existe. */
export function idLivre(base: string, usados: Set<string>): string {
  const raiz = paraId(base) || "nova_objecao";
  if (!usados.has(raiz)) return raiz;
  for (let n = 2; n < 999; n++) {
    const tentativa = `${raiz}_${n}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  return `${raiz}_${Date.now()}`;
}

/**
 * JSON com as chaves em ordem alfabética.
 * Serve para comparar "o que está na tela" com "o que está no disco" sem que
 * a ordem das chaves invente uma diferença que não existe.
 */
export function estavel(v: unknown): string {
  return JSON.stringify(v, (_chave, valor) => {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      const entradas = Object.entries(valor as Record<string, unknown>);
      entradas.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return Object.fromEntries(entradas);
    }
    return valor;
  });
}

export const TIPOS = [
  { valor: "objecao", rotulo: "objeção" },
  { valor: "pergunta", rotulo: "pergunta" },
  { valor: "triagem", rotulo: "triagem" },
  { valor: "stop", rotulo: "stop" },
];

export const EVIDENCIAS = [
  { valor: "gravada", rotulo: "gravada — a objeção e a resposta saíram de uma call real" },
  {
    valor: "objecao_gravada_resposta_nossa",
    rotulo: "objeção gravada, resposta nossa — ouvimos a objeção, o argumento é autoral",
  },
  { valor: "derivada", rotulo: "derivada — montada por analogia com outra objeção" },
  { valor: "nao_observada", rotulo: "não observada — ainda não vimos ninguém falar isso" },
];
