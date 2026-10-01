// PORTADO de ../lib/fluxo.js — mesma logica, so o formato de modulo muda.
// A versao CommonJS da raiz continua servindo os testes offline; se mexer
// numa, mexa na outra (teste-paridade.js compara as duas).

// A maquina de etapas da ligacao. Funcoes puras, sem DOM e sem rede, de
// proposito: o teste exercita ESTA regra, nao uma copia dela.
//
// ==================================================================
// POR QUE ISTO NAO E PERGUNTA DE JEV (leia antes de "simplificar")
// ==================================================================
// A tentacao e perguntar ao Jev "ele ja se apresentou?" a cada fala. Nao faca.
//
//   1. E fato do passado, nao julgamento. Classificador e probabilistico: a
//      mesma pergunta da 0.82 agora e 0.61 daqui a dois segundos, e a dica
//      pisca na tela de quem esta no telefone com um estranho.
//   2. O Jev nao enxerga a ligacao inteira. CONFIG.historicoFalas e 8 e a lista
//      de falas e cortada em 40. A apresentacao saiu dessa janela ha muito.
//   3. Custa uma pergunta por fala para responder o que um booleano responde.
//
// A divisao que funciona:
//   o Jev decide  O QUE ACABOU DE ACONTECER nesta fala  (evento, fuzzy)
//   o codigo guarda O QUE JA ACONTECEU na ligacao       (fato, flag)
//   o fluxo declara O QUE A ETAPA EXIGE                 (escrito por humano)
//
// A dica e a subtracao: exigido menos feito. Nenhuma chamada de rede para isso.
//
// E a etapa SO ANDA PARA FRENTE. O Jev pode propor pular; nunca pode voltar.
// Se o vendedor ja disse o nome, a conversa nao volta para "abertura" porque o
// classificador hesitou numa frase cortada.

// ------------------------------------------------------------------
// Estado
// ------------------------------------------------------------------
// { etapa: <indice>, feitas: [ids de acao], visto: [ids de etapa alcancados] }
// Imutavel: toda funcao devolve um estado novo em vez de mutar o que recebeu.

function estadoInicial(fluxo) {
  return { etapa: 0, feitas: [], visto: [fluxo.etapas[0].id] };
}

function etapaAtual(fluxo, estado) {
  return fluxo.etapas[estado.etapa] || null;
}

function indiceDaEtapa(fluxo, etapaId) {
  return fluxo.etapas.findIndex(e => e.id === etapaId);
}

function acaoPorId(fluxo, acaoId) {
  return (fluxo.acoes || []).find(a => a.id === acaoId) || null;
}

// ------------------------------------------------------------------
// Registrar o que o vendedor fez
// ------------------------------------------------------------------
// `acaoId` vem do Jev respondendo "o que o vendedor acabou de fazer?" numa
// lista fixa. Acao desconhecida e ignorada em silencio: o catalogo pode
// crescer sem derrubar uma ligacao em andamento.

function registrar(fluxo, estado, acaoId) {
  if (!acaoId || acaoId === "nenhuma") return estado;
  if (!acaoPorId(fluxo, acaoId)) return estado;
  if (estado.feitas.indexOf(acaoId) > -1) return estado;
  return Object.assign({}, estado, { feitas: estado.feitas.concat([acaoId]) });
}

// ------------------------------------------------------------------
// Lacunas: o que esta etapa exige e ainda nao foi feito
// ------------------------------------------------------------------

function lacunas(fluxo, estado) {
  const e = etapaAtual(fluxo, estado);
  if (!e) return [];
  return (e.exige || [])
    .filter(id => estado.feitas.indexOf(id) === -1)
    .map(id => acaoPorId(fluxo, id))
    .filter(Boolean);
}

function cumpriuEtapa(fluxo, estado) {
  return lacunas(fluxo, estado).length === 0;
}

// ------------------------------------------------------------------
// Avancar
// ------------------------------------------------------------------

function avancar(fluxo, estado) {
  if (estado.etapa >= fluxo.etapas.length - 1) return estado;
  const prox = estado.etapa + 1;
  const id = fluxo.etapas[prox].id;
  return {
    etapa: prox,
    feitas: estado.feitas,
    visto: estado.visto.indexOf(id) > -1 ? estado.visto : estado.visto.concat([id])
  };
}

