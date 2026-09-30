# Copiloto v2 (extensão Chrome) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Substituir o ouvido do copiloto: em vez de duas instâncias de `SpeechRecognition` (impossível no Chrome), uma extensão lê as legendas do próprio Google Meet, que já vêm com o nome de quem falou.

**Architecture:** Content script em `meet.google.com` liga as legendas, observa o DOM e separa falante por `data-self-name`. Manda cada linha committada ao service worker, que monta a pergunta com o `lib/decisao.js` **já existente e já testado** e chama `http://localhost:3000/jev`. A decisão volta para o overlay injetado no Meet e, em paralelo, vai por SSE para o painel em `localhost:3000`. A decisão acontece num lugar só; as duas telas apenas exibem.

**Tech Stack:** Chrome MV3, MutationObserver, SSE, Node core (`http`/`https`/`fs`), Jev `jev-1.13.0`.

**Spec:** `aivenda/docs/superpowers/specs/2026-09-30-copiloto-v2-extensao-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `extensao/manifest.json` | MV3, content script no Meet, `host_permissions` do localhost |
| `extensao/background.js` | Service worker: recebe fala, chama o Jev, distribui a decisão |
| `extensao/content.js` | Liga CC, observa legendas, separa falante, injeta overlay |
| `extensao/overlay.css` | Estilo do painel injetado |
| `extensao/lib/decisao.js` | Cópia do `lib/decisao.js` da raiz (Tarefa 2 garante que não divergem) |
| `extensao/lib/objecoes-exemplo.js` | Cópia idem |
| `extensao/opcoes.html` / `opcoes.js` | Aba "Minhas objeções" |
| `server.js` | **estendido**: `/evento`, `/eventos` (SSE), `/objecoes` |
| `index.html` | **alterado**: recebe por SSE, não decide mais nada |
| `audio.js` | **apagado** |

---

## Task 1: Provar que o service worker alcança o localhost

**Gate. Nada é construído em cima disso antes de ter evidência.**

**Files:** Create `extensao/manifest.json`, `extensao/background.js`

- [ ] **Step 1: `extensao/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Copiloto de Call (diagnóstico)",
  "version": "0.1.0",
  "description": "Teste de alcance ao servidor local.",
  "permissions": ["storage"],
  "host_permissions": ["http://localhost:3000/*"],
  "background": { "service_worker": "background.js" }
}
```

- [ ] **Step 2: `extensao/background.js`**

```js
// Tarefa 1: so prova que o service worker alcanca o localhost.
async function diagnostico() {
  const r = { quando: new Date().toISOString() };
  try {
    const resp = await fetch("http://localhost:3000/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-1.13.0",
        state: "Esse valor ta fora do meu orcamento.",
        questions: { tem_objecao: { type: "noul", instructions: "Is the customer objecting?", criteria: { true: "Yes", false: "No" } } }
      })
    });
    const j = await resp.json();
    r.ok = resp.ok;
    r.status = resp.status;
    r.noul = j?.answers?.tem_objecao?.noul;
  } catch (e) {
    r.ok = false;
    r.erro = e.name + ": " + e.message;
  }
  console.log("[COPILOTO] diagnostico localhost:", JSON.stringify(r));
  await chrome.storage.local.set({ diagnostico: r });
  return r;
}
chrome.runtime.onInstalled.addListener(diagnostico);
chrome.runtime.onStartup.addListener(diagnostico);
```

- [ ] **Step 3: Subir o servidor**

Run: `cd aivenda && node server.js`
Expected: o banner com `http://localhost:3000`.

- [ ] **Step 4: Carregar a extensão (manual — peça ao usuário)**

1. `chrome://extensions`
2. Ligar **Modo do desenvolvedor** (canto superior direito)
3. **Carregar sem compactação** → escolher a pasta `aivenda/extensao`

- [ ] **Step 5: Ler o resultado**

Em `chrome://extensions`, no card da extensão, clicar em **service worker** para abrir o
DevTools dele. Procurar a linha `[COPILOTO] diagnostico localhost:`.

**Resultado esperado (caminho feliz):**
`{"ok":true,"status":200,"noul":0.95}` → o service worker alcança o localhost. Seguir para a Tarefa 2.

**Se vier `ok:false` com `TypeError: Failed to fetch`:** Private Network Access está
bloqueando. **Pare e vá para o Plano B abaixo antes de continuar.**

