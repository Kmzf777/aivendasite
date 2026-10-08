// Ensaio de call: roda uma conversa inteira pelo Jev e mostra os cards
// que apareceriam, sem microfone e sem segunda pessoa.
//
//   node ensaio.js
//
// Precisa do servidor rodando (node server.js) - ele guarda a chave e o
// catalogo. Usa a MESMA regra e o MESMO catalogo que a call de verdade.
//
// Para testar suas proprias falas: edite CONVERSA aqui embaixo.
//   quem: "voce"    -> sua fala. Vira contexto, nunca dispara card.
//   quem: "cliente" -> so esta dispara decisao.

const CONVERSA = [
  { quem: "voce",    fala: "Bom dia, falo com o responsavel pelo pet shop?" },
  { quem: "cliente", fala: "Sou eu mesmo, pois nao." },

  { quem: "voce",    fala: "Meu nome e Rafael, eu trabalho com presenca online pra pet shop aqui da regiao. Como conseguiu meu numero voce vai me perguntar, achei voces no Google Maps." },
  { quem: "cliente", fala: "Ah ta, e como voce conseguiu meu numero mesmo?" },

  { quem: "voce",    fala: "Pelo Google Maps, o perfil de voces aparece la. Foi assim que cheguei em voces." },
  { quem: "cliente", fala: "Entendi. Mas olha, eu ja tenho Instagram viu, posto direto la." },

  { quem: "voce",    fala: "Faz sentido. E quando alguem procura banho e tosa aqui no bairro, voces aparecem?" },
  { quem: "cliente", fala: "Sinceramente meu movimento todo e indicacao, cliente traz cliente." },

  { quem: "voce",    fala: "Entendo. Hoje voces atendem quantos banhos por dia mais ou menos?" },
  { quem: "cliente", fala: "Uns quinze, vinte por dia dependendo do dia." },

  { quem: "voce",    fala: "E se aparecessem mais cinco por semana de gente procurando no Google, dava conta?" },
  { quem: "cliente", fala: "Olha, eu acho que ninguem procura pet shop na internet nao, as pessoas passam na rua e veem." },

  { quem: "voce",    fala: "Eu entendo. So que a busca por pet shop perto de mim cresceu bastante nos ultimos anos." },
  { quem: "cliente", fala: "Pode ser. E quanto custa uma coisa dessas?" },

  { quem: "voce",    fala: "O projeto sai por mil e duzentos reais, uma vez so, e fica seu." },
  { quem: "cliente", fala: "Nossa, mil e duzentos ta bem puxado pra mim agora." },

  { quem: "voce",    fala: "Entendo. Deixa eu te perguntar uma coisa: se fosse metade disso, voce faria hoje?" },
  { quem: "cliente", fala: "Olha, deixa eu pensar com calma e depois eu te retorno." },

  { quem: "voce",    fala: "Claro. So pra eu entender: o que te faria dizer sim?" },
  { quem: "cliente", fala: "Na verdade eu preciso conversar com minha esposa, ela cuida da parte do dinheiro." }
];

// ==================================================================

const fs = require("fs");
const path = require("path");
const http = require("http");
const { CONFIG, montarState, montarPerguntas, aplicarRegra, calcularCusto, NOMES_FASE } = require("./lib/decisao.js");

const SERVIDOR = { host: "localhost", port: process.env.PORT || 3000 };
const L = 74;

const cor = {
  off: "\x1b[0m", forte: "\x1b[1m", fraco: "\x1b[2m",
  azul: "\x1b[38;5;75m", laranja: "\x1b[38;5;208m",
  verde: "\x1b[38;5;78m", amarelo: "\x1b[38;5;221m", cinza: "\x1b[38;5;245m"
};

function pede(caminho, metodo, corpo) {
  return new Promise((ok, erro) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({ ...SERVIDOR, path: caminho, method: metodo,
      headers: dados ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dados) } : {} },
      resp => {
        let t = "";
        resp.on("data", c => t += c);
        resp.on("end", () => {
          if (resp.statusCode !== 200) return erro(new Error("HTTP " + resp.statusCode + ": " + t.slice(0, 160)));
          try { ok(JSON.parse(t)); } catch (e) { erro(new Error("resposta nao e JSON")); }
        });
      });
    r.on("error", erro);
    if (dados) r.write(dados);
    r.end();
  });
}

// Quebra o texto em linhas que cabem na largura, sem cortar palavra.
function quebrar(txt, larg) {
  const out = [];
  let linha = "";
  for (const p of txt.split(/\s+/)) {
    if ((linha + " " + p).trim().length > larg) { out.push(linha.trim()); linha = p; }
    else linha += " " + p;
  }
  if (linha.trim()) out.push(linha.trim());
  return out;
}

