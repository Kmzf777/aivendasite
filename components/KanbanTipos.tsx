// ==================================================================
// Tipos e contas do funil.
//
// Mora em components/ porque nasceu junto do quadro, numa rodada em que
// lib/ pertencia a outra frente. Nada aqui renderiza.
//
// A regra que manda em tudo: só entra neste quadro lead com
// situacao = 'qualificado', e "qualificado" quer dizer UMA coisa — existe
// uma linha em `contatos` com o número de quem decide. Por isso o cartão
// carrega os contatos junto: sem eles o cartão não tem razão de existir.
// ==================================================================

import { ETAPAS, type Contato, type Etapa, type Evento, type Lead } from "@/lib/tipos";

/** As duas colunas que encerram a negociação. Não se cobra urgência de quem já acabou. */
export const ETAPAS_TERMINAIS: readonly Etapa[] = ["fechou", "perdeu"];

/** Horas de silêncio a partir das quais o cartão começa a gritar. */
export const HORAS_ATENCAO = 72; // 3 dias
export const HORAS_FRIO = 168; // 7 dias

export type Temperatura = "calmo" | "atencao" | "frio";

/**
 * Um cartão do quadro: o lead, os contatos que a prospecção produziu, o
 * histórico, e as contas de tempo já resolvidas.
 *
 * `paradoHoras` vem calculado do SERVIDOR de propósito. Se o cliente
 * recalculasse a partir de `Date.now()` na hidratação, o número renderizado
 * no servidor e no navegador poderiam divergir e o React acusaria erro de
 * hidratação. Depois de um movimento o próprio cliente zera o campo — ali
 * ele sabe a verdade sem precisar de relógio.
 */
export type CartaoLead = {
  id: string;
  nome: string;
  categoria: string | null;
  /** Telefone do estabelecimento (o que veio do Maps). NÃO é o de quem decide. */
  telefone: string | null;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number | null;
  site: string | null;
  instagram: string | null;
  etapa: Etapa;
  /** O ativo da prospecção. Ordenado com os decisores na frente. */
  contatos: Contato[];
  /** Mais recente primeiro. */
  eventos: Evento[];
  /** ISO: quando o lead entrou na coluna em que está. */
  entrouEm: string | null;
  /** ISO: último sinal de vida registrado (qualquer evento). */
  ultimaAtividadeEm: string | null;
  /** Horas desde o último sinal de vida. Calculado no servidor. */
  paradoHoras: number;
};

export function nomeEtapa(id: Etapa): string {
  return ETAPAS.find((e) => e.id === id)?.nome ?? id;
}

export function eTerminal(etapa: Etapa): boolean {
  return ETAPAS_TERMINAIS.includes(etapa);
}

/**
 * A coluna vizinha, para o caminho de teclado.
 * `null` quando não há para onde ir — o botão nasce desabilitado.
 */
export function etapaVizinha(etapa: Etapa, direcao: -1 | 1): Etapa | null {
  const i = ETAPAS.findIndex((e) => e.id === etapa);
  const vizinha = ETAPAS[i + direcao];
  return vizinha ? vizinha.id : null;
}

/**
 * Quente, esfriando ou frio.
 *
 * Coluna terminal nunca esquenta: lead fechado ou perdido não é dinheiro
 * morrendo, é dinheiro resolvido.
 */
export function temperatura(etapa: Etapa, paradoHoras: number): Temperatura {
  if (eTerminal(etapa)) return "calmo";
  if (paradoHoras >= HORAS_FRIO) return "frio";
  if (paradoHoras >= HORAS_ATENCAO) return "atencao";
  return "calmo";
}

/** "agora" / "há 5 h" / "há 12 d" — curto, porque é um cartão, não um relatório. */
export function rotuloTempo(paradoHoras: number): string {
  if (paradoHoras < 1) return "agora";
  if (paradoHoras < 24) return `há ${Math.floor(paradoHoras)} h`;
  return `há ${Math.floor(paradoHoras / 24)} d`;
}

/** O contato que importa no cartão: o decisor, se houver. */
export function decisor(c: CartaoLead): Contato | null {
  return c.contatos.find((x) => x.e_decisor) ?? c.contatos[0] ?? null;
}