- [ ] **Step 6 (só se o Step 5 falhar): Plano B**

A extensão passa a chamar `https://api.typesafe.ai/v1/systemone` direto, com a chave em
`chrome.storage.local` (gravada na página de opções, nunca no código). `host_permissions`
vira `["https://api.typesafe.ai/*"]`. O servidor local fica só para o painel separado, e
o overlay funciona sem ele. Registrar a mudança no spec antes de codar.

- [ ] **Step 7: Commit**

```bash
git add aivenda/extensao aivenda/docs
git commit -m "feat(aivenda): spec v2 e diagnostico de alcance ao localhost

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Servidor — eventos (SSE) e catálogo

**Files:** Modify `aivenda/server.js`; Create `aivenda/teste-servidor.js`

- [ ] **Step 1: Escrever o teste que falha**

`aivenda/teste-servidor.js`:

```js
// Testa /objecoes e /eventos sem precisar de browser.
// Requer: node server.js rodando.
const http = require("http");

function req(metodo, caminho, corpo) {
  return new Promise((ok, erro) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({ host: "localhost", port: 3000, path: caminho, method: metodo,
      headers: dados ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dados) } : {} },
      resp => { let t = ""; resp.on("data", c => t += c); resp.on("end", () => ok({ status: resp.statusCode, texto: t })); });
    r.on("error", erro);
    if (dados) r.write(dados);
    r.end();
  });
}

let falhas = 0;
const checa = (n, c, extra) => { console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra))); if (!c) falhas++; };

(async () => {
  // catalogo
  const g1 = await req("GET", "/objecoes");
  const lista = JSON.parse(g1.texto);
  checa("GET /objecoes responde 200", g1.status === 200, g1.status);
  checa("devolve array", Array.isArray(lista));
  checa("vem com as 7 de exemplo na primeira vez", lista.length >= 7, lista.length);

  const nova = lista.concat([{ id: "teste_tmp", nome: "Teste", comoSoa: "x", argumento: "y" }]);
  const p = await req("PUT", "/objecoes", nova);
  checa("PUT /objecoes responde 200", p.status === 200, p.status);
  const g2 = JSON.parse((await req("GET", "/objecoes")).texto);
  checa("persistiu", g2.some(o => o.id === "teste_tmp"));
  await req("PUT", "/objecoes", lista); // restaura
  const g3 = JSON.parse((await req("GET", "/objecoes")).texto);
  checa("restaurou", !g3.some(o => o.id === "teste_tmp"));

  // eventos: abre SSE, publica, confirma que chegou
  const recebidos = [];
  await new Promise((pronto, erro) => {
    const r = http.request({ host: "localhost", port: 3000, path: "/eventos", method: "GET" }, resp => {
      checa("GET /eventos é text/event-stream", /text\/event-stream/.test(resp.headers["content-type"]), resp.headers["content-type"]);
      resp.on("data", c => {
        String(c).split("\n").forEach(l => { if (l.startsWith("data:")) recebidos.push(l.slice(5).trim()); });
        if (recebidos.length >= 1) { r.destroy(); pronto(); }
      });
      setTimeout(() => { try { r.destroy(); } catch (e) {} pronto(); }, 3000);
      req("POST", "/evento", { tipo: "fala", quem: "cliente", texto: "ta caro" });
    });
    r.on("error", e => { if (e.code !== "ECONNRESET") erro(e); else pronto(); });
    r.end();
  });
  checa("o evento publicado chegou no SSE", recebidos.length >= 1, recebidos);
  if (recebidos.length) {
    const ev = JSON.parse(recebidos[0]);
    checa("evento preserva o conteúdo", ev.texto === "ta caro", ev);
  }

  console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
  process.exit(falhas === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd aivenda && node teste-servidor.js`
Expected: FALHA em `/objecoes` (404 hoje).

- [ ] **Step 3: Estender `server.js`**

Adicionar antes do `http.createServer`:

```js
// ---------- catálogo ----------
const ARQ_OBJ = path.join(RAIZ, "objecoes.json");

function lerObjecoes() {
  try { return JSON.parse(fs.readFileSync(ARQ_OBJ, "utf8")); }
  catch (e) {
    // Primeira execução (ou arquivo corrompido): semeia com os 7 exemplos.
    const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");
    fs.writeFileSync(ARQ_OBJ, JSON.stringify(OBJECOES_EXEMPLO, null, 2));
    return OBJECOES_EXEMPLO;
  }
}

// ---------- barramento de eventos ----------
const ouvintes = new Set();

function publicar(evento) {
  const linha = "data: " + JSON.stringify(evento) + "\n\n";
  ouvintes.forEach(res => { try { res.write(linha); } catch (e) { ouvintes.delete(res); } });
}

function abrirSSE(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    // O painel roda em localhost:3000, mas a extensão publica de outra origem.
    "Access-Control-Allow-Origin": "*"
  });
  res.write(": conectado\n\n");
  ouvintes.add(res);
  // Ping periódico: sem tráfego, proxies e o próprio Chrome derrubam a conexão.
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 20000);
  req.on("close", () => { clearInterval(ping); ouvintes.delete(res); });
}

