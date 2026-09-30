import { chave } from "@/lib/servidor";

// Proxy do Jev. A chave fica aqui e nunca chega ao browser nem a extensao.
export async function POST(req: Request) {
  const k = chave();
  if (!k) {
    return Response.json({ error: "Falta a TYPESAFE_API_KEY no .env da pasta aivenda." }, { status: 500 });
  }
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return Response.json({ error: "corpo invalido" }, { status: 400 }); }

  try {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: "Bearer " + k, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const txt = await r.text();
    return new Response(txt, { status: r.status, headers: cors({ "Content-Type": "application/json; charset=utf-8" }) });
  } catch (e) {
    return Response.json({ error: "falha ao falar com a TypeSafe: " + (e as Error).message }, { status: 502 });
  }
}

export async function OPTIONS() { return new Response(null, { status: 204, headers: cors() }); }

// A extensao chama de chrome-extension://, que e outra origem.
function cors(extra: Record<string, string> = {}) {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", ...extra };
}
