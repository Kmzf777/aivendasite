// PORTADO de ../lib/atribuir.js — mesma logica, so o formato de modulo muda.
// A versao CommonJS da raiz continua servindo os testes offline; se mexer
// numa, mexa na outra (teste-paridade.js compara as duas).

// Quem falou, a partir da energia de dois canais fisicamente separados.
// Funcao pura, sem DOM e sem audio: da para testar sem browser.
//
// No cold call o notebook ouve duas entradas (seu microfone e o cabo vindo
// do celular). O Chrome so permite UM SpeechRecognition ativo por vez, entao
// misturamos os dois para transcrever e usamos ISTO para saber quem falou.
//
// Como os canais estao isolados, e medicao e nao estimativa. E por comparar
// nivel RELATIVO entre eles, aguenta vazamento: mesmo que a voz do cliente
// escape para o seu microfone, ela chega muito mais forte no canal dele.

const ATRIB = {
  // Quanto um canal precisa ganhar do outro para decidir.
  // Abaixo disso preferimos nao atribuir a chutar.
  margem: 1.6,
  // Abaixo deste nivel e silencio, nao fala.
  pisoSilencio: 0.0005
};

// amostras: [{ t, eV, eC }]  (energia 0..1 por canal, amostrada periodicamente)
// Devolve "vendedor" | "cliente" | null (null = empate ou silencio)
function quemFalou(amostras, de, ate, cfg) {
  const c = Object.assign({}, ATRIB, cfg || {});
  const jan = (amostras || []).filter(x => x.t >= de && x.t <= ate);
  if (!jan.length) return null;

  // Soma de potencia: energia ao quadro, somada na janela da frase.
  let sV = 0, sC = 0;
  for (const x of jan) { sV += x.eV * x.eV; sC += x.eC * x.eC; }

  const n = jan.length;
  if (Math.sqrt(sV / n) < c.pisoSilencio && Math.sqrt(sC / n) < c.pisoSilencio) return null;

  if (sV > sC * c.margem) return "vendedor";
  if (sC > sV * c.margem) return "cliente";
  return null;   // falaram por cima um do outro
}

// ------------------------------------------------------------------
// Push-to-talk: o rotulo nao e inferido, e declarado.
//
// Voce segura uma tecla enquanto fala. O reconhecedor NAO para nem
// comeca junto com a tecla (start -> audiostart leva ~208ms, comeria o
// inicio de cada frase): ele roda continuo, e a tecla so rotula o texto
// que sai, pela janela de tempo em que a frase aconteceu.
//
// Funciona com qualquer fonte de audio - viva-voz, presencial, o que for.
// O preco e disciplina: esquecer de segurar rotula sua fala como cliente.
// ------------------------------------------------------------------
const TECLA = {
  // Acima disso a frase e sua; abaixo do piso, e do cliente.
  // Entre os dois preferimos nao atribuir a chutar.
  limiarSeu: 0.6,
  limiarCliente: 0.25
};

// amostras: [{ t, tecla: bool }] amostradas periodicamente
// Devolve "vendedor" | "cliente" | null
function quemFalouPorTecla(amostras, de, ate, cfg) {
  const c = Object.assign({}, TECLA, cfg || {});
  const jan = (amostras || []).filter(x => x.t >= de && x.t <= ate);
  if (!jan.length) return null;

  const fracao = jan.filter(x => x.tecla).length / jan.length;
  if (fracao >= c.limiarSeu) return "vendedor";
  if (fracao <= c.limiarCliente) return "cliente";
  return null;   // a tecla mudou no meio da frase: nao da para separar com honestidade
}

