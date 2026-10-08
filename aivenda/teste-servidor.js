// Testa /objecoes e /eventos sem precisar de browser.
// Requer: node server.js rodando.
const http = require("http");

function req(metodo, caminho, corpo) {
  return new Promise((ok, erro) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({
      host: "localhost", port: 3000, path: caminho, method: metodo,
      headers: dados ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dados) } : {}
    }, resp => {
      let t = "";
      resp.on("data", c => t += c);
      resp.on("end", () => ok({ status: resp.statusCode, texto: t, headers: resp.headers }));
    });
    r.on("error", erro);
    if (dados) r.write(dados);
    r.end();
  });
}

let falhas = 0;
const checa = (n, c, extra) => {
  console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra)));
  if (!c) falhas++;
};

(async () => {
  console.log("\ncatalogo");
  const g1 = await req("GET", "/objecoes");
  checa("GET /objecoes responde 200", g1.status === 200, g1.status);
  const lista = JSON.parse(g1.texto);
  checa("devolve array", Array.isArray(lista));
  checa("vem com as 7 de exemplo", lista.length >= 7, lista.length);
  checa("cada objecao tem id/nome/comoSoa/argumento",
    lista.every(o => o.id && o.nome && o.comoSoa && o.argumento));

  const nova = lista.concat([{ id: "teste_tmp", nome: "Teste", comoSoa: "x", argumento: "y" }]);
  const p = await req("PUT", "/objecoes", nova);
  checa("PUT /objecoes responde 200", p.status === 200, p.status);
  const g2 = JSON.parse((await req("GET", "/objecoes")).texto);
  checa("persistiu no disco", g2.some(o => o.id === "teste_tmp"));

  const ruim = await req("PUT", "/objecoes", { nao: "array" });
  checa("PUT recusa o que nao e array", ruim.status === 400, ruim.status);

  await req("PUT", "/objecoes", lista);
  const g3 = JSON.parse((await req("GET", "/objecoes")).texto);
  checa("restaurou o catalogo original", !g3.some(o => o.id === "teste_tmp"));

  console.log("\neventos (SSE)");
  const recebidos = [];
  let tipoConteudo = null;
  await new Promise(pronto => {
    const r = http.request({ host: "localhost", port: 3000, path: "/eventos", method: "GET" }, resp => {
      tipoConteudo = resp.headers["content-type"];
      resp.on("data", c => {
        String(c).split("\n").forEach(l => { if (l.startsWith("data:")) recebidos.push(l.slice(5).trim()); });
        if (recebidos.length >= 2) { r.destroy(); pronto(); }
      });
      // publica depois que o SSE ja esta aberto
      setTimeout(() => {
        req("POST", "/evento", { tipo: "fala", quem: "cliente", texto: "ta caro" });
        req("POST", "/evento", { tipo: "decisao", acao: "card", ms: 320 });
      }, 120);
      setTimeout(() => { try { r.destroy(); } catch (e) {} pronto(); }, 3000);
    });
    r.on("error", () => pronto());
    r.end();
  });

  checa("GET /eventos e text/event-stream", /text\/event-stream/.test(tipoConteudo || ""), tipoConteudo);
  checa("os eventos publicados chegaram", recebidos.length >= 2, recebidos.length);
  if (recebidos.length >= 2) {
    const a = JSON.parse(recebidos[0]), b = JSON.parse(recebidos[1]);
    checa("preserva o conteudo da fala", a.texto === "ta caro", a);
    checa("preserva a decisao", b.acao === "card" && b.ms === 320, b);
    checa("mantem a ordem", a.tipo === "fala" && b.tipo === "decisao");
  }

  console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
  process.exit(falhas === 0 ? 0 : 1);
})();
