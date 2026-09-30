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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ATRIB, quemFalou, dominancia };
}