function lerCorpo(req) {
  return new Promise(ok => {
    let c = "";
    req.on("data", p => { c += p; if (c.length > 1e6) req.destroy(); });
    req.on("end", () => ok(c));
  });
}
```

Substituir o `http.createServer(...)` inteiro por:

```js
http.createServer(async (req, res) => {
  // A extensão publica de chrome-extension://, então precisa de CORS.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "POST" && req.url === "/jev") return proxyJev(req, res);

  if (req.method === "GET" && req.url === "/eventos") return abrirSSE(req, res);

  if (req.method === "POST" && req.url === "/evento") {
    const corpo = await lerCorpo(req);
    try { publicar(JSON.parse(corpo)); } catch (e) {}
    res.writeHead(204); return res.end();
  }

  if (req.url === "/objecoes") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(lerObjecoes()));
    }
    if (req.method === "PUT") {
      const corpo = await lerCorpo(req);
      try {
        const lista = JSON.parse(corpo);
        if (!Array.isArray(lista)) throw new Error("esperava um array");
        fs.writeFileSync(ARQ_OBJ, JSON.stringify(lista, null, 2));
        publicar({ tipo: "objecoes", lista });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
  }

  if (req.method === "GET") return servirArquivo(req, res);
  res.writeHead(405); res.end("405");
}).listen(PORTA, () => {
  console.log("\n  Copiloto de Call rodando:  http://localhost:" + PORTA + "\n");
  console.log("  Carregue a extensao em chrome://extensions (modo desenvolvedor).\n");
});
```

Adicionar `objecoes.json` ao `.gitignore` (é dado do usuário, não código).

- [ ] **Step 4: Rodar o teste**

Run: `cd aivenda && node server.js` (em background) e `node teste-servidor.js`
Expected: todas as linhas `ok`, `TUDO OK`.

- [ ] **Step 5: Commit**

```bash
git add aivenda/server.js aivenda/teste-servidor.js aivenda/.gitignore
git commit -m "feat(aivenda): servidor com SSE e catalogo compartilhado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Content script — ligar CC e ler as legendas

O arquivo mais delicado. Três camadas de seletor e os quatro cuidados documentados.

**Files:** Create `extensao/content.js` (parte 1: captura)

- [ ] **Step 1: Escrever `extensao/content.js`**

