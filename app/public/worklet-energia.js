// Medidor de energia dos dois canais, rodando na THREAD DE AUDIO.
//
// ==================================================================
// POR QUE ISTO EXISTE (leia antes de "simplificar" de volta)
// ==================================================================
// A versao anterior media energia com AnalyserNode + setInterval(50ms) na
// thread principal. O Chrome estrangula setInterval para ~1 Hz quando a aba
// esta oculta ou sem foco. Medicao real na maquina do usuario:
//
//   intervalos entre amostras: 999, 1001, 1000, 1008, 991 ms  (esperado: 50)
//   document.visibilityState: "hidden" - document.hasFocus(): false
//   taxa efetiva: 1,1 Hz em vez de 20 Hz
//
// No modo "duas entradas" a pagina NEM PRECISA de foco - o vendedor esta
// falando no celular e olhando outra janela. Resultado: uma frase de 2 s
// rendia 2 amostras em vez de 40, e a atribuicao por energia parava de
// funcionar de fato.
//
// AudioWorkletProcessor.process() roda na thread de renderizacao de audio,
// que NAO e estrangulada: ela e chamada uma vez por bloco de 128 quadros
// (~2,7 ms a 48 kHz) enquanto o AudioContext estiver rodando, oculto ou nao.
// Acumulamos a soma dos quadrados aqui e postamos um RMS por janela.
//
// Se alguem quiser trocar isto por AnalyserNode + setInterval de novo: nao.
// O bug volta inteiro. (O AnalyserNode continua em coldcall.html, mas SO como
// fallback para navegador sem AudioWorklet, e a tela avisa quando cai la.)
// ==================================================================

// Soma dos quadrados de um input.
// `entrada` e um array de Float32Array, um por canal. Input desconectado vem
// como [] (e o caso do canal do cliente no modo push-to-talk).
// Somamos todos os canais e dividimos pelo total de quadros, entao um input
// estereo da a media dos canais - o RMS nao depende da contagem de canais.
function somaQuadrados(entrada) {
  if (!entrada || !entrada.length) return null;
  let soma = 0, quadros = 0;
  for (let c = 0; c < entrada.length; c++) {
    const buf = entrada[c];
    if (!buf || !buf.length) continue;
    for (let i = 0; i < buf.length; i++) soma += buf[i] * buf[i];
    quadros += buf.length;
  }
  return quadros ? { soma: soma, quadros: quadros } : null;
}

class MedidorEnergia extends AudioWorkletProcessor {
  constructor(opcoes) {
    super();
    const p = (opcoes && opcoes.processorOptions) || {};
    const intervaloMs = p.intervaloMs > 0 ? p.intervaloMs : 50;

    // Quantos quadros juntar antes de postar. Piso de 128 = um bloco de
    // renderizacao; abaixo disso nao ha o que agregar.
    // `sampleRate` e global do AudioWorkletGlobalScope.
    this.quadrosPorEnvio = Math.max(128, Math.round(sampleRate * intervaloMs / 1000));

    this.somaV = 0; this.quadrosV = 0;
    this.somaC = 0; this.quadrosC = 0;
    this.quadros = 0;

    // process() devolvendo false mata o processador. A pagina manda "parar"
    // ao encerrar a call; sem isso ele so morreria com o AudioContext.
    this.vivo = true;
    this.port.onmessage = ev => { if (ev.data === "parar") this.vivo = false; };
  }

  process(entradas) {
    const a = somaQuadrados(entradas[0]);   // input 0 = voce (microfone)
    const b = somaQuadrados(entradas[1]);   // input 1 = cliente (cabo); [] no push-to-talk
    if (a) { this.somaV += a.soma; this.quadrosV += a.quadros; }
    if (b) { this.somaC += b.soma; this.quadrosC += b.quadros; }

    // Um render quantum tem sempre 128 quadros, mesmo com input desconectado.
    this.quadros += 128;

    if (this.quadros >= this.quadrosPorEnvio) {
      this.port.postMessage({
        // Relogio do AudioContext (segundos desde a criacao do contexto). A
        // pagina traduz para relogio de parede com uma ancora fixa.
        // NAO usamos o instante de CHEGADA da mensagem na thread principal:
        // ela pode estar ocupada (fetch do Jev, DOM) e atrasar a entrega, o
        // que jogaria fora justamente a precisao que viemos buscar aqui.
        t: currentTime,
        eV: this.quadrosV ? Math.sqrt(this.somaV / this.quadrosV) : 0,
        eC: this.quadrosC ? Math.sqrt(this.somaC / this.quadrosC) : 0
      });
      this.somaV = 0; this.quadrosV = 0;
      this.somaC = 0; this.quadrosC = 0;
      this.quadros = 0;
    }

    return this.vivo;
  }
}

registerProcessor("medidor-energia", MedidorEnergia);
