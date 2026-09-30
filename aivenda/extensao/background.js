// Service worker: recebe a fala do content script, decide com o Jev e
// distribui a decisao para o overlay e para o painel separado.
//
// A chamada sai DAQUI e nao do content script: o content script roda em
// https://meet.google.com, e chamar http://localhost de la e mixed content,
// que o Chrome bloqueia EM SILENCIO (o fetch pendura ate dar timeout).
// Verificado na Tarefa 1: o service worker com host_permissions alcanca.

importScripts("lib/decisao.js", "lib/objecoes-exemplo.js");

const SERVIDOR = "http://localhost:3000";

let objecoes = OBJECOES_EXEMPLO;
let falas = [];
let ultimaMostrada = null;
let seq = 0;

// ==================================================================
// Catalogo (fonte de verdade no servidor, para as duas telas verem o mesmo)
// ==================================================================
async function carregarObjecoes() {
  try {
    const r = await fetch(SERVIDOR + "/objecoes");
    const lista = await r.json();
    if (Array.isArray(lista) && lista.length) {
      objecoes = lista;
      console.log("[COPILOTO] catalogo:", objecoes.length, "objecoes");
    }
  } catch (e) {
    console.log("[COPILOTO] servidor fora, usando as 7 de exemplo:", e.message);
  }
}
carregarObjecoes();
chrome.runtime.onInstalled.addListener(carregarObjecoes);
chrome.runtime.onStartup.addListener(carregarObjecoes);

// ==================================================================
// Publicar para o painel separado
// ==================================================================
async function publicar(evento) {
  try {
    await fetch(SERVIDOR + "/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento)
    });
  } catch (e) { /* painel offline: o overlay continua funcionando */ }
}

// ==================================================================
// Decisao
// ==================================================================
async function decidir(linha, tabId) {
  falas.push({ quem: linha.quem, fala: linha.texto });
  if (falas.length > 40) falas = falas.slice(-40);

  publicar({ tipo: "fala", quem: linha.quem, nome: linha.nome, texto: linha.texto });

  // So a fala do cliente decide. A sua serve de contexto.
  if (linha.quem !== "cliente") return;

  const meu = ++seq;
  const t0 = Date.now();
  let json;
  try {
    const r = await fetch(SERVIDOR + "/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.modelo,
        state: montarState(falas, linha.texto),
        questions: montarPerguntas(objecoes)
      })
    });
    json = await r.json();
    if (!r.ok) throw new Error(json.error || ("HTTP " + r.status));
  } catch (e) {
    console.error("[COPILOTO] falha no Jev:", e.message);
    publicar({ tipo: "erro", mensagem: "Falha ao falar com o Jev: " + e.message });
    return;
  }
  const ms = Date.now() - t0;

  // Chegou fala mais nova enquanto esta chamada estava no ar: descarta.
  if (meu < seq) return;

  const d = aplicarRegra(json, objecoes, ultimaMostrada);
  if (d.acao === "card") ultimaMostrada = d.escolha;

  const evento = {
    tipo: "decisao",
    acao: d.acao, fase: d.fase, confianca: d.confianca, temObjecao: d.temObjecao,
    escolha: d.escolha, objecao: d.objecao || null,
    falaCliente: linha.texto, ms, custo: calcularCusto(json.usage)
  };

  console.log("[COPILOTO]", d.acao, d.escolha, "conf", d.confianca, ms + "ms");
  publicar(evento);
  if (tabId != null) chrome.tabs.sendMessage(tabId, evento).catch(() => {});
}

// ==================================================================
// Mensagens do content script e da pagina de opcoes
// ==================================================================
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.tipo === "linha") decidir(msg, sender.tab && sender.tab.id);
  if (msg.tipo === "recarregar-objecoes") carregarObjecoes();
  if (msg.tipo === "zerar") { falas = []; ultimaMostrada = null; seq = 0; }
});
