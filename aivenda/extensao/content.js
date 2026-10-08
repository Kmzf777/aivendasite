// Le as legendas do Google Meet e separa quem falou.
//
// Nao usa a Web Speech API de proposito: o Chrome so permite UM
// SpeechRecognition ativo por vez no processo inteiro (medido: iniciar o
// segundo aborta o primeiro em 2ms, inclusive de dentro de um iframe
// mesmo-origem). Duas trilhas simultaneas sao impossiveis.
//
// A legenda do Meet ja vem com o nome do falante, que e exatamente a peca
// que faltava.

const DEBUG = false;
const log = (...a) => { if (DEBUG) console.log("[COPILOTO]", ...a); };

// jsname e mais estavel que as classes CSS ofuscadas do Meet, mas ainda
// quebra em atualizacao do Meet. Por isso as tres camadas em acharContainer().
const SEL = {
  container: "tgaKEf",   // janela das legendas
  bloco: "YSxPC",        // bloco de um falante
  nome: "r4nke",         // span do nome
  texto: "bVV8Bd"        // span do texto
};

const CONFIG_CAP = {
  debounceMs: 700   // o Meet manda a legenda palavra por palavra
};

let meuNome = null;
let ultimaCamada = null;
let linhasVistas = 0;
let containerCache = null;
let ticksSemBloco = 0;

// ==================================================================
// Quem sou eu
// ==================================================================
// data-self-name esta no proprio tile de video e nao exige abrir painel.
function descobrirMeuNome() {
  const tile = document.querySelector("[data-self-name]");
  // O atributo pode existir vazio. Se devolvesse "" aqui, o retry do inicio
  // ficaria girando para sempre sem nunca cair na heuristica abaixo.
  const doTile = tile ? (tile.getAttribute("data-self-name") || "").trim() : "";
  if (doTile) return doTile;
  const eu = [...document.querySelectorAll("[data-participant-id]")]
    .map(e => e.textContent || "")
    .find(t => /\((você|voce|you)\)/i.test(t));
  return eu ? eu.replace(/\((você|voce|you)\)/i, "").trim() : null;
}

// ==================================================================
// Ligar as legendas
// ==================================================================
// Cuidado: buscar por palavra-chave acha "Configuracoes > Legendas" e abre
// um dialogo em vez de ligar a legenda. Filtra tudo que parece settings.
function pareceToggleDeLegenda(el) {
  if (!el || el.closest('[role="dialog"]')) return false;
  const rot = ((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("data-tooltip") || "")).toLowerCase();
  if (!rot) return false;
  if (/configura|settings|opç|opc|option|idioma|language/.test(rot)) return false;
  return /legenda|caption|untertitel|subtitul|sous-titre/.test(rot) || /\(c\)/.test(rot);
}

function acharBotaoCC() {
  const cand = [...document.querySelectorAll("button,[role=button]")];
  // 1. jsname conhecidos do botao CC
  const porJsname = cand.find(e =>
    ["r8qRAd", "Dg9Wp"].includes(e.getAttribute("jsname")) && !e.closest('[role="dialog"]'));
  if (porJsname) return porJsname;
  // 2. o atalho (c) no rotulo e independente de idioma
  const porAtalho = cand.find(e => pareceToggleDeLegenda(e) &&
    /\(c\)/.test(((e.getAttribute("aria-label") || "") + (e.getAttribute("data-tooltip") || "")).toLowerCase()));
  if (porAtalho) return porAtalho;
  // 3. palavra-chave, ja filtrada
  return cand.find(pareceToggleDeLegenda) || null;
}

function legendasLigadas() { return !!acharContainer(); }

async function ligarLegendas() {
  if (legendasLigadas()) return true;
  const bt = acharBotaoCC();
  if (!bt) { log("botao CC nao encontrado"); return false; }
  // Se o proprio botao diz que a legenda JA esta ligada, clicar DESLIGA a
  // legenda do usuario. Isso acontece justo no pior caso: os jsname do
  // container envelheceram, legendasLigadas() devolve false com a legenda na
  // tela, e o "conserto" automatico apagaria o unico sinal que temos.
  const pressionado = bt.getAttribute("aria-pressed") || bt.getAttribute("aria-checked");
  if (pressionado === "true") {
    log("o botao diz que a legenda ja esta ligada; nao vou clicar");
    return false;
  }
  bt.click();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 150));
    if (legendasLigadas()) return true;
  }
  log("cliquei no CC mas as legendas nao apareceram");
  return false;
}

