import { publicar } from "@/lib/barramento";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };

export async function POST(req: Request) {
  try { publicar(await req.json()); } catch {}
  return new Response(null, { status: 204, headers: cors });
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