```js
// Le as legendas do Google Meet e separa quem falou.
// Nao usa Web Speech API: o Chrome so permite UM reconhecedor por vez,
// entao duas trilhas simultaneas sao impossiveis. A legenda do Meet ja
// vem com o nome do falante, que e exatamente o que faltava.

const DEBUG = false;
const log = (...a) => { if (DEBUG) console.log("[COPILOTO]", ...a); };

// jsname e mais estavel que as classes CSS ofuscadas do Meet, mas ainda
// quebra em atualizacao. Por isso as tres camadas.
const SEL = {
  container: "tgaKEf",   // janela das legendas
  bloco: "YSxPC",        // bloco de um falante
  nome: "r4nke",         // span do nome
  texto: "bVV8Bd"        // span do texto
};

const CONFIG_CAP = {
  debounceMs: 700,   // o Meet manda palavra por palavra
  maxLinhas: 40
};

let meuNome = null;
let ultimaCamada = null;
let linhasVistas = 0;

// ---------- quem sou eu ----------
// data-self-name esta no proprio tile de video e nao exige abrir painel nenhum.
function descobrirMeuNome() {
  const tile = document.querySelector("[data-self-name]");
  if (tile) return tile.getAttribute("data-self-name");
  const eu = [...document.querySelectorAll("[data-participant-id]")]
    .map(e => e.textContent || "")
    .find(t => /\(você\)|\(voce\)|\(you\)/i.test(t));
  return eu ? eu.replace(/\((você|voce|you)\)/i, "").trim() : null;
}

// ---------- ligar as legendas ----------
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
  const porJsname = cand.find(e => ["r8qRAd", "Dg9Wp"].includes(e.getAttribute("jsname")) && !e.closest('[role="dialog"]'));
  if (porJsname) return porJsname;
  // 2. o atalho (c) no rotulo e independente de idioma
  const porAtalho = cand.find(e => pareceToggleDeLegenda(e) && /\(c\)/.test(((e.getAttribute("aria-label") || "") + (e.getAttribute("data-tooltip") || "")).toLowerCase()));
  if (porAtalho) return porAtalho;
  // 3. palavra-chave, ja filtrada
  return cand.find(pareceToggleDeLegenda) || null;
}

function legendasLigadas() { return !!acharContainer(); }

async function ligarLegendas() {
  if (legendasLigadas()) return true;
  const bt = acharBotaoCC();
  if (!bt) return false;
  bt.click();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 150));
    if (legendasLigadas()) return true;
  }
  return false;
}

// ---------- achar o container ----------
function acharContainer() {
  const porJsname = document.querySelector(`[jsname="${SEL.container}"]`);
  if (porJsname) { ultimaCamada = "jsname"; return porJsname; }
  // Fallback aria-live. CUIDADO: os anuncios de status do Meet usam a mesma
  // aria-live. So aceitamos se houver bloco com nome de falante dentro.
  const vivos = [...document.querySelectorAll('[aria-live="polite"]')];
  const comFalante = vivos.find(r => r.querySelector(`[jsname="${SEL.nome}"]`) || r.querySelectorAll("div > span").length >= 2);
  if (comFalante) { ultimaCamada = "aria-live"; return comFalante; }
  return null;
}

// ---------- extrair as falas ----------
function lerBlocos(container) {
  let blocos = [...container.querySelectorAll(`[jsname="${SEL.bloco}"]`)];
  if (!blocos.length) {
    // Heuristica estrutural: filho direto que tenha dois textos (nome + fala).
    blocos = [...container.children].filter(c => c.innerText && c.innerText.trim());
    ultimaCamada = ultimaCamada === "jsname" ? "estrutural" : ultimaCamada;
  }
  return blocos.map(b => {
    const nomeEl = b.querySelector(`[jsname="${SEL.nome}"]`);
    const txtEl = b.querySelector(`[jsname="${SEL.texto}"]`);
    let nome = nomeEl ? nomeEl.innerText.trim() : "";
    let texto = txtEl ? txtEl.innerText.trim() : "";
    if (!nome && !texto) {
      const partes = b.innerText.split("\n").map(s => s.trim()).filter(Boolean);
      if (partes.length >= 2) { nome = partes[0]; texto = partes.slice(1).join(" "); }
    }
    return { nome, texto };
  }).filter(x => x.nome && x.texto);
}

// ---------- commit com debounce e dedup por prefixo ----------
const emAndamento = new Map(); // nome -> { texto, timer }
const jaCommitado = new Map(); // nome -> ultimo texto committado

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

  // Bloco sumiu do DOM = o falante terminou. Commita ja.
  [...emAndamento.keys()].forEach(nome => {
    if (!presentes.has(nome)) { clearTimeout(emAndamento.get(nome).timer); commitar(nome, onLinha); }
  });
}

function commitar(nome, onLinha) {
  const atual = emAndamento.get(nome);
  if (!atual) return;
  emAndamento.delete(nome);
  const texto = atual.texto.trim();
  if (!texto) return;
  // Dedup: se o que ja foi committado comeca com este texto, é repeticao.
  const antes = jaCommitado.get(nome) || "";
  if (antes && (antes === texto || antes.startsWith(texto))) return;
  jaCommitado.set(nome, texto);
  linhasVistas++;
  const souEu = meuNome && nome.trim().toLowerCase() === meuNome.trim().toLowerCase();
  log("linha", nome, souEu ? "(voce)" : "(cliente)", texto);
  onLinha({ nome, texto, quem: souEu ? "vendedor" : "cliente" });
}

function observar(onLinha) {
  const alvo = document.body;
  const obs = new MutationObserver(() => aoMudar(onLinha));
  obs.observe(alvo, { childList: true, subtree: true, characterData: true });
  return obs;
}

function diagnostico() {
  return { meuNome, camada: ultimaCamada, linhasVistas, legendasLigadas: legendasLigadas(), achouBotaoCC: !!acharBotaoCC() };
}
```

