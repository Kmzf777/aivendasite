"""Marca as etapas de plano B como dispensaveis quando a ligacao ja ganhou o
que elas buscam.

saida_a (pedir para ela encaminhar) e saida_b (pegar o whats da loja) so
existem porque o caminho principal falhou. Se o telefone do dono ja apareceu
na conversa, cobrar as duas e dica errada -- e dica errada queima o painel
mais rapido que painel vazio.

   python scripts/marcar-plano-b.py
"""

import io
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

PULA = {
    "saida_a": ["telefone_citado"],
    "saida_b": ["telefone_citado"],
}


def main():
    p = os.path.join(RAIZ, "fluxos", "prospeccao.json")
    d = json.load(io.open(p, encoding="utf-8"))

    n = 0
    for e in d["etapas"]:
        if e["id"] in PULA:
            e["pula_se"] = PULA[e["id"]]
            n += 1

    io.open(p, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))
    print("etapas marcadas como dispensaveis: %d" % n)
    for e in d["etapas"]:
        print("  %-20s exige %d  pula_se: %s"
              % (e["id"], len(e.get("exige", [])), e.get("pula_se") or "-"))


if __name__ == "__main__":
    main()