// ==================================================================
// Achar o container das legendas — tres camadas
// ==================================================================
function acharContainer() {
  // Cache: o observer dispara muitas vezes por segundo numa call e a busca
  // pelo fallback le innerText, que forca layout. Revalida por isConnected,
  // entao desligar o CC (o container sai do DOM) solta o cache sozinho.
  if (containerCache && containerCache.isConnected) return containerCache;
  containerCache = null;

  const porJsname = document.querySelector(`[jsname="${SEL.container}"]`);
  if (porJsname) { ultimaCamada = "jsname"; containerCache = porJsname; return porJsname; }

  // Fallback aria-live. CUIDADO: os anuncios de status do Meet usam a MESMA
  // aria-live das legendas. Transcricoes inteiras ja sairam so com aviso de
  // sistema por causa disso. So aceita se houver bloco com nome de falante.
  const vivos = [...document.querySelectorAll('[aria-live="polite"]')];
  const comFalante = vivos.find(r =>
    r.querySelector(`[jsname="${SEL.nome}"]`) ||
    [...r.children].some(c => c.innerText && c.innerText.trim().split("\n").length >= 2));
  if (comFalante) { ultimaCamada = "aria-live"; containerCache = comFalante; return comFalante; }

  return null;
}

// ==================================================================
// Extrair as falas
// ==================================================================
function lerBlocos(container) {
  let blocos = [...container.querySelectorAll(`[jsname="${SEL.bloco}"]`)];
  if (!blocos.length) {
    // Heuristica estrutural: filho direto com conteudo.
    blocos = [...container.children].filter(c => c.innerText && c.innerText.trim());
    if (ultimaCamada === "jsname") ultimaCamada = "estrutural";
  }
  return blocos.map(b => {
    const nomeEl = b.querySelector(`[jsname="${SEL.nome}"]`);
    const txtEl = b.querySelector(`[jsname="${SEL.texto}"]`);
    // innerText nao existe em elemento SVG: sem o || "" isso viraria
    // TypeError dentro do observer, uma vez por mutacao.
    let nome = nomeEl ? (nomeEl.innerText || "").trim() : "";
    let texto = txtEl ? (txtEl.innerText || "").trim() : "";
    if (!nome || !texto) {
      const partes = (b.innerText || "").split("\n").map(s => s.trim()).filter(Boolean);
      if (partes.length >= 2) {
        if (!nome) nome = partes[0];
        if (!texto) texto = partes.slice(1).join(" ");
      }
    }
    return { nome, texto };
  }).filter(x => x.nome && x.texto);
}

// ==================================================================
// Commit com debounce e dedup por prefixo
// ==================================================================
const emAndamento = new Map(); // nome -> { texto, timer }
const jaCommitado = new Map(); // nome -> ultimo texto committado

function commitar(nome, onLinha) {
  const atual = emAndamento.get(nome);
  if (!atual) return;
  emAndamento.delete(nome);
  const texto = (atual.texto || "").trim();
  if (!texto) return;

  // O Meet reescreve a linha enquanto a pessoa fala, nos DOIS sentidos, e a
  // regra antiga so cobria um deles:
  //  - encurta/rerenderiza: o texto ja committado comeca com o texto novo.
  //    E a mesma frase de novo -> descarta.
  //  - cresce: o texto novo comeca com o ja committado. Acontece sempre que a
  //    pessoa pausa mais que o debounce e continua no MESMO bloco. Antes a
  //    frase inteira era reenviada, com o prefixo ja processado dentro dela
  //    (chamada duplicada no Jev e card repetido). Agora vai so o pedaco novo.
  const antes = jaCommitado.get(nome) || "";
  if (antes && (antes === texto || antes.startsWith(texto))) return;

  let paraEnviar = texto;
  if (antes && texto.startsWith(antes)) paraEnviar = texto.slice(antes.length).trim();
  jaCommitado.set(nome, texto);
  if (!paraEnviar) return;

  linhasVistas++;
  const souEu = meuNome && nome.trim().toLowerCase() === meuNome.trim().toLowerCase();
  log("linha", nome, souEu ? "(voce)" : "(cliente)", paraEnviar);
  onLinha({ nome, texto: paraEnviar, quem: souEu ? "vendedor" : "cliente" });
}

