// Testa a atribuição de falante por energia de dois canais. Offline.
const { ATRIB, quemFalou, dominancia } = require("./lib/atribuir.js");

let falhas = 0;
const checa = (n, c, extra) => {
  console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra)));
  if (!c) falhas++;
};

// Gera amostras: quem fala tem energia alta, o outro tem o vazamento.
function jan(t0, n, eV, eC, ruido) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const r = () => 1 + ((i * 37 % 17) / 17 - 0.5) * (ruido || 0.2);
    a.push({ t: t0 + i * 50, eV: eV * r(), eC: eC * r() });
  }
  return a;
}

console.log("\ncaso limpo (fone, sem vazamento)");
checa("só você falando", quemFalou(jan(0, 20, 0.30, 0.001), 0, 1000) === "vendedor");
checa("só cliente falando", quemFalou(jan(0, 20, 0.001, 0.30), 0, 1000) === "cliente");

console.log("\ncom vazamento (sem fone: a voz do cliente escapa pro seu mic)");
// cliente fala: forte no canal dele, fraco no seu mic
checa("cliente com vazamento de 25% ainda é cliente",
  quemFalou(jan(0, 20, 0.08, 0.32), 0, 1000) === "cliente");
checa("você falando com vazamento pro canal do cabo ainda é você",
  quemFalou(jan(0, 20, 0.32, 0.08), 0, 1000) === "vendedor");
// vazamento severo: 70% - deve recusar em vez de chutar
checa("vazamento severo (quase empate) não atribui",
  quemFalou(jan(0, 20, 0.26, 0.30), 0, 1000) === null);

console.log("\nsobreposição e silêncio");
checa("os dois falando junto -> null", quemFalou(jan(0, 20, 0.30, 0.30), 0, 1000) === null);
checa("silêncio nos dois -> null", quemFalou(jan(0, 20, 0.0001, 0.0001), 0, 1000) === null);
checa("janela vazia -> null", quemFalou([], 0, 1000) === null);
checa("amostras null -> null", quemFalou(null, 0, 1000) === null);

console.log("\njanela de tempo");
const mist = jan(0, 20, 0.30, 0.001).concat(jan(2000, 20, 0.001, 0.30));
checa("pega só a janela pedida (início = você)", quemFalou(mist, 0, 999) === "vendedor");
checa("pega só a janela pedida (fim = cliente)", quemFalou(mist, 2000, 3000) === "cliente");
checa("janela inteira = empate -> null", quemFalou(mist, 0, 3000) === null);

console.log("\nmargem configurável");
checa("margem alta recusa o que a padrão aceitaria",
  quemFalou(jan(0, 20, 0.30, 0.15), 0, 1000, { margem: 100 }) === null);
checa("margem baixa aceita o que a padrão recusaria",
  quemFalou(jan(0, 20, 0.30, 0.28), 0, 1000, { margem: 1.01 }) === "vendedor");

console.log("\ndominancia (diagnóstico)");
const d = dominancia(jan(0, 20, 0.30, 0.001), 0, 1000);
checa("soma das frações dá 1", Math.abs(d.voce + d.cliente - 1) < 1e-9, d);
checa("você domina", d.voce > 0.99, d);
checa("razão alta quando isolado", d.razao > 100, d.razao);
checa("dominancia de janela vazia é null", dominancia([], 0, 10) === null);

console.log("\nconfig");
checa("margem padrão é 1.6", ATRIB.margem === 1.6);

console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
process.exit(falhas === 0 ? 0 : 1);
