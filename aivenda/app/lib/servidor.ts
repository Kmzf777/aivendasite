// Acesso ao disco e a chave. So roda no servidor - nunca importe daqui
// num componente cliente, senao a chave vaza para o bundle do browser.
import fs from "node:fs";
import path from "node:path";

// O catalogo e o .env moram na pasta de cima: sao dados do projeto, nao do app.
const RAIZ = path.join(process.cwd(), "..");
export const ARQ_OBJ = path.join(RAIZ, "objecoes.json");
const ARQ_LIMIARES = path.join(RAIZ, "limiares.json");

export function chave(): string | undefined {
  const arq = path.join(RAIZ, ".env");
  if (fs.existsSync(arq)) {
    const m = fs.readFileSync(arq, "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.TYPESAFE_API_KEY;
}

export function lerObjecoes(): any[] {
  try {
    const l = JSON.parse(fs.readFileSync(ARQ_OBJ, "utf8"));
    if (Array.isArray(l)) return l;
  } catch {}
  return [];
}

export function gravarObjecoes(lista: any[]) {
  fs.writeFileSync(ARQ_OBJ, JSON.stringify(lista, null, 2));
}

// Limiares editaveis pela tela. Ausentes = os defaults do CONFIG valem.
export function lerLimiares(): Record<string, number | string> {
  try { return JSON.parse(fs.readFileSync(ARQ_LIMIARES, "utf8")); } catch { return {}; }
}
export function gravarLimiares(v: Record<string, number | string>) {
  fs.writeFileSync(ARQ_LIMIARES, JSON.stringify(v, null, 2));
}
