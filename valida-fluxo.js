// Portao mecanico para um arquivo de fluxo. Sai 0 ou 1.
//
//   node valida-fluxo.js fluxos/prospeccao.json
//   node valida-fluxo.js            (valida todos em fluxos/)
//
// Pega os erros que so apareceriam no meio de uma ligacao: acao sem comoSoa
// some da choice list em silencio, dica com aspas faz o vendedor ler em voz
// alta, etapa que exige acao inexistente trava a conversa para sempre.

const fs = require("fs");
const path = require("path");
const F = require("./lib/fluxo.js");
const D = require("./lib/dicas.js");

function valida(arquivo) {
  const erros = [];
  let fluxo;
  try {
    fluxo = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch (e) {
    return ["JSON invalido: " + e.message];
  }

  erros.push(...F.validarFluxo(fluxo));
  erros.push(...D.validarCatalogoDeDicas(fluxo));

  // Acao que nenhuma etapa exige nunca vira dica: ou falta no `exige`, ou sobra.
  const exigidas = {};
  (fluxo.etapas || []).forEach(e => (e.exige || []).forEach(id => { exigidas[id] = 1; }));
  (fluxo.acoes || []).forEach(a => {
    if (!exigidas[a.id] && !a.opcional) {
      erros.push("acao " + a.id + " nao e exigida por nenhuma etapa: vira codigo morto");
    }
  });

  // Etapa sem exigencia nunca avanca sozinha e prende a ligacao ali.
  (fluxo.etapas || []).forEach((e, i) => {
    if (!(e.exige || []).length && i < (fluxo.etapas || []).length - 1) {
      erros.push("etapa " + e.id + " nao exige nada: a conversa nunca sai dela sozinha");
    }
  });

  // Dois comoSoa iguais fazem o Jev escolher no cara ou coroa.
  const vistos = {};
  (fluxo.acoes || []).concat(fluxo.etapas || []).forEach(x => {
    const k = String(x.comoSoa || "").trim().toLowerCase();
    if (!k) return;
    if (vistos[k]) erros.push("comoSoa identico em " + vistos[k] + " e " + x.id);
    vistos[k] = x.id;
  });

  // O comoSoa vai em ingles de proposito: e onde o Jev acerta mais.
  (fluxo.acoes || []).forEach(a => {
    if (/\b(o vendedor|ele diz|quando o|voce)\b/i.test(a.comoSoa || "")) {
      erros.push("acao " + a.id + ": comoSoa parece estar em portugues");
    }
  });

  return erros;
}

const alvos = process.argv[2]
  ? [process.argv[2]]
  : fs.existsSync("fluxos")
    ? fs.readdirSync("fluxos").filter(f => f.endsWith(".json")).map(f => path.join("fluxos", f))
    : [];

if (!alvos.length) { console.error("nenhum fluxo para validar"); process.exit(1); }

let total = 0;
alvos.forEach(a => {
  const erros = valida(a);
  total += erros.length;
  if (!erros.length) {
    const f = JSON.parse(fs.readFileSync(a, "utf8"));
    console.log("ok   " + a + "  (" + f.etapas.length + " etapas, " + f.acoes.length + " acoes)");
  } else {
    console.log("FALHA " + a);
    erros.forEach(e => console.log("   - " + e));
  }
});
process.exit(total ? 1 : 0);