function card(d, ms, neutro, falaCliente) {
  const c = neutro ? cor.amarelo : cor.verde;
  const titulo = neutro ? "OBJEÇÃO NÃO CATALOGADA" : "QUEBRAR OBJEÇÃO";
  const nome = neutro ? "Sem argumento pronto" : d.objecao.nome;
  const corpo = neutro ? '"' + falaCliente + '"' : d.objecao.argumento;

  console.log("  " + c + "┌" + "─".repeat(L) + "┐" + cor.off);
  console.log("  " + c + "│ " + cor.forte + titulo.padEnd(L - 2) + cor.off + c + " │" + cor.off);
  console.log("  " + c + "│ " + cor.off + cor.forte + nome.padEnd(L - 2) + cor.off + c + " │" + cor.off);
  console.log("  " + c + "│" + " ".repeat(L) + "│" + cor.off);
  for (const l of quebrar(corpo, L - 4)) {
    console.log("  " + c + "│ " + cor.off + l.padEnd(L - 2) + c + " │" + cor.off);
  }
  console.log("  " + c + "│" + " ".repeat(L) + "│" + cor.off);
  const pe = "confiança " + Math.round((neutro ? d.temObjecao : d.confianca) * 100) + "%   ·   " + ms + " ms";
  console.log("  " + c + "│ " + cor.fraco + pe.padEnd(L - 2) + cor.off + c + " │" + cor.off);
  console.log("  " + c + "└" + "─".repeat(L) + "┘" + cor.off);
}

(async () => {
  let objecoes;
  try {
    objecoes = await pede("/objecoes", "GET");
  } catch (e) {
    console.error("\n  Não consegui falar com o servidor: " + e.message);
    console.error("  Rode `node server.js` nesta pasta e tente de novo.\n");
    process.exit(1);
  }

  console.log("\n  " + cor.forte + "ENSAIO DE CALL" + cor.off + cor.fraco + "   " + objecoes.length +
    " objeções · " + CONFIG.modelo + cor.off);
  console.log("  " + cor.fraco + "regra: tem_objeção ≥ " + CONFIG.limiarObjecao + " e confiança ≥ " +
    CONFIG.limiarConfianca + ", ou confiança ≥ " + (CONFIG.limiarConfiancaSozinha ?? "—") + " sozinha" + cor.off);
  console.log("  " + "─".repeat(L + 2) + "\n");

  const perguntas = montarPerguntas(objecoes);
  let falas = [], ultimaMostrada = null, faseAtual = null;
  let cards = 0, alertas = 0, latencias = [], custo = 0;

  for (const turno of CONVERSA) {
    const quemRot = turno.quem === "voce" ? "vendedor" : "cliente";
    falas.push({ quem: quemRot, fala: turno.fala });

    if (turno.quem === "voce") {
      console.log("  " + cor.azul + "VOCÊ" + cor.off + cor.cinza + "     " + turno.fala + cor.off);
      continue;
    }
    console.log("  " + cor.laranja + cor.forte + "CLIENTE" + cor.off + "  " + turno.fala);

    const t0 = Date.now();
    let json;
    try {
      json = await pede("/jev", "POST", { model: CONFIG.modelo, state: montarState(falas, turno.fala), questions: perguntas });
    } catch (e) {
      console.log("  " + cor.amarelo + "  erro no Jev: " + e.message + cor.off + "\n");
      continue;
    }
    const ms = Date.now() - t0;
    latencias.push(ms);
    custo += calcularCusto(json.usage);

    const d = aplicarRegra(json, objecoes, ultimaMostrada);
    if (d.fase && d.fase !== faseAtual) {
      faseAtual = d.fase;
      console.log("  " + cor.fraco + "         fase: " + (NOMES_FASE[d.fase] || d.fase) + cor.off);
    }

    if (d.acao === "card") {
      ultimaMostrada = d.escolha;
      cards++;
      console.log("");
      card(d, ms, false);
      console.log("");
    } else if (d.acao === "alerta") {
      alertas++;
      console.log("");
      card(d, ms, true, turno.fala);
      console.log("");
    } else {
      const porque = d.acao === "esperar" ? "frase cortada, espera o resto"
                   : d.acao === "repetida" ? "mesma objeção do card anterior"
                   : "sem objeção (tem_objeção " + d.temObjecao.toFixed(2) + ")";
      console.log("  " + cor.fraco + "         — sem card: " + porque + "  ·  " + ms + " ms" + cor.off + "\n");
    }
  }

  const media = latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : 0;
  console.log("  " + "─".repeat(L + 2));
  console.log("  " + cor.forte + cards + " cards" + cor.off + cor.fraco + " · " + alertas +
    " alertas · " + latencias.length + " decisões · " + media + " ms de média · US$ " +
    custo.toFixed(6) + " no total" + cor.off + "\n");
})();
