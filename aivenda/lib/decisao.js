// Camada de decisão — funções puras, sem DOM e sem rede.
// Roda no browser (via <script>) e no Node (via require), de propósito:
// o teste.js tem que exercitar ESTA regra, não uma cópia dela.

// ============================================================
// CONFIG — todos os botões de ajuste do Jev num só lugar.
// Afinar o Jev depois é mudar um número aqui. Nada mais.
// ============================================================
const CONFIG = {
  // Fixado, não "jev-latest": num sistema de decisão calibrado a
  // calibragem não deve mudar sozinha embaixo da aplicação.
  modelo: "jev-1.13.0",

  limiarObjecao: 0.6,   // noul de tem_objecao para considerar que há objeção
  limiarConfianca: 0.5, // confidence da choice para mostrar o card com argumento

  // A segunda porta. Confiança que dispensa o tem_objecao, para quando o
  // cliente não está objetando e sim RESPONDENDO ("é o Vicente", "uso mais o
  // Instagram"): ali o tem_objecao fica baixo de propósito e a escolha vem
  // certíssima. Medido em medicao/RESULTADOS.md. Apertado por segurança:
  // "pode mandar no WhatsApp" casa com vou_pensar a 0.90 e NÃO pode disparar.
  limiarConfiancaSozinha: 0.95,
  limiarTerminou: 0.5,  // abaixo disso a frase está cortada: espera o resto
  limiarFase: 0.5,      // confidence mínima para mover a barra de fase

  pausaParcialMs: 700,  // silêncio que dispara a chamada com texto parcial
  historicoFalas: 8,    // quantas falas vão no state

  // US$ por 1M tokens de entrada. Saída é gratuita.
  // ATENÇÃO: não encontrado na doc oficial da TypeSafe — vem de duas fontes
  // de terceiros que concordam. Por isso a tela diz "custo estimado".
  usdPorMilhaoInput: 0.042,

  // As perguntas vão em inglês: é onde o Jev acerta mais.
  // O state vai em português, porque é a conversa real.
  instrucoes: {
    tem_objecao: "Is the customer raising an objection, concern or pushing back on the offer in their last utterance?",
    objecao: "Which of these objections best matches the customer's last utterance?",
    fase: "Which phase is this sales call currently in?",
    terminou_de_falar: "Is the customer's last utterance a complete thought, or was it cut off mid-sentence?"
  }
};

const FASES = {
  abertura: "Small talk, introductions, building rapport. The offer has not been presented yet.",
  diagnostico_dor: "The seller is asking questions to uncover the customer's problems, needs or current situation.",
  apresentacao: "The seller is explaining the product, how it works, or its benefits.",
  objecao: "The customer is pushing back, raising concerns or hesitating, and the seller is addressing it.",
  fechamento: "Talking about next steps, price agreement, contract, signing or scheduling implementation."
};

const NOMES_FASE = {
  abertura: "Abertura",
  diagnostico_dor: "Diagnóstico de dor",
  apresentacao: "Apresentação",
  objecao: "Objeção",
  fechamento: "Fechamento"
};

// Monta as 4 perguntas. `objecoes` é o catálogo do vendedor.
function montarPerguntas(objecoes) {
  const criteriaObjecao = {};
  (objecoes || []).forEach(o => { criteriaObjecao[o.id] = o.comoSoa; });
  // "nenhuma" é a saída de escape: sem ela o Jev é forçado a escolher uma
  // objeção mesmo quando o cliente não objetou nada.
  criteriaObjecao.nenhuma = "The customer is not raising any of these objections.";

  return {
    tem_objecao: {
      type: "noul",
      instructions: CONFIG.instrucoes.tem_objecao,
      criteria: {
        true: "The customer expresses a concern, a hesitation, a doubt or a blocker.",
        false: "The customer is not objecting. They are answering, agreeing, asking a neutral question or making small talk."
      }
    },
    objecao: {
      type: "choice",
      instructions: CONFIG.instrucoes.objecao,
      criteria: criteriaObjecao
    },
    fase: {
      type: "choice",
      instructions: CONFIG.instrucoes.fase,
      criteria: FASES
    },
    terminou_de_falar: {
      type: "noul",
      instructions: CONFIG.instrucoes.terminou_de_falar,
      criteria: {
        true: "The utterance is a complete thought and the customer seems done speaking.",
        false: "The utterance is cut off mid-sentence and the customer is clearly still speaking."
      }
    }
  };
}

// O state vai em português: é a conversa real.
function montarState(falas, ultimaFalaDoCliente) {
  const lista = falas || [];
  return {
    conversa: lista.slice(-CONFIG.historicoFalas),
    ultima_fala_do_cliente: ultimaFalaDoCliente
  };
}