// ------------------------------------------------------------------
// Push-to-talk por TRANSICOES - e esta que a tela usa de verdade.
//
// POR QUE NAO AMOSTRAR A TECLA COM setInterval (leia antes de "simplificar"):
// o Chrome estrangula setInterval para ~1 Hz quando a aba esta oculta ou sem
// foco. Medicao real nesta maquina, com AMOSTRA_MS = 50:
//
//   intervalos entre amostras: 999, 1001, 1000, 1008, 991 ms
//   document.visibilityState: "hidden" - document.hasFocus(): false
//   taxa efetiva: 1,1 Hz em vez de 20 Hz
//
// Ou seja: uma frase de 2 segundos rendia 2 amostras em vez de 40. A fracao
// que decide quem falou virava um chute de resolucao 50%.
//
// keydown/keyup JA sao eventos com timestamp proprio e exato. Guardando so as
// TRANSICOES ([{t, apertado}]) e integrando os intervalos dentro da janela, a
// fracao fica exata ao milissegundo, com zero timers e imune a estrangulamento.
//
// `quemFalouPorTecla` continua acima, intacto, porque os testes antigos
// dependem dela e porque ela documenta o metodo que esta sendo aposentado.
// Mas nao a use em codigo novo.
// ------------------------------------------------------------------

// transicoes: [{ t, apertado }] - uma entrada por keydown/keyup, com `t` na
//   mesma base de tempo de `de`/`ate` (na tela: relogio de parede em ms).
//   Nao precisa vir ordenada.
// estadoInicial: estado da tecla ANTES da primeira transicao da lista
//   (default false = solta). A tela semeia a lista com o estado conhecido no
//   inicio da call, mas quem chamar sem semente pode declarar o estado aqui.
//
// Devolve a fracao 0..1 do tempo da janela com a tecla presa, ou null quando
// a janela nao tem duracao ou a entrada nao e utilizavel.
//
// Bordas: janela meio-aberta [de, ate). Uma transicao exatamente em `de` conta
// como o estado vigente no inicio da janela; uma exatamente em `ate` fica de
// fora (pertence a frase seguinte). Sem isso duas frases vizinhas contariam o
// mesmo instante duas vezes.
function fracaoApertada(transicoes, de, ate, estadoInicial) {
  if (!Array.isArray(transicoes)) return null;
  const dur = ate - de;
  if (!(dur > 0)) return null;

  const ts = transicoes
    .filter(x => x && typeof x.t === "number" && isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  // Estado no instante `de`: manda a ultima transicao com t <= de. Se nao
  // houver nenhuma, a janela comecou antes do que temos guardado e vale o
  // estado inicial declarado.
  let estado = !!estadoInicial;
  let i = 0;
  while (i < ts.length && ts[i].t <= de) { estado = !!ts[i].apertado; i++; }

  // Integra os intervalos, recortando nas bordas da janela.
  let presa = 0, cursor = de;
  for (; i < ts.length; i++) {
    if (ts[i].t >= ate) break;          // daqui pra frente e fora da janela
    if (estado) presa += ts[i].t - cursor;
    cursor = ts[i].t;
    estado = !!ts[i].apertado;
  }
  if (estado) presa += ate - cursor;    // ultimo trecho, ate a borda direita

  return presa / dur;
}

// Mesmos limiares de quemFalouPorTecla, so muda a fonte da fracao.
// cfg aceita tambem { estadoInicial } (ver fracaoApertada).
function quemFalouPorTransicoes(transicoes, de, ate, cfg) {
  const c = Object.assign({}, TECLA, cfg || {});
  const fracao = fracaoApertada(transicoes, de, ate, c.estadoInicial);
  if (fracao === null) return null;
  if (fracao >= c.limiarSeu) return "vendedor";
  if (fracao <= c.limiarCliente) return "cliente";
  return null;   // a tecla mudou no meio da frase: nao da para separar com honestidade
}

// Diagnostico para a tela: o quanto um canal dominou o outro.
function dominancia(amostras, de, ate) {
  const jan = (amostras || []).filter(x => x.t >= de && x.t <= ate);
  if (!jan.length) return null;
  let sV = 0, sC = 0;
  for (const x of jan) { sV += x.eV * x.eV; sC += x.eC * x.eC; }
  const tot = sV + sC;
  if (tot <= 0) return null;
  return { voce: sV / tot, cliente: sC / tot, razao: sV > sC ? (sC ? sV / sC : Infinity) : (sV ? sC / sV : Infinity) };
}

export { ATRIB, TECLA, quemFalou, quemFalouPorTecla, fracaoApertada, quemFalouPorTransicoes, dominancia };
