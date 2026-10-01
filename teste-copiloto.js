// A ligacao inteira passando pelo copiloto, sem microfone, sem rede, sem Jev.
// As respostas do Jev sao forjadas aqui com a forma exata que a API devolve.
//
//   node teste-copiloto.js

const fs = require("fs");
const path = require("path");
const K = require("./lib/copiloto.js");
const F = require("./lib/fluxo.js");

let falhas = 0;
function checa(nome, ok, extra) {
  console.log((ok ? "  ok    " : "  FALHA ") + nome);
  if (!ok) { falhas++; if (extra !== undefined) console.log("        " + JSON.stringify(extra)); }
}

const FLUXO = JSON.parse(fs.readFileSync(path.join(__dirname, "fluxos", "prospeccao.json"), "utf8"));

// Catalogo pequeno e controlado: o banco de verdade nao entra em teste unitario.
const OBJECOES = [
  { id: "ta_caro", nome: "Tá caro", tipo: "objecao", headline: "Explique o motivo do preço",
    comoSoa: "price", argumento: "...", pivot: "..." },
  { id: "stop_nao_ligue", nome: "Não ligue mais", tipo: "stop", headline: "Encerre com educação",
    comoSoa: "stop", argumento: "...", pivot: "..." }
];

// ---- respostas forjadas, na forma que a API devolve ----
const cliente = (o) => ({ answers: {
  tem_objecao: { type: "noul", noul: o.obj === undefined ? 0.05 : o.obj },
  objecao: { type: "choice", choice: o.escolha || "nenhuma", confidence: o.conf === undefined ? 0.9 : o.conf },
  terminou_de_falar: { type: "noul", noul: o.fim === undefined ? 0.95 : o.fim },
  fase: { type: "choice", choice: "abertura", confidence: 0.8 },
  sentimento: { type: "choice", choice: o.sent || "neutro", confidence: 0.85 }
} });

const vendedor = (acao, etapa, conf) => ({ answers: {
  acao: { type: "choice", choice: acao, confidence: conf === undefined ? 0.9 : conf },
  etapa: { type: "choice", choice: etapa || "alo", confidence: 0.4 }
} });

const dicasDe = (r) => r.dicas.map(d => d.texto);
const etapaDe = (co) => F.etapaAtual(FLUXO, co.etapa).id;

// ------------------------------------------------------------------
console.log("\nperguntas");

const pc = K.perguntasDoCliente(OBJECOES);
checa("turno do cliente mantem as 4 de sempre",
  !!pc.tem_objecao && !!pc.objecao && !!pc.fase && !!pc.terminou_de_falar);
checa("turno do cliente ganha o sentimento", !!pc.sentimento && pc.sentimento.type === "choice");
checa("sentimento tem 4 opcoes", Object.keys(pc.sentimento.criteria).length === 4);

let co = K.copilotoInicial(FLUXO);
const pv = K.perguntasDoVendedor(FLUXO, co);
checa("turno do vendedor pergunta acao e etapa", !!pv.acao && !!pv.etapa);
checa("lista de acao tem a saida 'nenhuma'", !!pv.acao.criteria.nenhuma);
checa("lista de etapa nao oferece etapa passada",
  Object.keys(K.perguntasDoVendedor(FLUXO, { etapa: { etapa: 3, feitas: [], visto: [] } }).etapa.criteria)
    .indexOf("alo") === -1);

// ------------------------------------------------------------------
console.log("\no vendedor fala e o sistema cobra o que faltou");

checa("comeca no alo", etapaDe(co) === "alo");

let r = K.turnoDoVendedor(FLUXO, co, vendedor("nenhuma", "alo"), "Alô?");
checa("fala que nao cumpre nada mantem a cobranca",
  dicasDe(r).join() === "Cumprimente e confirme o lugar", dicasDe(r));

r = K.turnoDoVendedor(FLUXO, co, vendedor("confirmou_o_lugar", "alo"), "Aí é a Clínica Bem Estar?");
co = r.co;
checa("acao reconhecida avanca a etapa", etapaDe(co) === "nome_dela");
checa("a dica passa a ser a da etapa nova",
  dicasDe(r).join() === "Pergunte o nome de quem atendeu", dicasDe(r));

r = K.turnoDoVendedor(FLUXO, co, vendedor("confirmou_o_lugar", "alo", 0.3), "...");
checa("acao com confianca baixa nao e registrada", etapaDe(r.co) === "nome_dela");

r = K.turnoDoVendedor(FLUXO, co, vendedor("perguntou_o_nome_dela", "nome_dela"), "Como é o seu nome?");
co = r.co;
checa("chegou na apresentacao", etapaDe(co) === "apresentacao");
checa("etapa com 3 exigencias cobra as 3", r.dicas.length === 3, dicasDe(r));

// ------------------------------------------------------------------
console.log("\nenquanto o cliente fala, lacuna nao aparece");

r = K.turnoDoCliente(FLUXO, co, cliente({}), "Meu nome é Cristiane", OBJECOES);
co = r.co;
// A fala do cliente nao LEVANTA lacuna nova. As que ja estavam em tela seguem
// ali de proposito: ele continua sem ter dito o nome, e apagar a dica porque o
// cliente abriu a boca e exatamente o tremor que a sustentacao evita.
checa("a vez do cliente nao levanta lacuna nova",
  r.dicas.every(d => d.nova === false), r.dicas);
checa("as lacunas pendentes continuam em tela",
  r.dicas.length > 0 && r.dicas.every(d => d.tipo === "lacuna"), dicasDe(r));