// A regra. Devolve uma das ações:
//   "card"      -> mostra o card grande com o argumento
//   "alerta"    -> objeção detectada mas fora do catálogo (card neutro, sem argumento)
//   "esperar"   -> frase cortada, espera o resto
//   "repetida"  -> mesma objeção do card anterior, ignora
//   "nada"      -> não há objeção
//
// `ultimaMostrada` é o id da última objeção que gerou card (ou null).
function aplicarRegra(respostaJev, objecoes, ultimaMostrada) {
  const a = (respostaJev && respostaJev.answers) || {};

  const temObjecao = a.tem_objecao ? a.tem_objecao.noul : 0;
  const terminou = a.terminou_de_falar ? a.terminou_de_falar.noul : 1;
  const escolha = a.objecao ? a.objecao.choice : "nenhuma";
  const confianca = a.objecao ? a.objecao.confidence : 0;

  // A fase é independente da objeção: atualiza a barra mesmo quando não há card.
  const fase = a.fase && a.fase.confidence >= CONFIG.limiarFase ? a.fase.choice : null;

  const base = { fase, temObjecao, confianca, escolha };

  // Frase cortada é frase cortada, tenha ou não objeção aparente: o texto ainda
  // vai mudar e decidir agora é decidir sobre um pedaço. Vem ANTES do portão
  // porque o Jev acerta o corte mesmo quando a frase ainda não parece objeção
  // (medido: fim=0.09 com obj=0.41), e em viva-voz, onde o ASR corta mais, esse
  // é o caso comum. `base` vai junto, então a barra de fase não congela.
  if (terminou < CONFIG.limiarTerminou) return Object.assign({ acao: "esperar" }, base);

  const doCatalogo = (objecoes || []).find(o => o.id === escolha);
  const temCandidato = escolha !== "nenhuma" && !!doCatalogo;

  // Duas portas, não uma. A da esquerda é a de sempre: o cliente empurrou de
  // volta. A da direita é para quando ele respondeu em vez de objetar — ali o
  // tem_objecao fica baixo e só a confiança da escolha sustenta o card.
  // Em 8 dos 11 erros da regra antiga era exatamente isso (RESULTADOS.md).
  const passou = temCandidato && (
    (temObjecao >= CONFIG.limiarObjecao && confianca >= CONFIG.limiarConfianca) ||
    (confianca >= CONFIG.limiarConfiancaSozinha)
  );

  if (!passou) {
    // Empurrou de volta mas nenhum id casou com confiança: card neutro.
    if (temObjecao >= CONFIG.limiarObjecao) return Object.assign({ acao: "alerta" }, base);
    return Object.assign({ acao: "nada" }, base);
  }

  if (escolha === ultimaMostrada) return Object.assign({ acao: "repetida" }, base);

  return Object.assign({ acao: "card", objecao: doCatalogo }, base);
}

// A API não devolve custo, só tokens. Saída é gratuita.
function calcularCusto(usage) {
  if (!usage || !usage.input_tokens) return 0;
  return usage.input_tokens / 1e6 * CONFIG.usdPorMilhaoInput;
}

// ==================================================================
// Limiares salvos pela tela /objecoes
// ==================================================================
// A tela grava em limiares.json; isto aplica o que ela gravou por cima
// dos padroes. Muta o CONFIG de proposito: ele ja e o unico lugar de
// ajuste do sistema, e quem decide (montarPerguntas, aplicarRegra) le
// dele na hora da chamada, entao a mudanca vale na proxima decisao sem
// precisar recarregar nada.
//
// So aceita as chaves conhecidas e valida faixa. Um limiar fora de
// 0..1 nao e opiniao, e engano - e um limiar invalido passando calado
// quebraria a decisao de um jeito dificil de rastrear.
const LIMIARES_ACEITOS = [
  "limiarObjecao", "limiarConfianca", "limiarConfiancaSozinha",
  "limiarTerminou", "limiarFase"
];

function aplicarLimiares(novos) {
  const aplicados = {}, recusados = {};
  if (!novos || typeof novos !== "object") return { aplicados, recusados };

  for (const chave of LIMIARES_ACEITOS) {
    if (!(chave in novos)) continue;
    const v = Number(novos[chave]);
    if (Number.isFinite(v) && v >= 0 && v <= 1) { CONFIG[chave] = v; aplicados[chave] = v; }
    else recusados[chave] = novos[chave];
  }

  if (typeof novos.modelo === "string" && /^jev-[w.-]+$/.test(novos.modelo)) {
    CONFIG.modelo = novos.modelo;
    aplicados.modelo = novos.modelo;
  } else if ("modelo" in novos) {
    recusados.modelo = novos.modelo;
  }

  return { aplicados, recusados };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG, FASES, NOMES_FASE, montarPerguntas, montarState, aplicarRegra, calcularCusto, aplicarLimiares };
}
