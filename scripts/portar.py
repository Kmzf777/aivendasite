"""Gera as copias ESM de app/lib/ a partir dos originais CommonJS de lib/.

   python scripts/portar.py

Portar na mao e o que faz duas copias divergirem. Aqui o porte e mecanico:
muda so o formato de modulo (require -> import, module.exports -> export) e o
corpo fica identico, que e exatamente o que teste-paridade.js cobra.

Rode isto sempre que mexer num arquivo de lib/.
"""

import io
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

MODULOS = ["decisao", "atribuir", "fluxo", "dicas", "colheita", "copiloto"]

CABECALHO = (
    "// PORTADO de ../lib/%s.js — mesma logica, so o formato de modulo muda.\n"
    "// A versao CommonJS da raiz continua servindo os testes offline; se mexer\n"
    "// numa, mexa na outra (teste-paridade.js compara as duas).\n\n"
)

# const { a, b } = require("./x.js");  ->  import { a, b } from "./x.js";
RE_DESESTRUTURA = re.compile(
    r'^const\s*\{([^}]*)\}\s*=\s*require\(\s*["\']([^"\']+)["\']\s*\);?\s*$', re.M)
# const F = require("./x.js");  ->  import * as F from "./x.js";
RE_NOMEADO = re.compile(
    r'^const\s+(\w+)\s*=\s*require\(\s*["\']([^"\']+)["\']\s*\);?\s*$', re.M)
# o rodape CommonJS inteiro
RE_RODAPE = re.compile(
    r'\nif \(typeof module !== "undefined" && module\.exports\) \{\s*'
    r'module\.exports = \{([\s\S]*?)\};\s*\}\s*$', re.M)


def portar(nome):
    origem = os.path.join(RAIZ, "lib", nome + ".js")
    destino = os.path.join(RAIZ, "app", "lib", nome + ".js")
    s = io.open(origem, encoding="utf-8").read()

    s = RE_DESESTRUTURA.sub(lambda m: 'import {%s} from "%s";' % (m.group(1), m.group(2)), s)
    s = RE_NOMEADO.sub(lambda m: 'import * as %s from "%s";' % (m.group(1), m.group(2)), s)

    m = RE_RODAPE.search(s)
    if not m:
        return nome, "sem rodape CommonJS reconhecivel"
    nomes = " ".join(m.group(1).split())
    # Espacos dentro das chaves e UMA linha em branco antes: e o formato que ja
    # estava commitado nos gemeos. Gerar diferente nao quebra nada (o
    # teste-paridade colapsa espaco), mas suja o diff de todo arquivo de lib/
    # na primeira vez que alguem roda este script.
    s = s[:m.start()] + "\nexport { " + nomes.rstrip(",") + " };\n"

    io.open(destino, "w", encoding="utf-8").write(CABECALHO % nome + s)
    return nome, None


def main():
    os.makedirs(os.path.join(RAIZ, "app", "lib"), exist_ok=True)
    ruins = 0
    for nome in MODULOS:
        n, erro = portar(nome)
        if erro:
            ruins += 1
            print("FALHA %-10s %s" % (n, erro))
        else:
            print("ok    %-10s -> app/lib/%s.js" % (n, n))
    raise SystemExit(1 if ruins else 0)


if __name__ == "__main__":
    main()