checa("mas a colheita pegou o nome dela",
  co.colheita.nomes.some(n => n.nome === "Cristiane" && n.papel === "atendente"), co.colheita.nomes);

// ------------------------------------------------------------------
console.log("\nobjecao e sentimento");

r = K.turnoDoCliente(FLUXO, co, cliente({ obj: 0.9, escolha: "ta_caro", conf: 0.9 }), "achei caro", OBJECOES);
checa("objecao vira dica", dicasDe(r)[0] === "Explique o motivo do preço", dicasDe(r));

r = K.turnoDoCliente(FLUXO, co, cliente({ sent: "apressado" }), "to sem tempo agora", OBJECOES);
checa("sentimento explicito vira dica", dicasDe(r).indexOf("Vá direto ao ponto") > -1, dicasDe(r));

r = K.turnoDoCliente(FLUXO, co, cliente({ sent: "neutro" }), "sei", OBJECOES);
checa("sentimento neutro nao ocupa a tela", r.dicas.length === 0, dicasDe(r));

r = K.turnoDoCliente(FLUXO, co,
  cliente({ obj: 0.9, escolha: "stop_nao_ligue", conf: 0.95, sent: "fechado" }), "não me liga mais", OBJECOES);
checa("STOP limpa tudo e fica sozinho",
  r.dicas.length === 1 && r.dicas[0].texto === "Encerre com educação", dicasDe(r));

// ------------------------------------------------------------------
console.log("\no plano B some quando a ligacao ja ganhou o telefone");

// Caminho A: o dono NAO deu o numero. As saidas de plano B tem que ser cobradas.
let semTel = K.copilotoInicial(FLUXO);
["confirmou_o_lugar", "perguntou_o_nome_dela", "se_apresentou_com_a_ufu",
 "disse_de_onde_veio_o_contato", "cravou_o_tempo", "perguntou_quem_decide",
 "perguntou_o_nome_do_dono", "perguntou_o_melhor_horario", "perguntou_se_atende_no_whats"
].forEach(a => { semTel = K.turnoDoVendedor(FLUXO, semTel, vendedor(a), "...").co; });
checa("sem telefone, cai no plano B", etapaDe(semTel) === "saida_a", F.resumo(FLUXO, semTel.etapa));

// Caminho B: o cliente dita o numero. As duas saidas viram desnecessarias.
let comTel = K.copilotoInicial(FLUXO);
["confirmou_o_lugar", "perguntou_o_nome_dela", "se_apresentou_com_a_ufu",
 "disse_de_onde_veio_o_contato", "cravou_o_tempo", "perguntou_quem_decide",
 "perguntou_o_nome_do_dono", "perguntou_o_melhor_horario"
].forEach(a => { comTel = K.turnoDoVendedor(FLUXO, comTel, vendedor(a), "...").co; });
comTel = K.turnoDoCliente(FLUXO, comTel, cliente({}),
  "o dele é 34 nove nove nove um dois tres quatro cinco seis", OBJECOES).co;
comTel = K.turnoDoVendedor(FLUXO, comTel, vendedor("perguntou_se_atende_no_whats"), "ele atende no whats?").co;
checa("com telefone na mao, pula as duas saidas de plano B",
  etapaDe(comTel) === "aquecer", F.resumo(FLUXO, comTel.etapa));

// ------------------------------------------------------------------
console.log("\nfim da ligacao");

let fim = K.copilotoInicial(FLUXO);
const LIGACAO = [
  ["v", "Alô, boa tarde! Aí é a Clínica Bem Estar?", "confirmou_o_lugar"],
  ["c", "É sim, meu nome é Cristiane"],
  ["v", "Prazer Cristiane, como é o seu nome? digo, obrigado", "perguntou_o_nome_dela"],
  ["v", "Meu nome é Lucas, sou aluno da UFU", "se_apresentou_com_a_ufu"],
  ["v", "Achei o contato de vocês no Google", "disse_de_onde_veio_o_contato"],
  ["v", "Tenho um assunto de um minuto", "cravou_o_tempo"],
  ["v", "Quem cuida do site de vocês?", "perguntou_quem_decide"],
  ["c", "Ah, é com o Vicente, mas ele só vem de manhã"],
  ["v", "Qual o nome dele mesmo?", "perguntou_o_nome_do_dono"],
  ["c", "O whats dele é 34999123456"],
];
LIGACAO.forEach(([q, txt, acao]) => {
  fim = q === "v"
    ? K.turnoDoVendedor(FLUXO, fim, vendedor(acao), txt).co
    : K.turnoDoCliente(FLUXO, fim, cliente({}), txt, OBJECOES).co;
});

const f = K.fimDaLigacao(FLUXO, fim);
const campo = (c) => (f.confirmar.find(i => i.campo === c) || {}).valor;

checa("confirmacao traz quem atendeu", campo("Quem atendeu") === "Cristiane", f.confirmar);
checa("confirmacao traz o dono", campo("Nome do dono") === "Vicente", f.confirmar);
checa("confirmacao traz o telefone", campo("Telefone citado") === "(34) 99912-3456", f.confirmar);
checa("confirmacao traz o horario", (campo("Melhor horário") || "").indexOf("manh") === 0, f.confirmar);
checa("o resumo diz onde a ligacao parou", !!f.resumo.etapa, f.resumo);
checa("o fim lista o que ficou por fazer", Array.isArray(f.naoFez));
checa("nada vai para a ficha sozinho",
  fim.colheita.telefones.concat(fim.colheita.nomes).every(x => x.confirmado === false));

console.log(falhas ? "\n" + falhas + " FALHA(S)\n" : "\nTUDO OK\n");
process.exit(falhas ? 1 : 0);
