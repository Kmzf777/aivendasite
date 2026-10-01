const { CONFIG, montarPerguntas, montarState, aplicarRegra, calcularCusto } = require("./lib/decisao.js");
const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");

let falhas = 0;
function checa(nome, condicao, extra) {
  console.log((condicao ? "  ok   " : "  FALHA") + " " + nome + (condicao || extra === undefined ? "" : "  -> " + JSON.stringify(extra)));
  if (!condicao) falhas++;
}

// ---------- montarPerguntas ----------
console.log("\nmontarPerguntas");
const perguntas = montarPerguntas(OBJECOES_EXEMPLO);

checa("tem as 4 perguntas", JSON.stringify(Object.keys(perguntas).sort()) ===
  JSON.stringify(["fase", "objecao", "tem_objecao", "terminou_de_falar"]));
checa("tem_objecao é noul", perguntas.tem_objecao.type === "noul");
checa("terminou_de_falar é noul", perguntas.terminou_de_falar.type === "noul");
checa("objecao é choice", perguntas.objecao.type === "choice");
checa("fase é choice", perguntas.fase.type === "choice");
checa("instructions em inglês", /customer/i.test(perguntas.tem_objecao.instructions));
checa("criteria da objecao tem as 7 + nenhuma", Object.keys(perguntas.objecao.criteria).length === 8);
checa("criteria da objecao inclui nenhuma", "nenhuma" in perguntas.objecao.criteria);
checa("criteria usa o comoSoa do catálogo",
  perguntas.objecao.criteria.ta_caro === OBJECOES_EXEMPLO[0].comoSoa);
checa("fase tem as 5 etapas", JSON.stringify(Object.keys(perguntas.fase.criteria).sort()) ===
  JSON.stringify(["abertura", "apresentacao", "diagnostico_dor", "fechamento", "objecao"]));
checa("catálogo vazio ainda gera choice válido (só nenhuma)",
  Object.keys(montarPerguntas([]).objecao.criteria).length === 1);

// ---------- montarState ----------
console.log("\nmontarState");
const falas = [];
for (let i = 1; i <= 12; i++) falas.push({ quem: i % 2 ? "vendedor" : "cliente", fala: "fala " + i });
const state = montarState(falas, "e nao funcionou");

checa("corta para historicoFalas", state.conversa.length === CONFIG.historicoFalas);
checa("mantém as ÚLTIMAS falas", state.conversa[state.conversa.length - 1].fala === "fala 12");
checa("guarda a última fala do cliente", state.ultima_fala_do_cliente === "e nao funcionou");

// ---------- aplicarRegra ----------
console.log("\naplicarRegra");
const noul = v => ({ type: "noul", noul: v });
const choice = (c, conf) => ({ type: "choice", choice: c, confidence: conf, probabilities: { [c]: conf } });

function resposta(objNoul, objChoice, objConf, terminou, faseConf) {
  return { answers: {
    tem_objecao: noul(objNoul),
    objecao: choice(objChoice, objConf),
    terminou_de_falar: noul(terminou),
    fase: choice("objecao", faseConf === undefined ? 0.9 : faseConf)
  } };
}

const r1 = aplicarRegra(resposta(0.96, "ja_tentei", 1.0, 0.86), OBJECOES_EXEMPLO, null);
checa("card quando passa tudo", r1.acao === "card", r1);
checa("card traz o argumento do catálogo", r1.objecao.argumento === OBJECOES_EXEMPLO[4].argumento);
checa("card traz o nome", r1.objecao.nome === "Já tentei e não deu certo");
checa("card traz a confiança", r1.confianca === 1.0);

checa("frase cortada espera (mesmo com objeção clara)",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.20), OBJECOES_EXEMPLO, null).acao === "esperar");

