import fs from "node:fs";
import path from "node:path";
import type { LeadDoPoco } from "@/lib/leadsExemplo";

/**
 * Leads raspados do Google Maps, lidos do disco quando não há Supabase.
 *
 * O arquivo é gerado por `prospeccao/scripts/montar_leads_udi.py`
 * e é o MESMO que `scripts/importar-leads.js` grava no banco. Assim a
 * lista mostra a raspagem na hora, sem esperar o Supabase estar configurado,
 * e o dia que ele estiver o conteúdo é idêntico.
 *
 * O app roda de `crm`, então o arquivo fica dois níveis acima.
 */
export const ARQUIVO_RASPAGEM = path.join(process.cwd(), "..", "prospeccao", "leads", "uberlandia", "leads.json");

type Cru = {
  id: string;
  nome: string;
  cat?: string;
  tel?: string;
  end?: string;
  nota?: string | number | null;
  aval?: string | number | null;
  ig?: string;
  seguidores?: number | null;
  site?: string;
  email?: string;
  nicho?: string;
  gancho?: string;
  prioridade?: number;
  fechado?: boolean;
};

function numero(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Null quando o arquivo não existe ou está ilegível: quem chama cai nos exemplos. */
export function lerLeadsRaspados(): LeadDoPoco[] | null {
  try {
    if (!fs.existsSync(ARQUIVO_RASPAGEM)) return null;
    const crus = JSON.parse(fs.readFileSync(ARQUIVO_RASPAGEM, "utf8")) as Cru[];
    if (!Array.isArray(crus) || !crus.length) return null;
    const agora = fs.statSync(ARQUIVO_RASPAGEM).mtime.toISOString();
    return crus.map((c) => ({
      id: c.id,
      nome: c.nome,
      categoria: c.cat || null,
      telefone: c.tel || null,
      endereco: c.end || null,
      nota: numero(c.nota),
      avaliacoes: numero(c.aval),
      instagram: c.ig || null,
      seguidores: c.seguidores ?? null,
      site: c.site || null,
      email: c.email || null,
      nicho: c.nicho || null,
      gancho: c.gancho || null,
      prioridade: c.prioridade ?? null,
      fechado: Boolean(c.fechado),
      origem: "raspado",
      situacao: "novo",
      etapa: null,
      vendedor_id: null,
      atribuido_em: null,
      motivo_desqualificacao: null,
      criado_em: agora,
      atualizado_em: agora,
      perfis: null,
      contatos: [],
    }));
  } catch {
    return null;
  }
}
