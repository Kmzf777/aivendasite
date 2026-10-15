"use client";

import type { LeadDoPoco } from "@/lib/leadsExemplo";
import estilo from "./LeadLinha.module.css";

type Props = {
  lead: LeadDoPoco;
  /** Lista da equipe inteira (true) ou só os meus (false). Muda a leitura:
      na universal, lead pego aparece apagado e riscado. */
  universal: boolean;
  /** Quem está logado. Null quando não há sessão (ou no modo demonstração). */
  meuId: string | null;
  /** Há uma ação deste lead em voo. Trava só os botões desta linha. */
  ocupado: boolean;
  aoPegar: () => void;
  aoLargar: () => void;
  aoQualificar: () => void;
  aoDesqualificar: () => void;
};

/** "4.9" → "4,9". Formatação à mão de propósito: toLocaleString no servidor
 *  e no navegador podem divergir e quebrar a hidratação. */
function nota(n: number | null) {
  if (n === null || !Number.isFinite(n)) return null;
  return n.toFixed(1).replace(".", ",");
}

function milhar(n: number | null) {
  if (n === null || !Number.isFinite(n)) return null;
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "https://www.instagram.com/fulano/" → "fulano". */
function arroba(url: string) {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? m[1] : url;
}

/** "https://www.exemplo.com.br/x" → "exemplo.com.br". */
function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LeadLinha({
  lead,
  universal,
  meuId,
  ocupado,
  aoPegar,
  aoLargar,
  aoQualificar,
  aoDesqualificar,
}: Props) {
  const semDono = !lead.vendedor_id;
  const eMeu = Boolean(meuId) && lead.vendedor_id === meuId;
  const deOutro = Boolean(lead.vendedor_id) && !eMeu;
  const qualificado = lead.situacao === "qualificado";
  const descartado = lead.situacao === "nao_qualificado";

  // Na lista universal, lead JÁ PEGO é informação, não trabalho: apaga e
  // risca. O que sobra aceso é o que ainda está livre, que é o ponto da
  // tela. Em "meus leads" ninguém risca nada — ali tudo é seu e tudo é
  // trabalho a fazer.
  const riscado = universal && !semDono;

  // O contato de quem decide é o ativo que o contato produziu. Quando existe,
  // ele aparece na linha — é a prova de que o trabalho foi feito.
  const decisor = lead.contatos?.find((c) => c.e_decisor) ?? lead.contatos?.[0] ?? null;
  const n = nota(lead.nota);
  const avaliacoes = milhar(lead.avaliacoes);
  const seguidores = milhar(lead.seguidores ?? null);

  return (
    <li className={`${estilo.linha} ${riscado ? estilo.riscado : ""}`} data-situacao={lead.situacao} data-sem-dono={semDono}>
      {/* ------------------------------------------------ identidade */}
      <div className={estilo.quem}>
        <div className={estilo.nomeLinha}>
          <span className={estilo.nome}>{lead.nome}</span>
          {lead.fechado && <span className={estilo.selo} data-cor="erro">fechado</span>}
          {lead.origem === "manual" && <span className={estilo.selo}>manual</span>}
          {/* Sem site é o argumento de venda, não um detalhe. */}
          {!lead.site && <span className={estilo.selo} data-cor="sinal">sem site</span>}
        </div>
        <div className={estilo.contexto}>
          {lead.nicho && <span className={estilo.nicho}>{lead.nicho}</span>}
          {lead.categoria && <span>{lead.categoria}</span>}
          {lead.endereco && <span className={estilo.endereco}>{lead.endereco}</span>}
        </div>

        {/* O que o vendedor abre ANTES de discar: o Instagram e o site dizem
            em dez segundos se o argumento é "você não tem site" ou "seu
            WhatsApp não dá conta". */}
        {(lead.instagram || lead.site || lead.email) && (
          <div className={estilo.links}>
            {lead.instagram && (
              <a href={lead.instagram} target="_blank" rel="noreferrer">
                @{arroba(lead.instagram)}
                {seguidores && <em> · {seguidores} seg.</em>}
              </a>
            )}
            {lead.site && (
              <a href={lead.site} target="_blank" rel="noreferrer">
                {dominio(lead.site)}
              </a>
            )}
            {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
          </div>
        )}

        {lead.gancho && (
          <p className={estilo.gancho}>
            <span className="rotulo">gancho</span>
            {lead.gancho}
          </p>
        )}

        {decisor && (
          <p className={estilo.decisor}>
            <span className="rotulo">quem decide</span>
            <strong>{decisor.nome}</strong>
            {decisor.cargo && <em>{decisor.cargo}</em>}
            <code>{decisor.telefone}</code>
          </p>
        )}

        {lead.situacao === "nao_qualificado" && lead.motivo_desqualificacao && (
          <p className={estilo.motivo}>
            <span className="rotulo">não qualificado</span>
            {lead.motivo_desqualificacao}
          </p>
        )}
      </div>

      {/* ------------------------------------------------ telefone */}
      <div className={estilo.telefone}>
        {lead.telefone ? (
          <a href={`tel:${lead.telefone.replace(/[^\d+]/g, "")}`}>{lead.telefone}</a>
        ) : (
          <span className={estilo.nada}>sem telefone</span>
        )}
      </div>

      {/* ------------------------------------------------ reputação */}
      <div className={estilo.reputacao}>
        {n ? (
          <>
            <strong>
              {n}
              <span aria-hidden> ★</span>
            </strong>
            <em>{avaliacoes ? `${avaliacoes} aval.` : "sem avaliações"}</em>
          </>
        ) : (
          <span className={estilo.nada}>sem nota</span>
        )}
      </div>

      {/* ------------------------------------------------ dono
          A coluna que faz esta tela funcionar. Vazia, ela precisa incomodar:
          é o aviso de que ninguém ligou para este pet shop ainda. */}
      <div className={estilo.dono}>
        {semDono ? (
          <span className={estilo.vago}>sem dono</span>
        ) : (
          <span className={estilo.comDono} data-eu={eMeu}>
            <span className={estilo.inicial} aria-hidden>
              {(lead.perfis?.nome ?? "?").trim().charAt(0).toUpperCase() || "?"}
            </span>
            {eMeu ? "você" : lead.perfis?.nome || "outro vendedor"}
          </span>
        )}
        {qualificado && <span className={estilo.selo} data-cor="ok">qualificado</span>}
        {/* O desfecho negativo também é informação: na lista universal, saber
            que alguém contatou e descartou evita o segundo contato inútil. */}
        {descartado && <span className={estilo.selo} data-cor="erro">não qualificado</span>}
        {/* Pego e ainda sem desfecho. Existe um terceiro estado além de
            qualificado e não qualificado, e deixar a coluna vazia nele faz
            a tela parecer quebrada em vez de informar que o contato ainda
            não aconteceu. */}
        {lead.situacao === "meu" && (
          <span className={estilo.selo}>em contato</span>
        )}
      </div>

      {/* ------------------------------------------------ ações */}
      <div className={estilo.acoes}>
        {semDono && (
          <button
            type="button"
            className={`btn btn-forte ${estilo.acao}`}
            onClick={aoPegar}
            disabled={ocupado}
          >
            {ocupado ? "…" : "Pegar para mim"}
          </button>
        )}

        {eMeu && (
          <>
            <button
              type="button"
              className={`btn ${estilo.acao} ${estilo.acaoOk}`}
              onClick={aoQualificar}
              disabled={ocupado}
              title="Gravar o contato de quem decide"
            >
              {qualificado ? "Outro contato" : "Qualificar"}
            </button>
            <button
              type="button"
              className={`btn ${estilo.acao}`}
              onClick={aoDesqualificar}
              disabled={ocupado}
            >
              Não qualificar
            </button>
            <button
              type="button"
              className={`btn ${estilo.acao} ${estilo.acaoFraca}`}
              onClick={aoLargar}
              disabled={ocupado}
              title="Devolve ao poço para qualquer um pegar"
            >
              {ocupado ? "…" : "Largar"}
            </button>
          </>
        )}

        {/* Quem não é dono não vê botão nenhum. Não é a tela que bloqueia o
            roubo — é o RLS do banco. Aqui a gente só não finge que dá. */}
        {deOutro && <span className={estilo.ocupadoPor}>em atendimento</span>}
      </div>
    </li>
  );
}