function aoMudar(onLinha) {
  const container = acharContainer();
  if (!container) return;
  const blocos = lerBlocos(container);

  // Container achado mas ilegivel por varios segundos: pode ser que o cache
  // tenha agarrado a regiao aria-live errada (aviso de sistema). Solta.
  if (!blocos.length) {
    if (++ticksSemBloco > 40) { containerCache = null; ticksSemBloco = 0; }
  } else {
    ticksSemBloco = 0;
  }

  // O Meet pode mostrar DOIS blocos do mesmo falante ao mesmo tempo (turnos
  // consecutivos). Com a chave so no nome, o texto de um bloco sobrescrevia o
  // do outro a cada passada; o clearTimeout rearmava o debounce sem parar e o
  // commit nunca chegava a acontecer. Junta os blocos do mesmo falante na
  // ordem do DOM (que e a ordem cronologica) e trata como um texto so.
  const porFalante = new Map();
  blocos.forEach(({ nome, texto }) => {
    const antes = porFalante.get(nome);
    porFalante.set(nome, antes ? antes + " " + texto : texto);
  });

  porFalante.forEach((texto, nome) => {
    const anterior = emAndamento.get(nome);
    if (anterior && anterior.texto === texto) return;
    if (anterior) clearTimeout(anterior.timer);
    const timer = setTimeout(() => commitar(nome, onLinha), CONFIG_CAP.debounceMs);
    emAndamento.set(nome, { texto, timer });
  });

  // Bloco sumiu do DOM = o falante terminou. Commita na hora.
  [...emAndamento.keys()].forEach(nome => {
    if (!porFalante.has(nome)) {
      clearTimeout(emAndamento.get(nome).timer);
      commitar(nome, onLinha);
    }
  });
}

function observar(onLinha) {
  // O Meet muta o DOM sem parar (video, relogio, presenca, tooltips) e o
  // observer e em document.body com subtree. Sem coalescer, aoMudar() roda
  // dezenas de vezes por segundo e cada passada le innerText, que forca
  // layout numa pagina que ja esta desenhando video. 120ms fica bem abaixo
  // do debounce de 700ms, entao nao muda a semantica do commit.
  let agendado = false;
  const obs = new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    setTimeout(() => { agendado = false; aoMudar(onLinha); }, 120);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  return obs;
}

// ==================================================================
// Diagnostico — rodar no console da aba do Meet
// ==================================================================
// ATENCAO: content script roda em mundo isolado. Este `window` NAO e o da
// pagina. No DevTools, troque o seletor de contexto (ao lado do "top") para
// "Copiloto de Call" antes de chamar diagnostico() — no contexto "top" a
// funcao nao existe.
function diagnostico() {
  return {
    meuNome,
    camada: ultimaCamada,
    linhasVistas,
    legendasLigadas: legendasLigadas(),
    achouBotaoCC: !!acharBotaoCC(),
    falantesVistos: [...jaCommitado.keys()]
  };
}
window.diagnostico = diagnostico;

// ==================================================================
// Overlay dentro do Meet
// ==================================================================
const FASES_NOME = {
  abertura: "Abertura", diagnostico_dor: "Dor", apresentacao: "Pitch",
  objecao: "Objeção", fechamento: "Fecho"
};
let elOverlay = null;

function montarOverlay() {
  const existente = document.getElementById("copiloto-overlay");
  // Se o overlay ja existe (script injetado duas vezes no mesmo documento) e
  // saissemos aqui sem setar elOverlay, pintarDecisao() voltaria vazio para
  // sempre: o card nunca apareceria e nada denunciaria o motivo.
  if (existente) { elOverlay = existente; return; }
  const d = document.createElement("div");
  d.id = "copiloto-overlay";
  d.innerHTML =
    '<div class="cp-topo"><i class="cp-luz"></i><b>Copiloto</b>' +
    '<button class="cp-bt" title="Recolher">—</button></div>' +
    '<div class="cp-fases"></div>' +
    '<div class="cp-corpo"><div class="cp-vazio">Ouvindo a call.</div></div>' +
    '<div class="cp-hist"></div>';
  document.body.appendChild(d);
  elOverlay = d;

  d.querySelector(".cp-bt").onclick = () => {
    const r = d.classList.toggle("recolhido");
    d.querySelector(".cp-bt").textContent = r ? "▢" : "—";
  };
  arrastavel(d, d.querySelector(".cp-topo"));

  const f = d.querySelector(".cp-fases");
  Object.entries(FASES_NOME).forEach(([id, nome]) => {
    const e = document.createElement("div");
    e.className = "cp-fase";
    e.dataset.fase = id;
    e.textContent = nome;
    f.appendChild(e);
  });
}

function arrastavel(caixa, alca) {
  let ox = 0, oy = 0, arrastando = false;
  alca.addEventListener("mousedown", e => {
    if (e.target.closest("button")) return;
    arrastando = true;
    const r = caixa.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!arrastando) return;
    caixa.style.left = Math.max(0, e.clientX - ox) + "px";
    caixa.style.top = Math.max(0, e.clientY - oy) + "px";
    caixa.style.right = "auto";
  });
  document.addEventListener("mouseup", () => { arrastando = false; });
}

