// Importa os leads raspados do Google Maps para o Supabase.
//
//   node scripts/importar-leads.js            (confere e mostra o que faria)
//   node scripts/importar-leads.js --gravar   (grava de verdade)
//
// Usa a service_role key: ela IGNORA o RLS, que é o que permite semear a
// tabela sem um usuário logado. Por isso roda só aqui, nunca no navegador.
//
// É idempotente: reconhece lead já importado por nome + telefone e pula.
// Rodar duas vezes não duplica nada.

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ARQ_LEADS = path.join(RAIZ, "..", "leads", "raw.json");

function env() {
  const arq = path.join(RAIZ, ".env");
  const txt = fs.existsSync(arq) ? fs.readFileSync(arq, "utf8") : "";
  const pegar = (k) => {
    const m = txt.match(new RegExp("^\\s*" + k + "\\s*=\\s*(.+)$", "m"));
    return (m ? m[1] : process.env[k] || "").trim().replace(/^["']|["']$/g, "");
  };
  return {
    url: pegar("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""),
    chave: pegar("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// "5,0" -> 5.0 ; "" -> null. O scraper devolve vírgula decimal.
function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function inteiro(v) {
  const n = numero(v);
  return n === null ? null : Math.round(n);
}

function texto(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function converter(cru) {
  return {
    nome: texto(cru.nome),
    categoria: texto(cru.cat),
    telefone: texto(cru.tel),
    endereco: texto(cru.end),
    nota: numero(cru.nota),
    avaliacoes: inteiro(cru.aval),
    instagram: texto(cru.ig),
    seguidores: inteiro(cru.seguidores),
    site: texto(cru.site),
    fechado: cru.fechado === true || cru.fechado === "true",
    origem: "raspado",
    situacao: "novo",
  };
}

async function api(cfg, caminho, opcoes = {}) {
  const r = await fetch(cfg.url + "/rest/v1/" + caminho, {
    ...opcoes,
    headers: {
      apikey: cfg.chave,
      Authorization: "Bearer " + cfg.chave,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error("HTTP " + r.status + ": " + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : null;
}

(async () => {
  const cfg = env();
  const gravar = process.argv.includes("--gravar");

  if (!cfg.url || !cfg.chave) {
    console.error("\n  Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env\n");
    process.exit(1);
  }
  if (!fs.existsSync(ARQ_LEADS)) {
    console.error("\n  Não achei " + ARQ_LEADS + "\n");
    process.exit(1);
  }

  const crus = JSON.parse(fs.readFileSync(ARQ_LEADS, "utf8"));
  const convertidos = crus.map(converter).filter((l) => l.nome);

  console.log("\n  " + crus.length + " no arquivo · " + convertidos.length + " com nome");

  // Já está lá? Chave natural: nome + telefone.
  let existentes = [];
  try {
    existentes = await api(cfg, "leads?select=nome,telefone");
  } catch (e) {
    console.error("\n  Não consegui ler a tabela leads: " + e.message);
    console.error("  Rode supabase/schema.sql no SQL Editor do Supabase antes.\n");
    process.exit(1);
  }

  const jaTem = new Set(existentes.map((l) => (l.nome || "") + "|" + (l.telefone || "")));
  const novos = convertidos.filter((l) => !jaTem.has(l.nome + "|" + l.telefone));

  console.log("  " + existentes.length + " já no banco · " + novos.length + " a importar\n");

  if (!novos.length) {
    console.log("  Nada a fazer.\n");
    return;
  }

  console.log("  Primeiros 3 que entrariam:");
  novos.slice(0, 3).forEach((l) =>
    console.log("    " + l.nome.padEnd(38).slice(0, 38) + " " + (l.telefone || "sem telefone").padEnd(18) + " nota " + (l.nota ?? "—"))
  );

  if (!gravar) {
    console.log("\n  Ensaio. Rode com --gravar para valer.\n");
    return;
  }

  // Em lotes: 117 numa tacada só funciona, mas lote dá erro legível quando falha.
  const LOTE = 40;
  let gravados = 0;
  for (let i = 0; i < novos.length; i += LOTE) {
    const parte = novos.slice(i, i + LOTE);
    await api(cfg, "leads", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(parte),
    });
    gravados += parte.length;
    console.log("  gravados " + gravados + "/" + novos.length);
  }

  console.log("\n  Pronto. " + gravados + " leads no poço.\n");
})().catch((e) => {
  console.error("\n  Falhou: " + e.message + "\n");
  process.exit(1);
});