// Etapa que virou desnecessaria porque a ligacao JA CONSEGUIU o que ela busca.
//
// `acoes` sao coisas que o vendedor FEZ. `conquistas` sao coisas que a ligacao
// GANHOU — o telefone do dono apareceu, o nome saiu. A diferenca importa: as
// etapas de plano B (pedir recado, pegar o whats da loja) existem para quando
// o caminho principal falhou. Cobrar "peça para ela encaminhar" de quem ja
// anotou o celular do dono e dica errada, e dica errada queima o painel mais
// rapido que painel vazio.
function devePular(fluxo, estado, conquistas) {
  const e = etapaAtual(fluxo, estado);
  if (!e || !e.pula_se || !e.pula_se.length) return false;
  const c = conquistas || {};
  return e.pula_se.some(k => !!c[k]);
}

// Avanca sozinho quando a etapa foi cumprida ou virou desnecessaria.
// Em cadeia: pular uma pode destravar a seguinte.
function avancarSeCumpriu(fluxo, estado, conquistas) {
  let atual = estado;
  for (let i = 0; i < fluxo.etapas.length; i++) {
    if (!cumpriuEtapa(fluxo, atual) && !devePular(fluxo, atual, conquistas)) break;
    const prox = avancar(fluxo, atual);
    if (prox === atual) break;   // ultima etapa: nao ha para onde ir
    atual = prox;
  }
  return atual;
}

// O Jev propondo uma etapa. So aceita o que esta A FRENTE: a conversa pode
// pular (o cliente ja entrega a dor antes de voce perguntar), nunca retroceder.
function sugerirEtapa(fluxo, estado, etapaId) {
  const i = indiceDaEtapa(fluxo, etapaId);
  if (i < 0 || i <= estado.etapa) return estado;
  let novo = estado;
  while (novo.etapa < i) novo = avancar(fluxo, novo);
  return novo;
}

// ------------------------------------------------------------------
// Para montar as perguntas do Jev a partir do fluxo
// ------------------------------------------------------------------
// Mesmo contrato de montarPerguntas() em decisao.js: o Jev le id + comoSoa.
// Id sem comoSoa some da choice list em silencio, entao filtramos aqui.

function criteriosDeAcao(fluxo) {
  const c = {};
  (fluxo.acoes || []).forEach(a => { if (a.comoSoa) c[a.id] = a.comoSoa; });
  c.nenhuma = "The seller did none of these things in this utterance.";
  return c;
}

// So as etapas daqui para a frente: nao faz sentido o Jev poder escolher uma
// etapa que ja passou, e lista menor erra menos.
function criteriosDeEtapa(fluxo, estado) {
  const c = {};
  fluxo.etapas.forEach((e, i) => { if (i >= estado.etapa && e.comoSoa) c[e.id] = e.comoSoa; });
  return c;
}

function resumo(fluxo, estado) {
  const e = etapaAtual(fluxo, estado);
  return {
    fluxo: fluxo.id,
    etapa: e ? e.id : null,
    nome: e ? e.nome : null,
    posicao: estado.etapa + 1,
    total: fluxo.etapas.length,
    feitas: estado.feitas.slice(),
    faltando: lacunas(fluxo, estado).map(a => a.id)
  };
}

// Erros de catalogo que so apareceriam na ligacao. Roda no teste e ao carregar.
function validarFluxo(fluxo) {
  const erros = [];
  if (!fluxo.id) erros.push("fluxo sem id");
  if (!fluxo.etapas || !fluxo.etapas.length) erros.push("fluxo sem etapas");
  const ids = {};
  (fluxo.acoes || []).forEach(a => {
    if (!a.comoSoa) erros.push("acao " + a.id + " sem comoSoa: sumiria da choice list");
    if (!a.dica) erros.push("acao " + a.id + " sem dica: lacuna sem o que mostrar");
    if (ids[a.id]) erros.push("acao repetida: " + a.id);
    ids[a.id] = 1;
  });
  (fluxo.etapas || []).forEach(e => {
    if (!e.comoSoa) erros.push("etapa " + e.id + " sem comoSoa: o Jev nunca a sugere");
    (e.exige || []).forEach(id => {
      if (!ids[id]) erros.push("etapa " + e.id + " exige acao inexistente: " + id);
    });
  });
  return erros;
}

export { estadoInicial, etapaAtual, registrar, lacunas, cumpriuEtapa, avancar, avancarSeCumpriu, sugerirEtapa, devePular, criteriosDeAcao, criteriosDeEtapa, resumo, validarFluxo };
