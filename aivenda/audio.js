// Camada de áudio: duas trilhas de reconhecimento ao vivo em pt-BR.
//   A = seu microfone (você)      -> só exibe
//   B = áudio da aba do Meet      -> só ESTA dispara decisão
//
// Por que só B dispara: se o áudio do cliente vazar da sua caixa de som
// para o seu microfone, no pior caso a coluna "Você" fica suja. Nunca
// dispara um card falso. (Mesmo assim: use fone.)

const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;

// ------------------------------------------------------------------
// Detecção obrigatória: start(audioTrack) existe a partir do Chrome 139.
// Onde não existe, o argumento é IGNORADO EM SILÊNCIO e a instância passa
// a ouvir o microfone — a coluna "Cliente" viraria um espelho secreto da
// coluna "Você" e o vendedor não perceberia.
//
// O truque: uma track morta (readyState === "ended") é inválida. Quem
// suporta o parâmetro valida e lança InvalidStateError. Quem não suporta
// ignora o argumento e começa a ouvir o microfone — aí abortamos.
// ------------------------------------------------------------------
function suportaAudioTrack() {
  if (!Reconhecimento) return false;
  let ctx, r;
  try {
    ctx = new AudioContext();
    const destino = ctx.createMediaStreamDestination();
    const track = destino.stream.getAudioTracks()[0];
    track.stop(); // readyState -> "ended"

    r = new Reconhecimento();
    try {
      r.start(track);
      // Não lançou: o argumento foi ignorado. Para o que acabou de começar.
      try { r.abort(); } catch (e) {}
      return false;
    } catch (e) {
      return e && e.name === "InvalidStateError";
    }
  } catch (e) {
    return false;
  } finally {
    if (ctx) ctx.close().catch(() => {});
  }
}

// Uma trilha de reconhecimento que se reergue sozinha.
//
// O Chrome encerra a sessão depois de silêncio, e a spec manda abortar
// quando a página perde foco — e você vai estar olhando o Meet, não esta
// página. Então reiniciamos em onend e onerror, sempre.
function criarTrilha({ nome, track, onParcial, onFinal, onEstado }) {
  const r = new Reconhecimento();
  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;

  let ligada = false;
  let reiniciando = null;

  r.onresult = ev => {
    let parcial = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const texto = ev.results[i][0].transcript.trim();
      if (!texto) continue;
      if (ev.results[i].isFinal) onFinal(texto);
      else parcial += texto + " ";
    }
    if (parcial.trim()) onParcial(parcial.trim());
  };

  r.onerror = ev => {
    // not-allowed / service-not-allowed = o usuário negou o microfone.
    // Reiniciar aí só geraria um loop de prompts negados.
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      ligada = false;
      onEstado("negado", ev.error);
      return;
    }
    // "no-speech" e "aborted" são rotina; onend cuida do restart.
    onEstado("erro", ev.error);
  };

  r.onend = () => {
    if (!ligada) { onEstado("parada"); return; }
    // Pequeno atraso: start() imediato depois de onend às vezes lança
    // InvalidStateError porque a sessão anterior ainda está fechando.
    clearTimeout(reiniciando);
    reiniciando = setTimeout(() => {
      if (!ligada) return;
      try { track ? r.start(track) : r.start(); onEstado("ouvindo"); }
      catch (e) { onEstado("erro", e.name); reiniciando = setTimeout(() => r.onend(), 500); }
    }, 250);
  };

  return {
    nome,
    comecar() {
      ligada = true;
      try { track ? r.start(track) : r.start(); onEstado("ouvindo"); }
      catch (e) { onEstado("erro", e.name); }
    },
    parar() {
      ligada = false;
      clearTimeout(reiniciando);
      try { r.abort(); } catch (e) {}
      onEstado("parada");
    }
  };
}

// Junta as falas finais do cliente e dispara depois de uma pausa curta.
//
// Cada disparo leva um `seq` crescente. Quem chama descarta a resposta se
// `seq` não for mais o atual — é isso que garante que fala mais nova vence
// fala mais velha, independente da ordem em que a rede responder.
function criarDisparador({ pausaMs, onDisparo }) {
  let acumulado = "";
  let parcialAtual = "";
  let timer = null;
  let seq = 0;

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const texto = (acumulado + " " + parcialAtual).trim();
      if (texto) onDisparo(texto, ++seq);
    }, pausaMs);
  }

  return {
    seqAtual: () => seq,
    parcial(texto) { parcialAtual = texto; agendar(); },
    final(texto) {
      acumulado = (acumulado + " " + texto).trim();
      parcialAtual = "";
      agendar();
    },
    // Chamado quando a decisão saiu: a frase acabou, começa uma nova.
    limpar() { acumulado = ""; parcialAtual = ""; clearTimeout(timer); },
    zerar() { acumulado = ""; parcialAtual = ""; clearTimeout(timer); seq = 0; }
  };
}

// Pede a aba do Meet e devolve a track de áudio dela.
async function pegarAudioDaAba() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const audio = stream.getAudioTracks()[0];
  if (!audio) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error("Você compartilhou a aba mas não marcou 'Compartilhar áudio da aba'. Tente de novo e marque a caixinha.");
  }
  // O vídeo não é usado para nada; só a Screen Capture API exige pedir.
  stream.getVideoTracks().forEach(t => t.stop());
  return { track: audio, stream };
}
