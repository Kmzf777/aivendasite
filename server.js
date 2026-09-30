// Servidor local. Node puro, zero dependências.
//   - serve os arquivos estáticos da pasta
//   - POST /jev       -> repassa para a TypeSafe injetando a chave
//   - POST /evento    -> a extensão publica uma fala/decisão
//   - GET  /eventos   -> SSE: o painel separado escuta
//   - GET/PUT /objecoes -> catálogo compartilhado entre extensão e painel
//
// A chave fica só aqui. O browser nunca a vê.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORTA = process.env.PORT || 3000;
const RAIZ = __dirname;

// ---------- .env ----------
function carregarEnv() {
  const arquivo = path.join(RAIZ, ".env");
  if (!fs.existsSync(arquivo)) return {};
  const env = {};
  fs.readFileSync(arquivo, "utf8").split("\n").forEach(linha => {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) return;
    const i = limpa.indexOf("=");
    if (i < 1) return;
    // Aspas são opcionais no .env; tira se estiverem lá.
    env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  });
  return env;
}

const env = carregarEnv();
const CHAVE = env.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY;

if (!CHAVE) {
  console.error("\n  Falta a TYPESAFE_API_KEY.\n");
  console.error("  1. cp .env.example .env");
  console.error("  2. cole sua chave no .env");
  console.error("  3. node server.js\n");
  process.exit(1);
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// ---------- proxy do Jev ----------
function proxyJev(req, res) {
  let corpo = "";
  req.on("data", c => {
    corpo += c;
    // Jev aceita ~32k tokens; 1MB de JSON é erro nosso, não uso legítimo.
    if (corpo.length > 1e6) { req.destroy(); }
  });
  req.on("end", () => {
    const opcoes = {
      hostname: "api.typesafe.ai",
      path: "/v1/systemone",
      method: "POST",
      headers: {
        "Authorization": "Bearer " + CHAVE,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(corpo)
      }
    };
    const upstream = https.request(opcoes, r => {
      let resp = "";
      r.on("data", c => { resp += c; });
      r.on("end", () => {
        if (r.statusCode !== 200) console.error("  Jev " + r.statusCode + ": " + resp.slice(0, 300));
        res.writeHead(r.statusCode, { "Content-Type": "application/json; charset=utf-8" });
        res.end(resp);
      });
    });
    upstream.on("error", e => {
      console.error("  Erro de rede ao chamar o Jev: " + e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "falha ao falar com a TypeSafe: " + e.message }));
    });
    upstream.end(corpo);
  });
}

// ---------- catálogo ----------
const ARQ_OBJ = path.join(RAIZ, "objecoes.json");

function lerObjecoes() {
  try {
    const lista = JSON.parse(fs.readFileSync(ARQ_OBJ, "utf8"));
    if (Array.isArray(lista)) return lista;
    throw new Error("nao e array");
  } catch (e) {
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
    "Access-Control-Allow-Origin": "*"
  });
  res.write(": conectado\n\n");
  ouvintes.add(res);
  // Ping periódico: sem tráfego a conexão cai sozinha.
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

// ---------- estáticos ----------
function servirArquivo(req, res) {
  const urlLimpa = decodeURIComponent(req.url.split("?")[0]);
  const relativo = urlLimpa === "/" ? "index.html" : urlLimpa.replace(/^\/+/, "");
  const destino = path.join(RAIZ, relativo);

  // Impede ../ sair da pasta do projeto.
  if (!destino.startsWith(RAIZ)) { res.writeHead(403); return res.end("403"); }
  // .env está na raiz servida: nunca entregar, por mais que peçam.
  if (path.basename(destino) === ".env") { res.writeHead(403); return res.end("403"); }

  fs.readFile(destino, (erro, dados) => {
    if (erro) { res.writeHead(404); return res.end("404 " + relativo); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(destino)] || "application/octet-stream" });
    res.end(dados);
  });
}

// ---------- log ----------
// O header Origin denuncia quem chamou: a extensão (chrome-extension://)
// ou a própria página. Útil para diagnosticar sem abrir DevTools.
function logar(req) {
  if (req.url === "/eventos") return; // conexão longa, loga só uma vez abaixo
  const origem = req.headers.origin || "";
  const quem = origem.startsWith("chrome-extension://") ? "EXTENSAO" :
               origem.startsWith("http://localhost") ? "pagina" : (origem || "-");
  console.log(`  ${new Date().toISOString().slice(11, 19)}  ${req.method} ${req.url}  <- ${quem}`);
}

http.createServer(async (req, res) => {
  logar(req);
  // A extensão chama de outra origem: sem CORS o Chrome barra a resposta.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "POST" && req.url === "/jev") return proxyJev(req, res);

  if (req.method === "GET" && req.url === "/eventos") {
    console.log(`  ${new Date().toISOString().slice(11, 19)}  SSE aberto (${ouvintes.size + 1} ouvinte[s])`);
    return abrirSSE(req, res);
  }

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
  console.log("  Carregue a extensao em chrome://extensions (modo desenvolvedor)");
  console.log("  e entre numa call do Meet. O painel abre em localhost:" + PORTA + ".\n");
});
