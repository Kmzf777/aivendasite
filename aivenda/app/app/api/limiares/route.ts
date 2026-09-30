import { lerLimiares } from "@/lib/servidor";

// Separado de /api/objecoes de proposito: aquele GET precisa continuar
// devolvendo um ARRAY PURO, porque a extensao do Chrome o consome e
// quebraria com envelope.
const cors = { "Access-Control-Allow-Origin": "*" };

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(lerLimiares(), { headers: cors });
}
