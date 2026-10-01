// Testes da maquina de etapas e da selecao de dicas. Sem rede, sem browser.
//
//   node teste-fluxo.js

const F = require("./lib/fluxo.js");
const D = require("./lib/dicas.js");

let falhas = 0;
function checa(nome, ok, extra) {
  console.log((ok ? "  ok    " : "  FALHA ") + nome);
  if (!ok) { falhas++; if (extra !== undefined) console.log("        " + JSON.stringify(extra)); }
}

// Fluxo de brinquedo: pequeno o bastante para o teste ser legivel.
const FLUXO = {
  id: "teste",
  nome: "Fluxo de teste",
  acoes: [
    { id: "cumprimentou", comoSoa: "The seller greets.", dica: "Cumprimente e pare" },
    { id: "disse_o_nome", comoSoa: "The seller says his name.", dica: "Diga seu nome" },
    { id: "disse_a_ufu", comoSoa: "The seller mentions UFU.", dica: "Diga que é da UFU" },
    { id: "pediu_whats", comoSoa: "The seller asks for WhatsApp.", dica: "Peça o WhatsApp" }
  ],
  etapas: [
    { id: "alo", nome: "Alô", comoSoa: "Opening.", exige: ["cumprimentou"] },
    { id: "apresentacao", nome: "Apresentação", comoSoa: "Introducing.", exige: ["disse_o_nome", "disse_a_ufu"] },
    { id: "ponte", nome: "Ponte", comoSoa: "Closing.", exige: ["pediu_whats"] }
  ]
};

// ---------- maquina de etapas ----------
console.log("\nfluxo");

let e0 = F.estadoInicial(FLUXO);
checa("comeca na primeira etapa", F.etapaAtual(FLUXO, e0).id === "alo");
checa("comeca sem nada feito", e0.feitas.length === 0);
checa("a etapa inicial ja conta como vista", e0.visto.indexOf("alo") > -1);

checa("lacuna inicial e o que a etapa exige",
  F.lacunas(FLUXO, e0).map(a => a.id).join() === "cumprimentou");

const eIgnora = F.registrar(FLUXO, e0, "acao_que_nao_existe");
checa("acao fora do catalogo e ignorada em silencio", eIgnora.feitas.length === 0);
checa("acao 'nenhuma' nao registra nada", F.registrar(FLUXO, e0, "nenhuma").feitas.length === 0);

let e1 = F.registrar(FLUXO, e0, "cumprimentou");
checa("registrar marca a acao", e1.feitas.indexOf("cumprimentou") > -1);
checa("registrar nao muta o estado antigo", e0.feitas.length === 0);
checa("registrar duas vezes nao duplica",
  F.registrar(FLUXO, e1, "cumprimentou").feitas.length === 1);
checa("sem lacuna depois de cumprir", F.lacunas(FLUXO, e1).length === 0);
checa("etapa cumprida", F.cumpriuEtapa(FLUXO, e1) === true);

let e2 = F.avancarSeCumpriu(FLUXO, e1);
checa("avanca sozinho quando cumpre", F.etapaAtual(FLUXO, e2).id === "apresentacao");
checa("nao avanca quando falta coisa",
  F.etapaAtual(FLUXO, F.avancarSeCumpriu(FLUXO, e2)).id === "apresentacao");
checa("lacuna da etapa 2 lista as duas",
  F.lacunas(FLUXO, e2).map(a => a.id).sort().join() === "disse_a_ufu,disse_o_nome");

let e3 = F.registrar(FLUXO, e2, "disse_o_nome");
checa("uma de duas: ainda falta uma", F.lacunas(FLUXO, e3).map(a => a.id).join() === "disse_a_ufu");

// ---------- a etapa nao volta ----------
console.log("\nfluxo: a etapa so anda para frente");

checa("sugerir etapa anterior nao retrocede",
  F.etapaAtual(FLUXO, F.sugerirEtapa(FLUXO, e2, "alo")).id === "apresentacao");
checa("sugerir a propria etapa nao mexe",
  F.etapaAtual(FLUXO, F.sugerirEtapa(FLUXO, e2, "apresentacao")).id === "apresentacao");
checa("sugerir etapa a frente pula",
  F.etapaAtual(FLUXO, F.sugerirEtapa(FLUXO, e2, "ponte")).id === "ponte");
checa("sugerir etapa inexistente nao mexe",
  F.etapaAtual(FLUXO, F.sugerirEtapa(FLUXO, e2, "nao_existe")).id === "apresentacao");
checa("pular marca as etapas puladas como vistas",
  F.sugerirEtapa(FLUXO, e0, "ponte").visto.indexOf("apresentacao") > -1);
checa("avancar na ultima etapa nao estoura",
  F.etapaAtual(FLUXO, F.avancar(FLUXO, F.sugerirEtapa(FLUXO, e0, "ponte"))).id === "ponte");

// ---------- perguntas para o Jev ----------
console.log("\nfluxo: criterios do Jev");

