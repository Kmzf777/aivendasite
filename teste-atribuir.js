// Testa a atribuição de falante por energia de dois canais. Offline.
const { ATRIB, TECLA, quemFalou, quemFalouPorTecla,
        fracaoApertada, quemFalouPorTransicoes, dominancia } = require("./lib/atribuir.js");

let falhas = 0, total = 0;
const checa = (n, c, extra) => {
  console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra)));
  total++;
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


// ---------- push-to-talk ----------
console.log("");
console.log("push-to-talk");
function tec(t0, n, segurado) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ t: t0 + i * 50, tecla: typeof segurado === "function" ? segurado(i, n) : segurado });
  return a;
}

checa("segurando o tempo todo -> você", quemFalouPorTecla(tec(0, 20, true), 0, 1000) === "vendedor");
checa("solto o tempo todo -> cliente", quemFalouPorTecla(tec(0, 20, false), 0, 1000) === "cliente");
checa("soltou no finalzinho ainda é você (80%)", quemFalouPorTecla(tec(0, 20, i => i < 16), 0, 1000) === "vendedor");
checa("toque acidental curto ainda é cliente (10%)", quemFalouPorTecla(tec(0, 20, i => i < 2), 0, 1000) === "cliente");
checa("tecla mudou no meio (50/50) -> não atribui", quemFalouPorTecla(tec(0, 20, i => i < 10), 0, 1000) === null);
checa("40% segurado -> não atribui", quemFalouPorTecla(tec(0, 20, i => i < 8), 0, 1000) === null);
checa("janela vazia -> null", quemFalouPorTecla([], 0, 1000) === null);
checa("amostras null -> null", quemFalouPorTecla(null, 0, 1000) === null);
const linhaT = tec(0, 20, true).concat(tec(2000, 20, false));
checa("respeita a janela (início segurado)", quemFalouPorTecla(linhaT, 0, 999) === "vendedor");
checa("respeita a janela (fim solto)", quemFalouPorTecla(linhaT, 2000, 3000) === "cliente");
checa("limiares configuráveis", quemFalouPorTecla(tec(0, 20, i => i < 10), 0, 1000, { limiarSeu: 0.5 }) === "vendedor");
checa("limiar padrão de seu é 0.6", TECLA.limiarSeu === 0.6);

// ---------- push-to-talk por transições ----------
// Por que existe um segundo bloco de testes para o mesmo gesto: o Chrome
// estrangula setInterval para ~1 Hz com a aba oculta/sem foco (medido:
// 999/1001/1000/1008/991 ms com AMOSTRA_MS = 50). Amostrar a tecla por timer
// é grosseiro demais; integrar as transições de keydown/keyup é exato.
console.log("");
console.log("push-to-talk por transições (imune ao estrangulamento de setInterval)");

console.log("\n  janela inteira num estado só");
checa("presa a janela inteira -> você",
  quemFalouPorTransicoes([{ t: -500, apertado: true }], 0, 1000) === "vendedor");
checa("solta a janela inteira -> cliente",
  quemFalouPorTransicoes([{ t: -500, apertado: false }], 0, 1000) === "cliente");
checa("fração de janela inteiramente presa é 1",
  fracaoApertada([{ t: -500, apertado: true }], 0, 1000) === 1);
checa("fração de janela inteiramente solta é 0",
  fracaoApertada([{ t: -500, apertado: false }], 0, 1000) === 0);

console.log("\n  janela sem nenhuma transição: vale o estado vigente no início");
checa("lista vazia, estado inicial solto -> cliente",
  quemFalouPorTransicoes([], 0, 1000) === "cliente");
checa("lista vazia, estado inicial presa -> você",
  quemFalouPorTransicoes([], 0, 1000, { estadoInicial: true }) === "vendedor");
checa("janela depois da última transição herda o estado dela",
  quemFalouPorTransicoes([{ t: 0, apertado: true }], 5000, 6000) === "vendedor");