// Mensagem honesta no corpo do overlay (usa textContent, nao innerHTML).
function avisarOverlay(txt) {
  if (!elOverlay) return;
  const corpo = elOverlay.querySelector(".cp-corpo");
  if (!corpo) return;
  corpo.innerHTML = '<div class="cp-vazio"></div>';
  corpo.querySelector(".cp-vazio").textContent = txt;
}

function pintarFase(fase) {
  if (!elOverlay || !fase) return;
  elOverlay.querySelectorAll(".cp-fase").forEach(e =>
    e.classList.toggle("ativa", e.dataset.fase === fase));
}

function pintarDecisao(ev) {
  if (!elOverlay) return;
  pintarFase(ev.fase);
  const corpo = elOverlay.querySelector(".cp-corpo");

  if (ev.acao === "card" && ev.objecao) {
    corpo.innerHTML =
      '<div class="cp-card"><div class="cp-rot">Quebrar objeção</div>' +
      '<div class="cp-nome"></div><div class="cp-arg"></div>' +
      '<div class="cp-pe"><span>confiança <b></b></span><span><b></b></span></div></div>';
    corpo.querySelector(".cp-nome").textContent = ev.objecao.nome;
    corpo.querySelector(".cp-arg").textContent = ev.objecao.argumento;
    const b = corpo.querySelectorAll(".cp-pe b");
    b[0].textContent = Math.round(ev.confianca * 100) + "%";
    b[1].textContent = ev.ms + " ms";
    const h = elOverlay.querySelector(".cp-hist");
    const s = document.createElement("span");
    s.textContent = ev.objecao.nome;
    h.appendChild(s);
    // Numa call longa o historico cresceria sem fim e comeria a altura do
    // card, porque .cp-hist nao encolhe (flex-shrink:0).
    while (h.children.length > 12) h.removeChild(h.firstChild);
  } else if (ev.acao === "alerta") {
    corpo.innerHTML =
      '<div class="cp-card neutro"><div class="cp-rot">Objeção não catalogada</div>' +
      '<div class="cp-nome">Sem argumento pronto</div><div class="cp-fala"></div>' +
      '<div class="cp-pe"><span><b></b></span><span>cadastre em Minhas objeções</span></div></div>';
    corpo.querySelector(".cp-fala").textContent = '"' + ev.falaCliente + '"';
    corpo.querySelector(".cp-pe b").textContent = ev.ms + " ms";
  }
}

chrome.runtime.onMessage.addListener(ev => {
  if (!ev) return;
  if (ev.tipo === "decisao") pintarDecisao(ev);
  if (ev.tipo === "aviso") avisarOverlay(ev.mensagem || "");
});

// ==================================================================
// Inicio
// ==================================================================
(async () => {
  montarOverlay();
  meuNome = descobrirMeuNome();
  const ligou = await ligarLegendas();

  // Degradar calado seria pior: o overlay diria "Ouvindo a call" com a
  // legenda desligada e nada apareceria nunca.
  let avisando = false;
  if (!ligou && !legendasLigadas()) {
    avisarOverlay("Não consegui ligar as legendas do Meet. Ligue o CC na barra do Meet — sem legenda eu não ouço nada.");
    avisando = true;
  }

  if (!meuNome) {
    // Sem saber quem e voce, TODA fala viraria "cliente" e o card dispararia
    // com a sua propria voz. Melhor continuar tentando do que mentir.
    log("ainda nao sei quem sou eu; tentando de novo");
    const t = setInterval(() => {
      meuNome = descobrirMeuNome();
      if (meuNome) { log("sou", meuNome); clearInterval(t); }
    }, 2000);
  }

  observar(linha => {
    // Chegou legenda: o aviso acima ficou velho.
    if (avisando) { avisarOverlay("Ouvindo a call."); avisando = false; }
    // So manda se ja sabemos separar os falantes.
    if (!meuNome) return;
    // Depois de recarregar a extensao, o canal deste content script morre e
    // sendMessage lanca "Extension context invalidated" — sincrono num caso,
    // como promise rejeitada no outro. Sem isso, um erro por fala no console.
    try {
      const p = chrome.runtime.sendMessage({ tipo: "linha", ...linha });
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {
      log("nao consegui mandar a linha:", e && e.message);
    }
  });

  // A luz verde diz se as legendas estao vivas.
  setInterval(() => {
    const luz = elOverlay && elOverlay.querySelector(".cp-luz");
    if (luz) luz.classList.toggle("viva", legendasLigadas() && !!meuNome);
  }, 1500);
})();