const crit = F.criteriosDeAcao(FLUXO);
checa("criterio de acao traz a saida 'nenhuma'", !!crit.nenhuma);
checa("criterio de acao cobre o catalogo", Object.keys(crit).length === FLUXO.acoes.length + 1);
checa("acao sem comoSoa fica de fora",
  Object.keys(F.criteriosDeAcao({ acoes: [{ id: "x", dica: "d" }] })).join() === "nenhuma");

const ce = F.criteriosDeEtapa(FLUXO, e2);
checa("criterio de etapa nao oferece etapa ja passada", !ce.alo);
checa("criterio de etapa traz a atual e as seguintes",
  !!ce.apresentacao && !!ce.ponte && Object.keys(ce).length === 2);

// ---------- validacao do catalogo ----------
console.log("\nfluxo: validacao");

checa("fluxo bom passa", F.validarFluxo(FLUXO).length === 0, F.validarFluxo(FLUXO));
checa("pega exigencia de acao inexistente",
  F.validarFluxo({ id: "x", acoes: [], etapas: [{ id: "a", comoSoa: "s", exige: ["fantasma"] }] })
    .some(m => m.indexOf("fantasma") > -1));
checa("pega acao sem comoSoa",
  F.validarFluxo({ id: "x", acoes: [{ id: "a", dica: "d" }], etapas: [{ id: "e", comoSoa: "s" }] })
    .some(m => m.indexOf("comoSoa") > -1));
checa("pega acao sem dica",
  F.validarFluxo({ id: "x", acoes: [{ id: "a", comoSoa: "s" }], etapas: [{ id: "e", comoSoa: "s" }] })
    .some(m => m.indexOf("dica") > -1));

// ---------- dicas ----------
console.log("\ndicas: formato");

checa("dica boa passa", D.dicaValida("Diga seu nome") === null);
checa("reprova mais de 6 palavras", !!D.dicaValida("Diga o seu nome e que voce e da ufu"));
checa("reprova aspas", !!D.dicaValida("\"Diga seu nome\""));
checa("reprova ponto final", !!D.dicaValida("Diga seu nome."));
checa("reprova vazia", !!D.dicaValida("   "));
checa("catalogo do fluxo de teste e valido", D.validarCatalogoDeDicas(FLUXO).length === 0);

console.log("\ndicas: precedencia e teto");

const umaLacuna = [{ id: "disse_o_nome", dica: "Diga seu nome" }];

let d = D.montarDicas({
  objecao: { id: "ta_caro", texto: "Explique o motivo do preço" },
  lacunas: umaLacuna,
  sentimento: { id: "apressado", texto: "Vá direto ao ponto" },
  vezDoVendedor: true
});
checa("objecao vem antes de lacuna e sentimento",
  d.map(x => x.tipo).join() === "objecao,lacuna,sentimento", d);

d = D.montarDicas({
  stop: { id: "stop_nao_ligue", texto: "Encerre com educação" },
  objecao: { id: "ta_caro", texto: "Explique o motivo do preço" },
  lacunas: umaLacuna,
  vezDoVendedor: true
});
checa("stop limpa todo o resto", d.length === 1 && d[0].tipo === "stop", d);

d = D.montarDicas({
  lacunas: [
    { id: "a", dica: "Diga seu nome" }, { id: "b", dica: "Diga a UFU" },
    { id: "c", dica: "Pergunte o nome" }, { id: "d", dica: "Peça o WhatsApp" }
  ],
  vezDoVendedor: true
});
checa("respeita o teto de 3", d.length === 3, d.length);

console.log("\ndicas: ruido e tremor");

d = D.montarDicas({ lacunas: umaLacuna, vezDoVendedor: false });
checa("lacuna nao aparece enquanto o cliente fala", d.length === 0);

d = D.montarDicas({
  objecao: { id: "ta_caro", texto: "Explique o motivo do preço" },
  lacunas: umaLacuna, vezDoVendedor: false
});
checa("objecao aparece mesmo na vez do cliente", d.length === 1 && d[0].tipo === "objecao");

const antes = D.montarDicas({ lacunas: umaLacuna, vezDoVendedor: true });
checa("dica nova vem marcada como nova", antes[0].nova === true);
const depois = D.montarDicas({ lacunas: [], vezDoVendedor: true, anteriores: antes });
checa("dica segura por uma rodada em vez de sumir na cara dele",
  depois.length === 1 && depois[0].herdada !== false && depois[0].rodadas === 1, depois);
const maisTarde = D.montarDicas({ lacunas: [], vezDoVendedor: true, anteriores: depois });
checa("depois do prazo de sustentacao, some", maisTarde.length === 0, maisTarde);

d = D.montarDicas({
  lacunas: [{ id: "x", dica: "Esta dica tem palavras demais para caber na tela" }],
  vezDoVendedor: true
});
checa("dica mal escrita nao vai para a tela", d.length === 0);

console.log(falhas ? "\n" + falhas + " FALHA(S)\n" : "\nTUDO OK\n");
process.exit(falhas ? 1 : 0);
