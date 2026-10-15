// Importa os leads raspados do Google Maps para o Supabase.
//
//   node scripts/importar-leads.js            (confere e mostra o que faria)
//   node scripts/importar-leads.js --gravar   (grava de verdade)
//   node scripts/importar-leads.js --arquivo ../prospeccao/leads/uberlandia/leads.json --gravar
//   node scripts/importar-leads.js --ate 2 --gravar   (só prioridade 1 e 2)
//
// O padrão é prospeccao/leads/uberlandia/leads.json (raspagem de site +
// CRM) quando ele existe, senão o leads/raw.json antigo dos pet shops. O
// script mora em crm/scripts, por isso são três níveis até a raiz.
// As chaves vêm do crm/.env.local, o mesmo arquivo que o Next lê. Os campos email,
// nicho, gancho e prioridade exigem supabase/migracao-003-raspagem.sql.
//
// Usa a service_role key: ela IGNORA o RLS, que é o que permite semear a
// tabela sem um usuário logado. Por isso roda só aqui, nunca no navegador.
//
// É idempotente: reconhece lead já importado por nome + telefone e pula.
// Rodar duas vezes não duplica nada.

const fs = require("fs");
const path = require("path");

function arquivoLeads() {
  const i = process.argv.indexOf("--arquivo");
  if (i > -1 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  const novo = path.join(__dirname, "..", "..", "prospeccao", "leads", "uberlandia", "leads.json");
  return fs.existsSync(novo) ? novo : path.join(__dirname, "..", "..", "prospeccao", "leads", "raw.json");
}
const ARQ_LEADS = arquivoLeads();

function env() {
  const arq = path.join(__dirname, "..", ".env.local");
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
  // Campos da migracao-003 só entram se vierem no arquivo: o raw.json antigo
  // não os tem, e mandar a coluna num banco sem a migração dá HTTP 400.
  const extra = {};
  if (cru.email !== undefined) extra.email = texto(cru.email);
  if (cru.nicho !== undefined) extra.nicho = texto(cru.nicho);
  if (cru.gancho !== undefined) extra.gancho = texto(cru.gancho);
  if (cru.prioridade !== undefined) extra.prioridade = inteiro(cru.prioridade);
  return {
    ...extra,
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
  // --ate 2 = só prioridade 1 e 2. A raspagem tem mais de mil linhas e a
  // lista é da equipe inteira: entra primeiro o que vale o contato.
  const iAte = process.argv.indexOf("--ate");
  const ate = iAte > -1 ? Number(process.argv[iAte + 1]) : Infinity;
  const convertidos = crus
    .filter((c) => c.prioridade == null || c.prioridade <= ate)
    .map(converter)
    .filter((l) => l.nome);

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

  // Campos da raspagem (email, nicho, gancho, prioridade) precisam da
  // migracao-003. Sem ela o POST inteiro dá 400; melhor parar e dizer o porquê.
  const temExtras = convertidos.some((l) => "nicho" in l);
  if (temExtras) {
    try {
      await api(cfg, "leads?select=nicho,gancho,prioridade,email&limit=1");
    } catch (e) {
      if (!process.argv.includes("--sem-extras")) {
        console.error("\n  O banco não tem as colunas da raspagem (nicho, gancho, prioridade, email).");
        console.error("  Rode supabase/migracao-003-raspagem.sql no SQL Editor do Supabase,");
        console.error("  ou rode com --sem-extras para importar só os campos básicos.\n");
        process.exit(1);
      }
      convertidos.forEach((l) => {
        delete l.email;
        delete l.nicho;
        delete l.gancho;
        delete l.prioridade;
      });
    }
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
