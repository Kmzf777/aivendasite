import { lerObjecoes, gravarObjecoes, lerLimiares, gravarLimiares } from "@/lib/servidor";
import { publicar } from "@/lib/barramento";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };

export async function GET() {
  // A extensao espera um array puro aqui: nao envelope a resposta.
  return Response.json(lerObjecoes(), { headers: cors });
}

export async function PUT(req: Request) {
  let corpo: any;
  try { corpo = await req.json(); } catch { return Response.json({ error: "JSON invalido" }, { status: 400, headers: cors }); }

  // Aceita os dois formatos: array puro (compatibilidade) ou {lista, limiares}.
  const lista = Array.isArray(corpo) ? corpo : corpo?.lista;
  if (!Array.isArray(lista)) return Response.json({ error: "esperava um array" }, { status: 400, headers: cors });

  gravarObjecoes(lista);
  if (corpo?.limiares) gravarLimiares(corpo.limiares);
  publicar({ tipo: "objecoes", lista });
  return Response.json({ ok: true, limiares: lerLimiares() }, { headers: cors });
}

export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
