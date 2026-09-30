// Servidor local. Node puro, zero dependências.
//   - serve os arquivos estáticos da pasta
//   - POST /jev  -> repassa para a TypeSafe injetando a chave
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

// ---------- proxy ----------
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

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
        if (r.statusCode !== 200) console.error("Jev " + r.statusCode + ": " + resp.slice(0, 300));
        res.writeHead(r.statusCode, { "Content-Type": "application/json; charset=utf-8" });
        res.end(resp);
      });
    });
    upstream.on("error", e => {
      console.error("Erro de rede ao chamar o Jev: " + e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "falha ao falar com a TypeSafe: " + e.message }));
    });
    upstream.end(corpo);
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

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/jev") return proxyJev(req, res);
  if (req.method === "GET") return servirArquivo(req, res);
  res.writeHead(405); res.end("405");
}).listen(PORTA, () => {
  console.log("\n  Copiloto de Call rodando:  http://localhost:" + PORTA + "\n");
  console.log("  Use o Chrome 139 ou mais novo. Fone de ouvido é recomendado.\n");
});
