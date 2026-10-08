// Garante que a copia ESM do app nao divergiu do CommonJS da raiz.
// Duas copias do mesmo codigo sempre divergem; este teste faz isso doer cedo.
const fs = require("fs"), path = require("path");

let falhas = 0;
const checa = (n, c, extra) => {
  console.log((c ? "  ok   " : "  FALHA") + " " + n + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra)));
  if (!c) falhas++;
};

function corpo(txt) {
  return txt.replace(/\r\n/g, "\n")
    .replace(/^\/\/.*$/gm, "")                        // comentarios de linha
    .replace(/\nif \(typeof module[\s\S]*?\n\}\n?/, "\n")  // rodape CJS
    .replace(/\nexport \{[^}]*\};?\n?/, "\n")              // rodape ESM
    .replace(/\s+/g, " ").trim();
}

console.log("\nparidade entre lib/ (CommonJS) e app/lib/ (ESM)");
for (const nome of ["decisao", "atribuir"]) {
  const raiz = fs.readFileSync(path.join(__dirname, "lib", nome + ".js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "app", "lib", nome + ".js"), "utf8");
  checa(nome + ".js tem o mesmo corpo nos dois lugares", corpo(raiz) === corpo(app));
}
const wRaiz = fs.readFileSync(path.join(__dirname, "worklet-energia.js"), "utf8");
const wApp = fs.readFileSync(path.join(__dirname, "app", "public", "worklet-energia.js"), "utf8");
checa("worklet-energia.js idêntico em public/", corpo(wRaiz) === corpo(wApp));

console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
process.exit(falhas === 0 ? 0 : 1);
