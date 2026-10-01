// Portao mecanico para o catalogo de objecoes. Sai 0 ou 1.
//
//   node valida-catalogo.js                   (valida objecoes.json, ou o padrao se ele faltar)
//   node valida-catalogo.js objecoes.padrao.json
//
// Existe pelo mesmo motivo do valida-fluxo.js: os erros deste arquivo nao
// aparecem quando se salva, aparecem no meio de uma ligacao. E dois deles
// somem SEM AVISO NENHUM, que e a pior categoria:
//
//   - headline com 7 palavras: lib/dicas.js descarta no filtro e a dica
//     simplesmente nao acende. O card ainda aparece, entao ninguem desconfia.
//   - comoSoa vazio: montarPerguntas poe `undefined` como criterio daquela
//     objecao, e o Jev passa a escolher entre opcoes sem descricao.
//
// O resto sao avisos: pioram o acerto ou a leitura, mas nao escondem nada.

const fs = require("fs");
const D = require("./lib/dicas.js");

const TIPOS = ["objecao", "pergunta", "triagem", "stop"];
const EVIDENCIAS = ["gravada", "objecao_gravada_resposta_nossa", "derivada", "nao_observada"];

// O comoSoa vai em ingles de proposito (e onde o Jev acerta mais), e portugues
// escrito ali passa despercebido porque o arquivo inteiro e em portugues.
// Acento resolve quase todos os casos; as funcionais pegam o resto.
const PARECE_PORTUGUES = /[àáâãéêíóôõúç]|\b(o cliente|ele diz|ela diz|quando o|quando a|que o|nao|voce)\b/i;

function palavras(t) {
  return String(t || "").trim().split(/\s+/).filter(Boolean).length;
}

function valida(lista) {
  const erros = [];
  const avisos = [];
  const vistos = {};
  const nucleosVistos = {};

  lista.forEach((o, i) => {
    const onde = "[" + i + "] " + (o.id || "sem_id");

    // ---- id: e a chave que o Jev devolve. Errado aqui quebra tudo que aponta pra ca.
    if (!o.id) erros.push(onde + ": sem id");
    else {
      if (!/^[a-z0-9_]+$/.test(o.id)) erros.push(onde + ": id fora do formato (minusculas, numeros e _)");
      if (vistos[o.id]) erros.push(onde + ": id repetido, ja usado em " + vistos[o.id]);
      vistos[o.id] = onde;
    }

    // ---- comoSoa: o campo que mais afeta o acerto.
    const cs = String(o.comoSoa || "").trim();
    if (!cs) erros.push(onde + ": comoSoa vazio - o Jev fica com um criterio undefined");
    else {
      if (PARECE_PORTUGUES.test(cs)) erros.push(onde + ": comoSoa parece estar em portugues");
      if (cs.length < 120) avisos.push(onde + ": comoSoa com " + cs.length + " caracteres - os que acertam mais passam de 120 e dizem o que a objecao NAO e");
    }

    // ---- headline: vira dica. As regras sao as de lib/dicas.js, nao uma copia delas.
    const motivo = D.dicaValida(o.headline);
    if (motivo) erros.push(onde + ": headline " + motivo + " -> a dica some da tela sem aviso (" + JSON.stringify(o.headline) + ")");
    else if (String(o.headline).length > 42) {
      avisos.push(onde + ": headline com " + o.headline.length + " caracteres - longa para ler de relance");
    }

    // ---- argumento: a UNICA coisa que o card mostra durante a ligacao.
    const arg = String(o.argumento || "").trim();
    if (!arg) erros.push(onde + ": sem argumento - o card nao tem o que mostrar");
    else {
      if (palavras(arg) > 30) avisos.push(onde + ": argumento com " + palavras(arg) + " palavras - ninguem fala paragrafo ao telefone");
      if (/^["'“]/.test(arg)) avisos.push(onde + ": argumento comeca com aspas - convida a ler em voz alta");
    }

    if (!String(o.pivot || "").trim()) avisos.push(onde + ": sem pivot - o card perde a regra tatica");
    if (!String(o.nome || "").trim()) avisos.push(onde + ": sem nome - fica dificil achar na lista");

    if (TIPOS.indexOf(o.tipo) === -1) erros.push(onde + ": tipo " + JSON.stringify(o.tipo) + " fora de " + TIPOS.join("/"));
    if (EVIDENCIAS.indexOf(o.evidencia) === -1) avisos.push(onde + ": evidencia " + JSON.stringify(o.evidencia) + " nao e uma das conhecidas");
    if (typeof o.precisa_de_prova !== "boolean") avisos.push(onde + ": precisa_de_prova nao e booleano");

    // ---- nucleos: sao comparados com transcricao crua, que vem minuscula e sem acento.
    const nu = Array.isArray(o.nucleos) ? o.nucleos : [];
    if (!nu.length) avisos.push(onde + ": sem nucleos");
    nu.forEach(n => {
      if (n !== String(n).toLowerCase()) avisos.push(onde + ": nucleo com maiuscula -> " + JSON.stringify(n));
      if (/[àáâãéêíóôõúç]/i.test(n)) avisos.push(onde + ": nucleo com acento -> " + JSON.stringify(n));
      // Nucleo repetido entre objecoes diferentes e empate na mao do Jev.
      const k = String(n).toLowerCase().trim();
      if (nucleosVistos[k] && nucleosVistos[k] !== o.id) {
        avisos.push(onde + ": nucleo " + JSON.stringify(n) + " tambem esta em " + nucleosVistos[k]);
      }
      nucleosVistos[k] = o.id;
    });
  });

  // Dois comoSoa iguais fazem o Jev escolher no cara ou coroa.
  const porTexto = {};
  lista.forEach(o => {
    const k = String(o.comoSoa || "").trim().toLowerCase();
    if (!k) return;
    if (porTexto[k]) erros.push("comoSoa identico em " + porTexto[k] + " e " + o.id);
    porTexto[k] = o.id;
  });

  // Mais de um stop nao e erro, mas e quase sempre descuido: stop limpa a tela
  // e fica sozinho, entao dois stops so disputam a mesma fala de recusa.
  const stops = lista.filter(o => o.tipo === "stop").map(o => o.id);
  if (stops.length > 1) avisos.push("mais de um stop no catalogo (" + stops.join(", ") + ") - eles disputam a mesma fala");
  if (!stops.length) avisos.push("nenhum stop no catalogo - 'nao me ligue mais' nao vai limpar a tela");

  return { erros, avisos };
}

const alvo = process.argv[2] || (fs.existsSync("objecoes.json") ? "objecoes.json" : "objecoes.padrao.json");

let lista;
try {
  lista = JSON.parse(fs.readFileSync(alvo, "utf8"));
} catch (e) {
  console.error("nao consegui ler " + alvo + ": " + e.message);
  process.exit(1);
}
if (!Array.isArray(lista)) { console.error(alvo + " nao e um array"); process.exit(1); }

const { erros, avisos } = valida(lista);

avisos.forEach(a => console.log("   aviso  " + a));
erros.forEach(e => console.log("   ERRO   " + e));

const porTipo = {};
lista.forEach(o => { porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1; });
const resumo = Object.keys(porTipo).sort().map(t => porTipo[t] + " " + t).join(", ");

console.log(
  (erros.length ? "FALHA " : "ok   ") + alvo +
  "  (" + lista.length + " entradas: " + resumo + "; " +
  avisos.length + " aviso(s))"
);
process.exit(erros.length ? 1 : 0);
