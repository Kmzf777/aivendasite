import fs from "node:fs";
import path from "node:path";

// O .env do projeto mora UMA PASTA ACIMA, junto do catálogo de objeções e
// do histórico — ele é do projeto inteiro, não só do app web. Mas o Next
// só lê .env da raiz do app, e variáveis NEXT_PUBLIC_* são embutidas em
// tempo de build.
//
// Sem esta ponte, as chaves do Supabase ficariam invisíveis e
// temCredenciais() devolveria false para sempre, com a tela de login
// dizendo "sem Supabase" mesmo com tudo configurado. Foi exatamente o que
// aconteceu antes desta função existir.
function lerEnvDoProjeto() {
  const arquivo = path.join(process.cwd(), "..", ".env");
  if (!fs.existsSync(arquivo)) return {};

  const env = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i < 1) continue;
    env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const doProjeto = lerEnvDoProjeto();

// SÓ as públicas. A service_role key IGNORA o RLS: se ela entrasse aqui,
// um `process.env.SUPABASE_SERVICE_ROLE_KEY` em código de cliente a
// embutiria no bundle do navegador. Ela fica só para o script de
// importação, que lê o .env direto com fs.
const PUBLICAS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

const env = {};
for (const chave of PUBLICAS) {
  const v = process.env[chave] ?? doProjeto[chave];
  if (v) env[chave] = v;
}

/** @type {import('next').NextConfig} */
export default { env };