function hora(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Monta os cartões a partir das três tabelas.
 *
 * Duas contas de tempo, e o porquê de cada uma:
 *
 * - `entrouEm` é o `criado_em` do último evento 'moveu'. Não preciso ler o
 *   destino escrito na nota: o último movimento É, por definição, o que
 *   trouxe o lead para a coluna atual. Se não houver nenhum (o lead foi
 *   qualificado e o gatilho do banco o colocou em 'novo_contato' sem passar
 *   por aqui), cai para `atribuido_em` e depois `criado_em`.
 *
 * - `ultimaAtividadeEm` é o evento mais recente de QUALQUER tipo. É este que
 *   alimenta o "parado há": anotar algo no lead é trabalhar o lead, e tem que
 *   zerar o relógio do esquecimento. Entrar na coluna também conta como
 *   atividade, por isso o máximo entre os dois.
 */
export function montarCartoes(
  leads: Lead[],
  contatos: Contato[],
  eventos: Evento[],
  agora: number = Date.now()
): CartaoLead[] {
  const porLead = new Map<string, { contatos: Contato[]; eventos: Evento[] }>();
  for (const l of leads) porLead.set(l.id, { contatos: [], eventos: [] });

  for (const c of contatos) porLead.get(c.lead_id)?.contatos.push(c);
  for (const e of eventos) porLead.get(e.lead_id)?.eventos.push(e);

  return leads.map((lead) => {
    const balde = porLead.get(lead.id)!;

    // Decisor na frente: é ele que vai aparecer no cartão.
    const contatosOrdenados = [...balde.contatos].sort((a, b) => {
      if (a.e_decisor !== b.e_decisor) return a.e_decisor ? -1 : 1;
      return hora(a.criado_em) - hora(b.criado_em);
    });
    const eventosOrdenados = [...balde.eventos].sort(
      (a, b) => hora(b.criado_em) - hora(a.criado_em)
    );

    const ultimoMovimento = eventosOrdenados.find((e) => e.tipo === "moveu");
    const entrouMs =
      hora(ultimoMovimento?.criado_em) || hora(lead.atribuido_em) || hora(lead.criado_em);
    const atividadeMs = Math.max(hora(eventosOrdenados[0]?.criado_em), entrouMs);

    // O gatilho `leads_coerencia` garante etapa não-nula quando qualificado.
    // O fallback aqui é só para linha escrita antes do gatilho existir — sem
    // ele um dado torto sumiria do quadro em silêncio.
    const etapa: Etapa = ETAPAS.some((e) => e.id === lead.etapa)
      ? (lead.etapa as Etapa)
      : "novo_contato";

    return {
      id: lead.id,
      nome: lead.nome,
      categoria: lead.categoria || null,
      telefone: lead.telefone || null,
      endereco: lead.endereco || null,
      nota: lead.nota ?? null,
      avaliacoes: lead.avaliacoes ?? null,
      site: lead.site || null,
      instagram: lead.instagram || null,
      etapa,
      contatos: contatosOrdenados,
      eventos: eventosOrdenados,
      entrouEm: entrouMs ? new Date(entrouMs).toISOString() : null,
      ultimaAtividadeEm: atividadeMs ? new Date(atividadeMs).toISOString() : null,
      paradoHoras: atividadeMs ? Math.max(0, (agora - atividadeMs) / 3_600_000) : 0,
    } satisfies CartaoLead;
  });
}

/**
 * Os cartões de uma coluna, na ordem em que ela deve ser lida.
 *
 * O topo da coluna é o que precisa de você: em coluna de trabalho o mais
 * parado sobe, e a ordem da coluna passa a ser a ordem de urgência. Em coluna
 * terminal é o contrário — ali não há urgência, há memória, e o que acabou de
 * fechar é o que você quer ver primeiro.
 *
 * A comparação acontece DENTRO de uma coluna de propósito: um comparador que
 * devolvesse 0 para cartões de colunas diferentes seria intransitivo, e
 * Array.sort com comparador intransitivo dá ordem imprevisível.
 */
export function cartoesDaEtapa(cartoes: CartaoLead[], etapa: Etapa): CartaoLead[] {
  const sinal = eTerminal(etapa) ? 1 : -1;
  return cartoes
    .filter((c) => c.etapa === etapa)
    .sort((a, b) => sinal * (a.paradoHoras - b.paradoHoras));
}
