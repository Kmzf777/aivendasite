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

// ==================================================================
// Quem sou eu
// ==================================================================
// data-self-name esta no proprio tile de video e nao exige abrir painel.
function descobrirMeuNome() {
  const tile = document.querySelector("[data-self-name]");
  if (tile) return tile.getAttribute("data-self-name");
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
  const porJsname = document.querySelector(`[jsname="${SEL.container}"]`);
  if (porJsname) { ultimaCamada = "jsname"; return porJsname; }

  // Fallback aria-live. CUIDADO: os anuncios de status do Meet usam a MESMA
  // aria-live das legendas. Transcricoes inteiras ja sairam so com aviso de
  // sistema por causa disso. So aceita se houver bloco com nome de falante.
  const vivos = [...document.querySelectorAll('[aria-live="polite"]')];
  const comFalante = vivos.find(r =>
    r.querySelector(`[jsname="${SEL.nome}"]`) ||
    [...r.children].some(c => c.innerText && c.innerText.trim().split("\n").length >= 2));
  if (comFalante) { ultimaCamada = "aria-live"; return comFalante; }

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
    let nome = nomeEl ? nomeEl.innerText.trim() : "";
    let texto = txtEl ? txtEl.innerText.trim() : "";
    if (!nome || !texto) {
      const partes = b.innerText.split("\n").map(s => s.trim()).filter(Boolean);
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

  // O Meet reescreve a linha enquanto a pessoa fala. Se o que ja foi
  // committado comeca com este texto, e a mesma frase de novo.
  const antes = jaCommitado.get(nome) || "";
  if (antes && (antes === texto || antes.startsWith(texto))) return;
  jaCommitado.set(nome, texto);

  linhasVistas++;
  const souEu = meuNome && nome.trim().toLowerCase() === meuNome.trim().toLowerCase();
  log("linha", nome, souEu ? "(voce)" : "(cliente)", texto);
  onLinha({ nome, texto, quem: souEu ? "vendedor" : "cliente" });
}

function aoMudar(onLinha) {
  const container = acharContainer();
  if (!container) return;
  const blocos = lerBlocos(container);
  const presentes = new Set(blocos.map(b => b.nome));

  blocos.forEach(({ nome, texto }) => {
    const anterior = emAndamento.get(nome);
    if (anterior && anterior.texto === texto) return;
    if (anterior) clearTimeout(anterior.timer);
    const timer = setTimeout(() => commitar(nome, onLinha), CONFIG_CAP.debounceMs);
    emAndamento.set(nome, { texto, timer });
  });

  // Bloco sumiu do DOM = o falante terminou. Commita na hora.
  [...emAndamento.keys()].forEach(nome => {
    if (!presentes.has(nome)) {
      clearTimeout(emAndamento.get(nome).timer);
      commitar(nome, onLinha);
    }
  });
}

function observar(onLinha) {
  const obs = new MutationObserver(() => aoMudar(onLinha));
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  return obs;
}

// ==================================================================
// Diagnostico — rodar no console da aba do Meet
// ==================================================================
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
  if (document.getElementById("copiloto-overlay")) return;
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
  if (ev && ev.tipo === "decisao") pintarDecisao(ev);
});

// ==================================================================
// Inicio
// ==================================================================
(async () => {
  montarOverlay();
  meuNome = descobrirMeuNome();
  await ligarLegendas();

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
    // So manda se ja sabemos separar os falantes.
    if (!meuNome) return;
    chrome.runtime.sendMessage({ tipo: "linha", ...linha });
  });

  // A luz verde diz se as legendas estao vivas.
  setInterval(() => {
    const luz = elOverlay && elOverlay.querySelector(".cp-luz");
    if (luz) luz.classList.toggle("viva", legendasLigadas() && !!meuNome);
  }, 1500);
})();