checa("entrada não-array -> null", quemFalouPorTransicoes(null, 0, 1000) === null);
checa("transições com t inválido são ignoradas",
  fracaoApertada([{ t: NaN, apertado: true }, { t: -1, apertado: false }], 0, 1000) === 0);

console.log("\n  transição no meio da janela");
checa("soltou na metade (50%) -> não atribui",
  quemFalouPorTransicoes([{ t: -1, apertado: true }, { t: 500, apertado: false }], 0, 1000) === null);
checa("soltou a 800 ms (80%) -> você",
  quemFalouPorTransicoes([{ t: -1, apertado: true }, { t: 800, apertado: false }], 0, 1000) === "vendedor");
checa("apertou só nos últimos 100 ms (10%) -> cliente",
  quemFalouPorTransicoes([{ t: -1, apertado: false }, { t: 900, apertado: true }], 0, 1000) === "cliente");
checa("três toques de 100 ms somam 30%",
  fracaoApertada([
    { t: 0, apertado: false },
    { t: 100, apertado: true }, { t: 200, apertado: false },
    { t: 300, apertado: true }, { t: 400, apertado: false },
    { t: 500, apertado: true }, { t: 600, apertado: false }
  ], 0, 1000) === 0.3);
checa("lista fora de ordem dá o mesmo resultado (80%)",
  fracaoApertada([{ t: 800, apertado: false }, { t: -1, apertado: true }], 0, 1000) === 0.8);

console.log("\n  recorte nas bordas");
const linhaTr = [
  { t: 0,    apertado: false },
  { t: 200,  apertado: true },    // antes da janela: define o estado de entrada
  { t: 2500, apertado: false }    // depois da janela: não pode influenciar
];
checa("transição antes da janela define o estado de entrada",
  quemFalouPorTransicoes(linhaTr, 1000, 2000) === "vendedor");
checa("transição depois da janela não influencia (fração = 1)",
  fracaoApertada(linhaTr, 1000, 2000) === 1);
checa("a janela seguinte já vê o estado solto",
  quemFalouPorTransicoes(linhaTr, 3000, 4000) === "cliente");
checa("transição exatamente no início da janela conta como estado de entrada",
  fracaoApertada([{ t: 1000, apertado: true }], 1000, 2000) === 1);
checa("transição exatamente no fim da janela fica de fora",
  fracaoApertada([{ t: 0, apertado: false }, { t: 2000, apertado: true }], 1000, 2000) === 0);
checa("janela sem duração -> null",
  quemFalouPorTransicoes([{ t: 0, apertado: true }], 1000, 1000) === null);
checa("janela invertida -> null",
  quemFalouPorTransicoes([{ t: 0, apertado: true }], 2000, 1000) === null);

console.log("\n  limiares e o bug que isto conserta");
checa("limiares configuráveis",
  quemFalouPorTransicoes([{ t: -1, apertado: true }, { t: 500, apertado: false }],
    0, 1000, { limiarSeu: 0.5 }) === "vendedor");
// O mesmo gesto real, medido dos dois jeitos: você segurou de 0 a 900 ms
// numa frase de 0 a 1000 ms (90% -> claramente sua).
const gestoReal = [{ t: 0, apertado: true }, { t: 900, apertado: false }];
checa("por transições o gesto de 90% é seu",
  quemFalouPorTransicoes(gestoReal, 0, 1000) === "vendedor");
// Com a aba oculta o Chrome entrega ~1 amostra por segundo. Se a única
// amostra da frase cair depois de você soltar, a MESMA fala vira do cliente.
checa("por amostragem estrangulada (1 Hz) a mesma fala vira do cliente",
  quemFalouPorTecla([{ t: 950, tecla: false }], 0, 1000) === "cliente");

console.log(falhas === 0 ? "\n" + total + " testes - TUDO OK"
                        : "\n" + falhas + " FALHA(S) em " + total + " testes");
process.exit(falhas === 0 ? 0 : 1);
