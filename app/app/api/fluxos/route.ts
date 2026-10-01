import fs from "node:fs";
import path from "node:path";

// Os fluxos moram em fluxos/*.json, ao lado de objecoes.json: são dados do
// projeto, não do app. O cwd do Next é a pasta app/, por isso o ".." — é a
// mesma conta que lib/servidor.ts faz para achar o catálogo.
const PASTA = path.join(process.cwd(), "..", "fluxos");

// Sem isto o GET pode ser prerenderizado no build e congelar a lista que
// existia naquele instante: editar um JSON no disco (ou criar a pasta)
// nunca mais apareceria na tela.
export const dynamic = "force-dynamic";

// O que atravessa a rede é o tipo Fluxo do motor mais o objetivo, que é só
// para o vendedor ler no botão. Campo novo no JSON NÃO passa sozinho: se o
// motor começar a usar um, acrescente aqui. É de propósito — `notas` é
// diário de bordo de quem editou o fluxo e só pesaria no download.
function lerFluxos(): unknown[] {
  let arquivos: string[];
  try {
    arquivos = fs.readdirSync(PASTA).filter((n) => n.endsWith(".json")).sort();
  } catch {
    // Pasta ausente não é erro de servidor. Sem fluxo o copiloto ainda roda,
    // só sem dica de etapa; um 500 aqui derrubaria o card de objeção junto.
    return [];
  }

  const fluxos: unknown[] = [];
  for (const nome of arquivos) {
    let f: {
      id?: unknown;
      nome?: unknown;
      objetivo?: unknown;
      etapas?: unknown;
      acoes?: unknown;
    };
    try {
      f = JSON.parse(fs.readFileSync(path.join(PASTA, nome), "utf8"));
    } catch {
      // JSON quebrado cai fora em silêncio de propósito: o portão para isso é
      // `node valida-fluxo.js`, que roda antes de subir. Aqui, com o vendedor
      // a um clique de discar, parar a rota por causa de um arquivo não ajuda.
      continue;
    }
    // Fluxo sem id ou sem etapas viraria um botão que não faz nada:
    // definirFluxo() o recusa calado. Melhor não oferecer.
    if (!f || typeof f.id !== "string" || !Array.isArray(f.etapas) || !f.etapas.length) continue;
    fluxos.push({ id: f.id, nome: f.nome, objetivo: f.objetivo, etapas: f.etapas, acoes: f.acoes });
  }
  return fluxos;
}

export async function GET() {
  // Array puro, na mesma forma do GET de /api/objecoes: o hook que consome
  // os dois é o mesmo molde.
  return Response.json(lerFluxos());
}
