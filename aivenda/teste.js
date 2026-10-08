// Manda 20 falas de cliente para o Jev e imprime a decisão, a latência e o custo.
// Usa a MESMA regra que a página (lib/decisao.js). Serve para afinar os
// thresholds sem precisar de call real.
//
//   node teste.js
//
// Precisa da TYPESAFE_API_KEY no .env. Não precisa do servidor rodando.

const fs = require("fs");
const path = require("path");
const https = require("https");
const { CONFIG, montarPerguntas, montarState, aplicarRegra, calcularCusto } = require("./lib/decisao.js");
const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");

function carregarChave() {
  const arquivo = path.join(__dirname, ".env");
  if (fs.existsSync(arquivo)) {
    const m = fs.readFileSync(arquivo, "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.TYPESAFE_API_KEY;
}

const CHAVE = carregarChave();
if (!CHAVE) { console.error("Falta a TYPESAFE_API_KEY no .env"); process.exit(1); }

// 20 falas: as 7 objeções, falas sem objeção nenhuma, e uma frase cortada.
// `espera` é o que DEVERIA sair — é o gabarito para afinar os thresholds.
const FALAS = [
  { fala: "Poxa, gostei da ideia mas esse valor ta bem fora do meu orcamento agora.", espera: "ta_caro" },
  { fala: "Quanto custa isso? Porque olha, dinheiro aqui ta curto.", espera: "ta_caro" },
  { fala: "Consegue fazer um precinho melhor? Assim fica pesado pra mim.", espera: "ta_caro" },
  { fala: "Sera que isso funciona pro meu tipo de negocio? Minha clientela e bem diferente.", espera: "funciona_pra_mim" },
  { fala: "Eu vendo pra construtora, nao sei se um robo desses da conta do meu cliente.", espera: "funciona_pra_mim" },
  { fala: "Agora nao e um bom momento, estamos no meio de uma mudanca aqui.", espera: "nao_e_o_momento" },
  { fala: "Deixa pra janeiro? Dezembro aqui e uma loucura.", espera: "nao_e_o_momento" },
  { fala: "Preciso conversar com meu socio antes de fechar qualquer coisa.", espera: "falar_com_socio" },
  { fala: "Vou levar pra minha esposa, ela cuida da parte financeira.", espera: "falar_com_socio" },
  { fala: "Ja tentei um chatbot ano passado e foi um desastre, so irritou cliente.", espera: "ja_tentei" },
  { fala: "Olha, contratei uma empresa dessas e nao deu em nada, perdi dinheiro.", espera: "ja_tentei" },
  { fala: "Deixa eu pensar com calma e te retorno.", espera: "vou_pensar" },
  { fala: "Me manda por email que eu analiso depois.", espera: "vou_pensar" },
  { fala: "Nunca ouvi falar da sua empresa, como eu sei que nao e golpe?", espera: "nao_confio" },
  { fala: "Nao quero uma IA falando com meu cliente, tenho medo do que ela vai dizer.", espera: "nao_confio" },
  { fala: "Bom dia! Tudo bem por aqui, e voce?", espera: null },
  { fala: "Hoje a gente atende tudo pelo WhatsApp mesmo, sou eu e mais duas meninas.", espera: null },
  { fala: "Entendi. E ele responde em quanto tempo?", espera: null },
  { fala: "Faz sentido. Como que funciona a instalacao?", espera: null },
  { fala: "Olha, eu achei interessante mas o problema e que", espera: "CORTADA" }
];

const PERGUNTAS = montarPerguntas(OBJECOES_EXEMPLO);

function chamarJev(state) {
  const corpo = JSON.stringify({ model: CONFIG.modelo, state, questions: PERGUNTAS });
  const inicio = Date.now();
  return new Promise((ok, erro) => {
    const r = https.request({
      hostname: "api.typesafe.ai", path: "/v1/systemone", method: "POST",
      headers: { "Authorization": "Bearer " + CHAVE, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) }
    }, resp => {
      let txt = "";
      resp.on("data", c => { txt += c; });
      resp.on("end", () => {
        if (resp.statusCode !== 200) return erro(new Error("HTTP " + resp.statusCode + ": " + txt.slice(0, 200)));
        try { ok({ json: JSON.parse(txt), ms: Date.now() - inicio }); }
        catch (e) { erro(new Error("resposta não é JSON: " + txt.slice(0, 200))); }
      });
    });
    r.on("error", erro);
    r.end(corpo);
  });
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); }

(async () => {
  console.log("\n  " + FALAS.length + " falas -> " + CONFIG.modelo);
  console.log("  regra: tem_objecao >= " + CONFIG.limiarObjecao + "  e  confianca >= " + CONFIG.limiarConfianca + "\n");
  console.log("  " + pad("FALA", 46) + pad("OBJ", 6) + pad("ESCOLHA", 18) + pad("CONF", 6) + pad("FIM", 6) + pad("ACAO", 10) + pad("MS", 6) + "GABARITO");
  console.log("  " + "-".repeat(112));

  let somaMs = 0, custoTotal = 0, acertos = 0, avaliadas = 0;

  for (const caso of FALAS) {
    let linha;
    try {
      const { json, ms } = await chamarJev(montarState([{ quem: "cliente", fala: caso.fala }], caso.fala));
      const d = aplicarRegra(json, OBJECOES_EXEMPLO, null);
      const custo = calcularCusto(json.usage);
      somaMs += ms; custoTotal += custo;

      // Gabarito: null espera "nada", "CORTADA" espera "esperar", resto espera aquele id.
      const esperado = caso.espera === null ? "nada" : caso.espera === "CORTADA" ? "esperar" : caso.espera;
      const obtido = caso.espera === null ? d.acao : caso.espera === "CORTADA" ? d.acao : (d.acao === "card" ? d.escolha : d.acao);
      const bateu = esperado === obtido;
      avaliadas++; if (bateu) acertos++;

      linha = pad(caso.fala, 46) + pad(d.temObjecao.toFixed(2), 6) + pad(d.escolha, 18) +
        pad(d.confianca.toFixed(2), 6) + pad((json.answers.terminou_de_falar.noul).toFixed(2), 6) +
        pad(d.acao, 10) + pad(ms, 6) + (bateu ? "ok" : "esperava " + esperado);
    } catch (e) {
      linha = pad(caso.fala, 46) + "ERRO: " + e.message;
    }
    console.log("  " + linha);
  }

  console.log("  " + "-".repeat(112));
  console.log("\n  decisoes:        " + FALAS.length);
  console.log("  latencia media:  " + Math.round(somaMs / FALAS.length) + " ms");
  console.log("  custo total:     US$ " + custoTotal.toFixed(6) + "  (estimado, US$ " + CONFIG.usdPorMilhaoInput + "/1M entrada)");
  console.log("  bateu o gabarito: " + acertos + "/" + avaliadas + "\n");
})();