- [ ] **Step 2: Adicionar o content script ao manifest**

```json
  "content_scripts": [{
    "matches": ["https://meet.google.com/*"],
    "js": ["content.js"],
    "css": ["overlay.css"],
    "run_at": "document_idle"
  }],
```

- [ ] **Step 3: Verificar numa call real (precisa do usuário)**

Abrir um Meet, entrar na call, recarregar a extensão e a aba. No console da aba
(DevTools → Console, filtro `[COPILOTO]`) com `DEBUG = true`, rodar:

```js
diagnostico()
```

Expected: `meuNome` com o seu nome, `camada: "jsname"`, `legendasLigadas: true`, e
`linhasVistas` subindo conforme alguém fala.

**Se `camada` vier `"aria-live"` ou `"estrutural"`:** o Meet mudou os `jsname`. Inspecionar
o texto da legenda no DevTools, subir na árvore, anotar os novos valores e atualizar `SEL`.

- [ ] **Step 4: Commit**

```bash
git add aivenda/extensao/content.js aivenda/extensao/manifest.json
git commit -m "feat(aivenda): leitura das legendas do Meet com separacao de falante

Tres camadas de seletor, filtro dos anuncios de status, botao CC por
atalho (c) e dedup por prefixo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Service worker — a decisão

**Files:** Rewrite `extensao/background.js`; copy `lib/` into `extensao/lib/`

- [ ] **Step 1: Copiar a camada de decisão**

```bash
cd aivenda && mkdir -p extensao/lib && cp lib/decisao.js lib/objecoes-exemplo.js extensao/lib/
```

- [ ] **Step 2: `extensao/background.js`**

```js
// Service worker: recebe a fala do content script, decide com o Jev e
// distribui a decisao para o overlay e para o painel separado.
//
// A chamada sai DAQUI e nao do content script: o content script roda em
// https://meet.google.com e chamar http://localhost de la e mixed content,
// que o Chrome bloqueia EM SILENCIO (o fetch pendura ate o timeout).

importScripts("lib/decisao.js", "lib/objecoes-exemplo.js");

const SERVIDOR = "http://localhost:3000";

let objecoes = OBJECOES_EXEMPLO;
let falas = [];
let ultimaMostrada = null;
let seq = 0;

async function carregarObjecoes() {
  try {
    const r = await fetch(SERVIDOR + "/objecoes");
    const lista = await r.json();
    if (Array.isArray(lista) && lista.length) objecoes = lista;
  } catch (e) { /* servidor fora: fica com os exemplos embutidos */ }
}
carregarObjecoes();

async function publicar(evento) {
  try {
    await fetch(SERVIDOR + "/evento", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento)
    });
  } catch (e) { /* painel separado offline, o overlay continua */ }
}

