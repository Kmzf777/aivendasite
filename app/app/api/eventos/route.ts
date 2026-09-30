import { assinar } from "@/lib/barramento";

export const dynamic = "force-dynamic";   // SSE nunca pode ser cacheado

export async function GET() {
  const enc = new TextEncoder();
  let solta: (() => void) | null = null;

  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(": conectado\n\n"));
      const desassinar = assinar(ev => {
        try { c.enqueue(enc.encode("data: " + JSON.stringify(ev) + "\n\n")); } catch {}
      });
      // Sem trafego a conexao cai sozinha; o ping segura.
      const ping = setInterval(() => {
        try { c.enqueue(enc.encode(": ping\n\n")); } catch {}
      }, 20000);
      solta = () => { clearInterval(ping); desassinar(); };
    },
    cancel() { solta?.(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
