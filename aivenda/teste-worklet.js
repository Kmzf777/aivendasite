// Testa worklet-energia.js offline, sem browser.
//
// O worklet roda num AudioWorkletGlobalScope, que o Node não tem. Em vez de
// mockar o Web Audio inteiro, carregamos o arquivo num contexto `vm` com só
// os três globais que ele usa (AudioWorkletProcessor, registerProcessor,
// sampleRate, currentTime) e chamamos process() com blocos sintéticos.
//
// Isso prova a MATEMÁTICA e o protocolo (tamanho da janela, RMS, input
// desconectado, "parar"). O que isto NÃO prova é que o Chrome de fato chama
// process() com a aba oculta — essa parte só se verifica no browser.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const codigo = fs.readFileSync(path.join(__dirname, "worklet-energia.js"), "utf8");

let registrado = null;
let tempoCtx = 0;   // faz o papel do global `currentTime` do worklet

// MessagePort de mentira: guarda o que foi postado e entrega o que mandamos.
class ProcessadorFalso {
  constructor() {
    const eu = this;
    this.postadas = [];
    this.port = {
      _fn: null,
      postMessage(m) { eu.postadas.push(m); },
      set onmessage(f) { this._fn = f; },
      get onmessage() { return this._fn; },
      entregar(dado) { if (this._fn) this._fn({ data: dado }); }
    };
  }
}

const caixa = {
  AudioWorkletProcessor: ProcessadorFalso,
  registerProcessor: (nome, cls) => { registrado = { nome, cls }; },
  sampleRate: 48000,
  get currentTime() { return tempoCtx; },
  Math: Math, console: console
};
vm.createContext(caixa);
vm.runInContext(codigo, caixa);

let falhas = 0, total = 0;
const checa = (n, c, extra) => {
  total++;
  console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra)));
  if (!c) falhas++;
};

// Bloco de DC: amplitude constante, então o RMS é exatamente a amplitude.
// Serve para conferir a conta sem depender de nenhuma forma de onda.
const bloco = amp => {
  const b = new Float32Array(128);
  for (let i = 0; i < b.length; i++) b[i] = amp;
  return b;
};
const SAIDA = [[new Float32Array(128)]];

function novo(intervaloMs) {
  tempoCtx = 0;
  return new registrado.cls({ processorOptions: { intervaloMs: intervaloMs } });
}
// Roda n blocos, avançando o relógio do contexto como o browser faria.
function rodar(p, n, entV, entC) {
  let r = true;
  for (let i = 0; i < n; i++) {
    r = p.process([entV, entC], SAIDA, {});
    tempoCtx += 128 / 48000;
  }
  return r;
}

console.log("\nregistro e tamanho da janela");
checa('registrou o processador como "medidor-energia"',
  registrado !== null && registrado.nome === "medidor-energia");
checa("50 ms a 48 kHz = 2400 quadros por envio", novo(50).quadrosPorEnvio === 2400);
checa("intervalo minúsculo cai no piso de um bloco (128)", novo(0.1).quadrosPorEnvio === 128);
checa("sem processorOptions assume 50 ms",
  new registrado.cls({}).quadrosPorEnvio === 2400);

console.log("\nagregação e RMS");
let p = novo(50);
const vivo = rodar(p, 18, [bloco(0.5)], [bloco(0.1)]);
checa("18 blocos (2304 quadros) ainda não fecham a janela de 2400",
  p.postadas.length === 0, p.postadas.length);
checa("process() devolve true enquanto vivo", vivo === true);
rodar(p, 1, [bloco(0.5)], [bloco(0.1)]);
checa("o 19º bloco (2432 quadros) fecha a janela e posta", p.postadas.length === 1);
checa("RMS do canal V = amplitude DC injetada (0,5)",
  Math.abs(p.postadas[0].eV - 0.5) < 1e-6, p.postadas[0].eV);
checa("RMS do canal C = amplitude DC injetada (0,1)",
  Math.abs(p.postadas[0].eC - 0.1) < 1e-6, p.postadas[0].eC);
checa("a mensagem carrega o relógio do AudioContext, não o da página",
  Math.abs(p.postadas[0].t - 18 * 128 / 48000) < 1e-9, p.postadas[0].t);

p = novo(50);
rodar(p, 19, [bloco(0.5)], []);
rodar(p, 19, [bloco(0.1)], []);
checa("o acumulador zera entre janelas (a 2ª não herda energia da 1ª)",
  p.postadas.length === 2 && Math.abs(p.postadas[1].eV - 0.1) < 1e-6,
  p.postadas.map(x => x.eV));

console.log("\ninput desconectado (é o caso do push-to-talk)");
p = novo(50);
rodar(p, 19, [bloco(0.25)], []);
checa("input 1 vazio ([]) -> eC = 0, sem NaN", p.postadas[0].eC === 0, p.postadas[0].eC);
checa("input 0 segue medido normalmente", Math.abs(p.postadas[0].eV - 0.25) < 1e-6);
p = novo(50);
rodar(p, 19, [], []);
checa("os dois vazios -> posta zeros (a contagem de blocos não para)",
  p.postadas.length === 1 && p.postadas[0].eV === 0 && p.postadas[0].eC === 0);

console.log("\ncontagem de canais");
p = novo(50);
rodar(p, 19, [bloco(0.5), bloco(0.5)], []);
checa("input estéreo com 0,5 nos dois canais dá RMS 0,5 (média, não soma)",
  Math.abs(p.postadas[0].eV - 0.5) < 1e-6, p.postadas[0].eV);

console.log("\nencerramento");
p = novo(50);
p.port.entregar("parar");
checa('mensagem "parar" faz process() devolver false',
  p.process([[bloco(0.5)], []], SAIDA, {}) === false);
p = novo(50);
p.port.entregar("outra coisa qualquer");
checa("mensagem desconhecida não mata o processador",
  p.process([[bloco(0.5)], []], SAIDA, {}) === true);

console.log(falhas === 0 ? "\n" + total + " testes - TUDO OK"
                        : "\n" + falhas + " FALHA(S) em " + total + " testes");
process.exit(falhas === 0 ? 0 : 1);