async function decidir(linha, tabId) {
  const meu = ++seq;
  falas.push({ quem: linha.quem, fala: linha.texto });
  if (falas.length > 40) falas = falas.slice(-40);
  publicar({ tipo: "fala", quem: linha.quem, nome: linha.nome, texto: linha.texto });

  // So a fala do cliente decide.
  if (linha.quem !== "cliente") return;

  const t0 = Date.now();
  let json;
  try {
    const r = await fetch(SERVIDOR + "/jev", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.modelo,
        state: montarState(falas, linha.texto),
        questions: montarPerguntas(objecoes)
      })
    });
    json = await r.json();
    if (!r.ok) throw new Error(json.error || ("HTTP " + r.status));
  } catch (e) {
    publicar({ tipo: "erro", mensagem: "Falha ao falar com o Jev: " + e.message });
    return;
  }
  const ms = Date.now() - t0;

  // Chegou fala mais nova enquanto esta chamada estava no ar.
  if (meu < seq) return;

  const d = aplicarRegra(json, objecoes, ultimaMostrada);
  if (d.acao === "card") ultimaMostrada = d.escolha;

  const evento = {
    tipo: "decisao", acao: d.acao, fase: d.fase, confianca: d.confianca,
    temObjecao: d.temObjecao, escolha: d.escolha, objecao: d.objecao || null,
    falaCliente: linha.texto, ms, custo: calcularCusto(json.usage)
  };
  publicar(evento);
  if (tabId != null) chrome.tabs.sendMessage(tabId, evento).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.tipo === "linha") decidir(msg, sender.tab?.id);
  if (msg?.tipo === "recarregar-objecoes") carregarObjecoes();
  if (msg?.tipo === "zerar") { falas = []; ultimaMostrada = null; }
});
```

- [ ] **Step 3: Ligar o content script ao service worker**

No fim de `content.js`:

```js
(async () => {
  meuNome = descobrirMeuNome();
  await ligarLegendas();
  if (!meuNome) {
    // Sem saber quem e voce, tudo viraria "cliente" e o card dispararia
    // com a sua propria fala. Melhor tentar de novo do que mentir.
    const t = setInterval(() => { meuNome = descobrirMeuNome(); if (meuNome) clearInterval(t); }, 2000);
  }
  observar(linha => chrome.runtime.sendMessage({ tipo: "linha", ...linha }));
})();
```

- [ ] **Step 4: Verificar**

Com o servidor de pé e numa call real, alguém fala uma objeção. No DevTools do service
worker, esperar ver a decisão. No terminal do servidor, nenhum erro.

- [ ] **Step 5: Commit**

```bash
git add aivenda/extensao
git commit -m "feat(aivenda): service worker decide com o Jev e distribui

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Overlay no Meet

**Files:** Create `extensao/overlay.css`; append to `extensao/content.js`

- [ ] **Step 1: `extensao/overlay.css`**

```css
#copiloto-overlay {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 380px; max-height: 78vh; overflow: hidden;
  background: #14181d; color: #e8edf2; border: 1px solid #232a32;
  border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.55);
  font: 14px/1.5 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  display: flex; flex-direction: column;
}
#copiloto-overlay.recolhido .cp-corpo { display: none; }
.cp-topo { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid #232a32; cursor: move; user-select: none; }
.cp-topo b { font-size: 13px; font-weight: 650; }
.cp-luz { width: 7px; height: 7px; border-radius: 50%; background: #5b6673; }
.cp-luz.viva { background: #35d07f; box-shadow: 0 0 7px #35d07f; }
.cp-topo .cp-bt { margin-left: auto; background: none; border: 0; color: #8b97a5;
  cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; }
.cp-fases { display: flex; gap: 3px; padding: 8px 12px; border-bottom: 1px solid #232a32; }
.cp-fase { flex: 1; text-align: center; font-size: 9.5px; padding: 4px 2px; border-radius: 5px;
  background: #0b0d10; color: #5b6673; text-transform: uppercase; letter-spacing: .04em; }
.cp-fase.ativa { background: #10243a; color: #4da3ff; }
.cp-corpo { padding: 14px 16px; overflow-y: auto; }
.cp-vazio { color: #5b6673; font-size: 13px; text-align: center; padding: 22px 0; }
.cp-card { border-left: 3px solid #4da3ff; padding-left: 12px; animation: cpEntra .2s ease-out; }
.cp-card.neutro { border-left-color: #ffb340; }
@keyframes cpEntra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cp-rot { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #4da3ff; font-weight: 650; }
.cp-card.neutro .cp-rot { color: #ffb340; }
.cp-nome { font-size: 21px; font-weight: 680; margin: 5px 0 10px; letter-spacing: -.01em; }
.cp-arg { font-size: 15px; line-height: 1.55; color: #f2f6fa; }
.cp-fala { font-size: 14px; color: #8b97a5; font-style: italic; }
.cp-pe { margin-top: 12px; padding-top: 9px; border-top: 1px solid #232a32;
  display: flex; gap: 14px; font-size: 11px; color: #5b6673; }
.cp-pe b { color: #8b97a5; }
.cp-hist { padding: 9px 16px; border-top: 1px solid #232a32; display: flex; flex-wrap: wrap; gap: 5px; }
.cp-hist span { font-size: 11px; color: #8b97a5; background: #0b0d10;
  border: 1px solid #232a32; border-radius: 20px; padding: 2px 9px; }
```

- [ ] **Step 2: Adicionar ao fim de `content.js`**

