// Estava inline dentro de opcoes.html e nunca rodava: a CSP padrao do MV3
// para paginas de extensao e "script-src 'self'", sem 'unsafe-inline', e nao
// da para afrouxar. Resultado: a luz do servidor ficava em "verificando..."
// para sempre. Arquivo separado resolve.

const SERVIDOR = "http://localhost:3000";

(async () => {
  const luz = document.getElementById("luz");
  const estado = document.getElementById("estado");
  const detalhe = document.getElementById("detalhe");
  try {
    const r = await fetch(SERVIDOR + "/objecoes");
    const lista = await r.json();
    if (!Array.isArray(lista)) throw new Error("resposta nao e uma lista");
    luz.className = "luz ok";
    estado.textContent = "Conectado";
    detalhe.textContent = lista.length + " objeç" + (lista.length === 1 ? "ão" : "ões") + " no catálogo.";
  } catch (e) {
    luz.className = "luz ruim";
    estado.textContent = "Servidor fora do ar";
    detalhe.innerHTML = 'Rode <code>node server.js</code> na pasta <code>aivenda</code>. Sem ele o overlay cai nas 7 objeções de exemplo e o painel não abre.';
  }
})();