// A porta da esquerda continua fechada: objeção fraca + confiança comum = nada.
// A confiança deste caso era 0.99 e caiu para 0.80 porque 0.99 agora abre a
// porta da direita de propósito — ver o teste da união logo abaixo.
checa("tem_objecao abaixo de 0.6 e confiança comum -> nada",
  aplicarRegra(resposta(0.50, "ta_caro", 0.80, 0.9), OBJECOES_EXEMPLO, null).acao === "nada");

// Patch 0001, porta da direita: o cliente RESPONDEU em vez de objetar, então o
// tem_objecao fica baixo e só a confiança da escolha sustenta o card.
checa("tem_objecao baixo mas confiança >= 0.95 -> card (união)",
  aplicarRegra(resposta(0.14, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "card");
checa("confiança logo abaixo de 0.95 não abre a porta da direita",
  aplicarRegra(resposta(0.14, "ta_caro", 0.94, 0.9), OBJECOES_EXEMPLO, null).acao === "nada");

// Patch 0001-B: frase cortada é detectada mesmo quando ainda não parece objeção.
// Antes, obj=0.41 devolvia "nada" e jogava fora um fim=0.09 correto.
checa("frase cortada espera mesmo com objeção fraca",
  aplicarRegra(resposta(0.41, "ta_caro", 0.90, 0.09), OBJECOES_EXEMPLO, null).acao === "esperar");

checa("exatamente 0.6 passa (limiar inclusivo)",
  aplicarRegra(resposta(0.60, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "card");
checa("exatamente 0.5 de confiança passa (limiar inclusivo)",
  aplicarRegra(resposta(0.9, "ta_caro", 0.50, 0.9), OBJECOES_EXEMPLO, null).acao === "card");

checa("objeção com confiança baixa -> alerta neutro",
  aplicarRegra(resposta(0.90, "ta_caro", 0.30, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");
checa("escolheu 'nenhuma' com objeção alta -> alerta neutro",
  aplicarRegra(resposta(0.90, "nenhuma", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");
checa("id fora do catálogo -> alerta neutro (não quebra)",
  aplicarRegra(resposta(0.90, "id_fantasma", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");

checa("não repete a mesma objeção seguida",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, "ta_caro").acao === "repetida");
checa("objeção diferente da anterior passa",
  aplicarRegra(resposta(0.96, "vou_pensar", 0.99, 0.9), OBJECOES_EXEMPLO, "ta_caro").acao === "card");

checa("fase sai quando confiança >= 0.5",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9, 0.80), OBJECOES_EXEMPLO, null).fase === "objecao");
checa("fase é null quando confiança < 0.5",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9, 0.20), OBJECOES_EXEMPLO, null).fase === null);

checa("resposta sem answers não quebra",
  aplicarRegra({}, OBJECOES_EXEMPLO, null).acao === "nada");

// ---------- calcularCusto ----------
console.log("\ncalcularCusto");
checa("1M tokens de entrada = a tarifa", calcularCusto({ input_tokens: 1000000, output_tokens: 999 }) === CONFIG.usdPorMilhaoInput);
checa("676 tokens", Math.abs(calcularCusto({ input_tokens: 676, output_tokens: 150 }) - 676 / 1e6 * CONFIG.usdPorMilhaoInput) < 1e-12);
checa("saída é gratuita", calcularCusto({ input_tokens: 0, output_tokens: 500000 }) === 0);
checa("usage ausente = 0", calcularCusto(undefined) === 0);

// ---------- catálogo de exemplo ----------
console.log("\nobjecoes-exemplo");
checa("tem 7 objeções", OBJECOES_EXEMPLO.length === 7);
checa("ids únicos", new Set(OBJECOES_EXEMPLO.map(o => o.id)).size === 7);
checa("nenhum id é 'nenhuma' (reservado)", !OBJECOES_EXEMPLO.some(o => o.id === "nenhuma"));
checa("todas têm nome, comoSoa e argumento", OBJECOES_EXEMPLO.every(o => o.nome && o.comoSoa && o.argumento));

console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
process.exit(falhas === 0 ? 0 : 1);