```js
// ---------- overlay ----------
const FASES_NOME = { abertura: "Abertura", diagnostico_dor: "Dor", apresentacao: "Pitch", objecao: "Objeção", fechamento: "Fecho" };
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

  d.querySelector(".cp-bt").onclick = () => d.classList.toggle("recolhido");
  arrastavel(d, d.querySelector(".cp-topo"));

  const f = d.querySelector(".cp-fases");
  Object.entries(FASES_NOME).forEach(([id, nome]) => {
    const e = document.createElement("div");
    e.className = "cp-fase"; e.dataset.fase = id; e.textContent = nome;
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
    caixa.style.left = (e.clientX - ox) + "px";
    caixa.style.top = (e.clientY - oy) + "px";
    caixa.style.right = "auto";
  });
  document.addEventListener("mouseup", () => { arrastando = false; });
}

function pintarFase(fase) {
  if (!elOverlay || !fase) return;
  elOverlay.querySelectorAll(".cp-fase").forEach(e => e.classList.toggle("ativa", e.dataset.fase === fase));
}

function pintarDecisao(ev) {
  if (!elOverlay) return;
  pintarFase(ev.fase);
  const corpo = elOverlay.querySelector(".cp-corpo");

  if (ev.acao === "card" && ev.objecao) {
    corpo.innerHTML = '<div class="cp-card"><div class="cp-rot">Quebrar objeção</div>' +
      '<div class="cp-nome"></div><div class="cp-arg"></div>' +
      '<div class="cp-pe"><span>confiança <b></b></span><span><b></b></span></div></div>';
    corpo.querySelector(".cp-nome").textContent = ev.objecao.nome;
    corpo.querySelector(".cp-arg").textContent = ev.objecao.argumento;
    const b = corpo.querySelectorAll(".cp-pe b");
    b[0].textContent = Math.round(ev.confianca * 100) + "%";
    b[1].textContent = ev.ms + " ms";
    const h = elOverlay.querySelector(".cp-hist");
    const s = document.createElement("span"); s.textContent = ev.objecao.nome; h.appendChild(s);
  } else if (ev.acao === "alerta") {
    corpo.innerHTML = '<div class="cp-card neutro"><div class="cp-rot">Objeção não catalogada</div>' +
      '<div class="cp-nome">Sem argumento pronto</div><div class="cp-fala"></div>' +
      '<div class="cp-pe"><span><b></b></span></div></div>';
    corpo.querySelector(".cp-fala").textContent = '"' + ev.falaCliente + '"';
    corpo.querySelector(".cp-pe b").textContent = ev.ms + " ms";
  }
}

chrome.runtime.onMessage.addListener(ev => { if (ev?.tipo === "decisao") pintarDecisao(ev); });

montarOverlay();
setInterval(() => {
  const luz = elOverlay && elOverlay.querySelector(".cp-luz");
  if (luz) luz.classList.toggle("viva", legendasLigadas());
}, 1500);
```

- [ ] **Step 3: Verificar numa call e commitar**

O overlay aparece no canto, a luz fica verde quando as legendas estão ativas, arrasta
pelo topo e recolhe no `—`. Quando o cliente objeta, o card aparece.

```bash
git add aivenda/extensao
git commit -m "feat(aivenda): overlay do copiloto dentro do Meet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Painel separado passa a ouvir o SSE

**Files:** Modify `aivenda/index.html`; delete `aivenda/audio.js`

- [ ] **Step 1: Trocar o bloco de decisão do `index.html`**

Remover `<script src="audio.js">`, as funções `comecar`/`parar`/`decidir` e o botão
"Começar a ouvir". No lugar, o painel só escuta:

```js
// O painel nao decide nada: o service worker decide e publica aqui.
// Assim as duas telas nunca divergem.
const fonte = new EventSource("/eventos");

fonte.onopen = () => { limparAviso(); luz("voce", "ouvindo"); luz("cliente", "ouvindo"); };
fonte.onerror = () => { mostrarAviso("Perdi a conexão com o servidor. Reconectando…"); luz("voce", "parada"); luz("cliente", "parada"); };

