"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, temCredenciaisServidor } from "@/lib/supabase/servidor";

/**
 * Toda ação do poço devolve isto. Nunca lança: um throw em Server Action
 * chega no cliente como um digest opaco, e o vendedor ficaria com um botão
 * girando sem saber o que aconteceu.
 */
export type Resultado = { ok: true; recado: string } | { ok: false; erro: string };

const SEM_BANCO =
  "Sem banco. Falta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env do app — nada é gravado.";

function texto(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Limpa o que veio do formulário antes de encostar no banco. */
function limpar(v: unknown, limite = 300) {
  return typeof v === "string" ? v.trim().slice(0, limite) : "";
}

type Sessao = { sb: Awaited<ReturnType<typeof criarClienteServidor>>; eu: string };

/**
 * Começo comum de toda ação: credencial + sessão. Sem uma das duas a ação
 * para aqui e explica o porquê, em vez de estourar no meio de um update.
 */
async function abrir(): Promise<Sessao | { erro: string }> {
  if (!temCredenciaisServidor()) return { erro: SEM_BANCO };
  try {
    const sb = await criarClienteServidor();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return { erro: "Sessão expirada. Entre de novo para continuar." };
    return { sb, eu: data.user.id };
  } catch (e) {
    return { erro: `Não deu para falar com o banco: ${texto(e)}` };
  }
}

function semSessao(s: Sessao | { erro: string }): s is { erro: string } {
  return "erro" in s;
}

/**
 * O diário do poço. Se o evento falhar, a ação em si já aconteceu — então
 * não vira erro da ação, mas também não é varrido para debaixo do tapete:
 * volta como aviso colado no recado de sucesso.
 */
async function registrar(
  { sb, eu }: Sessao,
  lead_id: string,
  tipo: "atribuiu" | "largou" | "qualificou" | "desqualificou" | "criou",
  nota = ""
): Promise<string> {
  try {
    const { error } = await sb.from("eventos").insert({ lead_id, vendedor_id: eu, tipo, nota });
    return error ? ` (o histórico não gravou: ${error.message})` : "";
  } catch (e) {
    return ` (o histórico não gravou: ${texto(e)})`;
  }
}

/**
 * Garante que o lead é meu antes de escrever nele. Existe porque gravar
 * contato exige dono: o RLS só aceita contato de lead cujo vendedor_id =
 * auth.uid(), e o trigger devolve para 'novo' qualquer lead sem dono.
 *
 * Se o lead estiver livre, pega para mim na hora — é a regra de operação
 * ("antes de contatar, pegue o lead") aplicada quando a tela está velha.
 * Se estiver com outra pessoa, para: roubar lead é bloqueado pelo banco, e
 * aqui a gente explica em português em vez de deixar o banco recusar mudo.
 */
async function garantirQueEMeu(
  s: Sessao,
  leadId: string
): Promise<{ erro: string } | { aviso: string }> {
  const { data, error } = await s.sb
    .from("leads")
    .select("id, nome, vendedor_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error) return { erro: `Não deu para ler o lead: ${error.message}` };
  if (!data) return { erro: "Esse lead não existe mais." };
  if (data.vendedor_id === s.eu) return { aviso: "" };
  if (data.vendedor_id) {
    return { erro: "Esse lead está com outra pessoa. Só o dono pode mexer nele." };
  }

  const { data: pegos, error: erroPegar } = await s.sb
    .from("leads")
    .update({ vendedor_id: s.eu, situacao: "meu", atribuido_em: new Date().toISOString() })
    .eq("id", leadId)
    .is("vendedor_id", null)
    .select("id");

  if (erroPegar) return { erro: `Não deu para pegar o lead: ${erroPegar.message}` };
  if (!pegos?.length) return { erro: "Alguém pegou esse lead agora mesmo. Atualize a lista." };

  const avisoEvento = await registrar(s, leadId, "atribuiu");
  return { aviso: ` Ele estava livre, então entrou para você.${avisoEvento}` };
}

/* ================================================================== *
 *  PEGAR PARA MIM
 *  A atribuição não é burocracia: é o aviso para os outros vendedores de
 *  que alguém já está em cima deste pet shop.
 * ================================================================== */
export async function pegarLead(leadId: string): Promise<Resultado> {
  const s = await abrir();
  if (semSessao(s)) return { ok: false, erro: s.erro };

  try {
    // Sem filtro de dono na query: quem recusa o roubo é o RLS. Se nenhuma
    // linha voltar, é porque o lead já tem outro dono.
    const { data, error } = await s.sb
      .from("leads")
      .update({ vendedor_id: s.eu, situacao: "meu", atribuido_em: new Date().toISOString() })
      .eq("id", leadId)
      .select("id, nome");

    if (error) return { ok: false, erro: error.message };
    if (!data?.length) {
      return {
        ok: false,
        erro: "Não foi possível pegar: o lead já está com outra pessoa (ou não existe mais).",
      };
    }

    const aviso = await registrar(s, leadId, "atribuiu");
    revalidatePath("/leads");
    return { ok: true, recado: `${data[0].nome} é seu. Pode contatar.${aviso}` };
  } catch (e) {
    return { ok: false, erro: `Falhou: ${texto(e)}` };
  }
}

/* ================================================================== *
 *  LARGAR — devolve ao poço
 * ================================================================== */
export async function largarLead(leadId: string): Promise<Resultado> {
  const s = await abrir();
  if (semSessao(s)) return { ok: false, erro: s.erro };

  try {
    // vendedor_id = null faz o trigger `leads_coerencia` devolver a situação
    // para 'novo' e limpar a etapa — não repito essa conta aqui. O motivo de
    // desqualificação sai junto: ele era da minha tentativa, não do lead.
    const { data, error } = await s.sb
      .from("leads")
      .update({
        vendedor_id: null,
        situacao: "novo",
        atribuido_em: null,
        motivo_desqualificacao: null,
      })
      .eq("id", leadId)
      .eq("vendedor_id", s.eu)
      .select("id, nome");

    if (error) return { ok: false, erro: error.message };
    if (!data?.length) {
      return { ok: false, erro: "Só o dono pode largar o lead — e ele não está com você." };
    }

    const aviso = await registrar(s, leadId, "largou");
    revalidatePath("/leads");
    return { ok: true, recado: `${data[0].nome} voltou para o poço.${aviso}` };
  } catch (e) {
    return { ok: false, erro: `Falhou: ${texto(e)}` };
  }
}

/* ================================================================== *
 *  QUALIFICAR
 *
 *  A regra central do produto. "Qualificado" NÃO significa "tem dor e
 *  verba": significa que o vendedor saiu do contato com o telefone de quem
 *  decide. É um fato binário, e é o ativo que a prospecção produz. Por isso
 *  esta ação se recusa a marcar o lead sem gravar um contato.
 * ================================================================== */
export type ContatoNovo = { nome: string; cargo: string; telefone: string };

export async function qualificarLead(leadId: string, bruto: ContatoNovo): Promise<Resultado> {
  const s = await abrir();
  if (semSessao(s)) return { ok: false, erro: s.erro };

  const nome = limpar(bruto?.nome, 120);
  const cargo = limpar(bruto?.cargo, 120);
  const telefone = limpar(bruto?.telefone, 40);

  if (!nome) return { ok: false, erro: "Diga o nome de quem decide — é esse o ativo." };
  if (!telefone) {
    return {
      ok: false,
      erro:
        "Sem o telefone de quem decide o lead não está qualificado. É exatamente isso que qualificar quer dizer.",
    };
  }

  try {
    const posse = await garantirQueEMeu(s, leadId);
    if ("erro" in posse) return { ok: false, erro: posse.erro };

    // Contato PRIMEIRO, situação depois. Se o contato não gravar, o lead não
    // fica marcado como qualificado — porque não estaria. Na ordem inversa,
    // uma falha deixaria um "qualificado" sem contato nenhum, que é justo a
    // mentira que este produto não pode contar.
    const { error: erroContato } = await s.sb.from("contatos").insert({
      lead_id: leadId,
      nome,
      cargo,
      telefone,
      e_decisor: true,
    });
    if (erroContato) {
      return { ok: false, erro: `O contato não gravou: ${erroContato.message}` };
    }

    // A etapa do kanban quem põe é o trigger ('novo_contato'). Não duplico.
    const { data, error } = await s.sb
      .from("leads")
      .update({ situacao: "qualificado", motivo_desqualificacao: null })
      .eq("id", leadId)
      .eq("vendedor_id", s.eu)
      .select("id, nome");

    if (error) {
      return {
        ok: false,
        erro: `O contato gravou, mas o lead não virou qualificado: ${error.message}. Tente de novo.`,
      };
    }
    if (!data?.length) {
      return {
        ok: false,
        erro: "O contato gravou, mas o lead saiu das suas mãos antes de marcar. Atualize a lista.",
      };
    }

    const aviso = await registrar(s, leadId, "qualificou", cargo ? `${nome} — ${cargo}` : nome);
    revalidatePath("/leads");
    revalidatePath("/funil");
    return {
      ok: true,
      recado: `${data[0].nome} qualificado: ${nome} (${telefone}) está no funil.${posse.aviso}${aviso}`,
    };
  } catch (e) {
    return { ok: false, erro: `Falhou: ${texto(e)}` };
  }
}

/* ================================================================== *
 *  NÃO QUALIFICAR
 * ================================================================== */
export async function desqualificarLead(leadId: string, bruto: string): Promise<Resultado> {
  const s = await abrir();
  if (semSessao(s)) return { ok: false, erro: s.erro };

  const motivo = limpar(bruto, 400);
  if (!motivo) {
    return { ok: false, erro: "Escreva o motivo. Sem ele ninguém sabe por que não contatar de novo." };
  }

  try {
    const posse = await garantirQueEMeu(s, leadId);
    if ("erro" in posse) return { ok: false, erro: posse.erro };

    const { data, error } = await s.sb
      .from("leads")
      .update({ situacao: "nao_qualificado", motivo_desqualificacao: motivo })
      .eq("id", leadId)
      .eq("vendedor_id", s.eu)
      .select("id, nome");

    if (error) return { ok: false, erro: error.message };
    if (!data?.length) {
      return { ok: false, erro: "O lead saiu das suas mãos antes de marcar. Atualize a lista." };
    }

    const aviso = await registrar(s, leadId, "desqualificou", motivo);
    revalidatePath("/leads");
    return {
      ok: true,
      recado: `${data[0].nome} marcado como não qualificado.${posse.aviso}${aviso}`,
    };
  } catch (e) {
    return { ok: false, erro: `Falhou: ${texto(e)}` };
  }
}

/* ================================================================== *
 *  CRIAR LEAD À MÃO
 * ================================================================== */
export type LeadNovo = {
  nome: string;
  telefone: string;
  categoria?: string;
  endereco?: string;
  nota?: string;
  avaliacoes?: string;
  instagram?: string;
  site?: string;
  /** Pegar para mim na hora. A regra é: antes de contatar, o lead é seu. */
  pegarParaMim?: boolean;
};

/** "4,7" e "4.7" são a mesma nota — o raspador do Maps devolve com vírgula. */
function paraNota(v?: string): number | null {
  const bruto = limpar(v, 10).replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

function paraInteiro(v?: string): number | null {
  const bruto = limpar(v, 12).replace(/\D/g, "");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isSafeInteger(n) ? n : null;
}

export async function criarLead(bruto: LeadNovo): Promise<Resultado> {
  const s = await abrir();
  if (semSessao(s)) return { ok: false, erro: s.erro };

  const nome = limpar(bruto?.nome, 200);
  const telefone = limpar(bruto?.telefone, 40);
  if (!nome) return { ok: false, erro: "O lead precisa de nome." };
  if (!telefone) {
    return { ok: false, erro: "O lead precisa de telefone — é por ele que você liga." };
  }

  const meu = Boolean(bruto?.pegarParaMim);
  const agora = new Date().toISOString();

  try {
    const { data, error } = await s.sb
      .from("leads")
      .insert({
        nome,
        telefone,
        categoria: limpar(bruto?.categoria, 120),
        endereco: limpar(bruto?.endereco, 300),
        nota: paraNota(bruto?.nota),
        avaliacoes: paraInteiro(bruto?.avaliacoes),
        instagram: limpar(bruto?.instagram, 300),
        site: limpar(bruto?.site, 300),
        origem: "manual",
        // Mando dono e situação juntos; se vendedor_id for nulo o trigger
        // força 'novo' de qualquer jeito, então não há estado incoerente.
        vendedor_id: meu ? s.eu : null,
        situacao: meu ? "meu" : "novo",
        atribuido_em: meu ? agora : null,
      })
      .select("id, nome")
      .single();

    if (error) return { ok: false, erro: `Não deu para criar: ${error.message}` };
    if (!data) return { ok: false, erro: "Não deu para criar: o banco não devolveu o lead." };

    let aviso = await registrar(s, data.id, "criou", "origem manual");
    if (meu) aviso += await registrar(s, data.id, "atribuiu");

    revalidatePath("/leads");
    return {
      ok: true,
      recado: meu
        ? `${data.nome} criado e já é seu. Pode contatar.${aviso}`
        : `${data.nome} entrou no poço, sem dono.${aviso}`,
    };
  } catch (e) {
    return { ok: false, erro: `Falhou: ${texto(e)}` };
  }
}