fonte.onmessage = ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }

  if (m.tipo === "fala") {
    escreverFala(m.quem === "vendedor" ? "voce" : "cliente", m.texto, false);
  }

  if (m.tipo === "objecoes") { objecoes = m.lista; desenharObjecoes(); }

  if (m.tipo === "erro") mostrarAviso(m.mensagem);

  if (m.tipo === "decisao") {
    latencias.push(m.ms); decisoes++; custoTotal += m.custo || 0;
    atualizarRodape();
    if (m.fase) desenharFases(m.fase);
    if (m.acao === "card" && m.objecao) {
      mostrarCard({ objecao: m.objecao, confianca: m.confianca }, m.ms);
      somarHistorico(m.objecao.nome);
    } else if (m.acao === "alerta") {
      mostrarAlerta(m.falaCliente, { temObjecao: m.temObjecao }, m.ms);
    }
  }
};
```

E o catálogo passa a vir do servidor:

```js
async function carregarObjecoes() {
  try {
    const r = await fetch("/objecoes");
    const lista = await r.json();
    if (Array.isArray(lista) && lista.length) return lista;
  } catch (e) {}
  return JSON.parse(JSON.stringify(OBJECOES_EXEMPLO));
}
async function salvarObjecoes() {
  try {
    await fetch("/objecoes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(objecoes) });
  } catch (e) { mostrarAviso("Não consegui salvar no servidor."); }
}
```

Trocar o `#palco` inicial pelo texto de espera:

```html
<div id="palco"><div class="vazio"><div class="grande">Aguardando a call.</div>Entre no Meet com a extensão ativa. O card aparece aqui.</div></div>
```

- [ ] **Step 2: Apagar o audio.js**

```bash
git rm aivenda/audio.js
```

- [ ] **Step 3: Verificar**

Com o servidor rodando, abrir `http://localhost:3000` e, noutro terminal:

```bash
curl -s -X POST http://localhost:3000/evento -H "Content-Type: application/json" \
  -d '{"tipo":"decisao","acao":"card","fase":"objecao","confianca":1,"ms":320,"custo":0.000044,"objecao":{"nome":"Tá caro","argumento":"Teste de argumento."}}'
```

Expected: o card "Tá caro" aparece na página **sem recarregar**, a fase acende em
"Objeção" e o rodapé vai para 1 decisão.

- [ ] **Step 4: Commit**

```bash
git add aivenda/index.html && git rm aivenda/audio.js
git commit -m "feat(aivenda): painel recebe por SSE, sai a Web Speech API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Verificação fim a fim numa call real

- [ ] **Step 1: Suíte offline**

Run: `cd aivenda && node teste-decisao.js && node teste-servidor.js`
Expected: `TUDO OK` nas duas.

- [ ] **Step 2: Gabarito contra o modelo**

Run: `cd aivenda && node teste.js`
Expected: 18/20 ou melhor, latência média abaixo de 500 ms.

- [ ] **Step 3: Call real**

Entrar num Meet com outra pessoa (ou um celular na mesma call). Verificar:
- overlay aparece, luz verde
- a fala da outra pessoa vai para "Cliente" e a sua para "Você" — **esta é a
  verificação que falhou na v1, é a que importa**
- ao dizer "achei caro", o card "Tá caro" aparece em menos de 1 s nas duas telas
- o painel em localhost mostra a mesma coisa

- [ ] **Step 4: Relatar honestamente**

Dizer qual camada de seletor pegou (`diagnostico()`), quantas linhas vieram, a latência
real e se a separação de falante funcionou. Se a camada não foi `jsname`, dizer que o
Meet mudou e os seletores precisam ser atualizados.

---

## Self-Review

**Cobertura do spec:** §2 arquitetura → T3,T4 · §4 seletores e 4 armadilhas → T3 ·
§5 service worker e mixed content → T1,T4 · §6 catálogo no servidor → T2,T6 ·
§7 duas superfícies → T5,T6 · §8 regra inalterada → reusa `aplicarRegra` · §10 riscos → T1 gate, T3 Step 3, T7 Step 4.

**Consistência de tipos entre tarefas:**
- Linha de legenda `{ nome, texto, quem }` — T3 `commitar` produz, T4 `decidir` consome.
- Evento `{ tipo, acao, fase, confianca, temObjecao, escolha, objecao, falaCliente, ms, custo }` — T4 publica, T5 `pintarDecisao` e T6 `onmessage` consomem. Campos batem.
- `aplicarRegra(resposta, objecoes, ultimaMostrada)` e `acao ∈ {card, alerta, esperar, repetida, nada}` — inalterados da v1, já cobertos pelos 36 testes.
- `mostrarCard(d, ms)` espera `{objecao, confianca}`; T6 passa exatamente isso.

**Placeholders:** nenhum.
