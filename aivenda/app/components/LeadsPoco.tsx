"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  criarLead,
  desqualificarLead,
  largarLead,
  pegarLead,
  qualificarLead,
  type ContatoNovo,
  type LeadNovo,
  type Resultado,
} from "@/app/(crm)/leads/acoes";
import type { LeadDoPoco } from "@/lib/leadsExemplo";
import LeadLinha from "./LeadLinha";
import LeadDesqualificar from "./LeadDesqualificar";
import NovoLeadModal from "./NovoLeadModal";
import QualificarModal from "./QualificarModal";
import estilo from "./LeadsPoco.module.css";

type Props = {
  leads: LeadDoPoco[];
  meuId: string | null;
  meuNome: string | null;
  /** True quando não há credenciais: o que está na tela é de mentira. */
  demonstracao?: boolean;
};

type Filtro = "sem_dono" | "meus" | "qualificados" | "todos";
type Ordem = "nota" | "avaliacoes" | "nome";
type Aviso = { tom: "ok" | "erro"; texto: string; selo: number };
type Modal =
  | { tipo: "qualificar"; lead: LeadDoPoco }
  | { tipo: "desqualificar"; lead: LeadDoPoco }
  | { tipo: "novo" }
  | null;

const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "nota", nome: "nota" },
  { id: "avaliacoes", nome: "avaliações" },
  { id: "nome", nome: "nome" },
];

/** Busca sem acento: "amigao" tem que achar "Amigão". */
function achatar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function LeadsPoco({ leads, meuId, meuNome, demonstracao = false }: Props) {
  // O filtro abre em "sem dono" de propósito. Esta tela não é um relatório:
  // ela existe para dar vontade de ligar, e o que dá vontade é a pilha de
  // pet shops que ninguém pegou ainda.
  const [filtro, setFiltro] = useState<Filtro>("sem_dono");
  const [ordem, setOrdem] = useState<Ordem>("nota");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const relogio = useRef<number | null>(null);

  const conta = useMemo(() => {
    const semDono = leads.filter((l) => !l.vendedor_id).length;
    const meus = meuId ? leads.filter((l) => l.vendedor_id === meuId).length : 0;
    const qualificados = leads.filter((l) => l.situacao === "qualificado").length;
    const descartados = leads.filter((l) => l.situacao === "nao_qualificado").length;
    const deOutros = leads.filter((l) => l.vendedor_id && l.vendedor_id !== meuId).length;
    return { semDono, meus, qualificados, descartados, deOutros, total: leads.length };
  }, [leads, meuId]);

  const visiveis = useMemo(() => {
    const q = achatar(busca.trim());

    const porFiltro = leads.filter((l) => {
      if (filtro === "sem_dono") return !l.vendedor_id;
      if (filtro === "meus") return Boolean(meuId) && l.vendedor_id === meuId;
      if (filtro === "qualificados") return l.situacao === "qualificado";
      return true;
    });

    const porBusca = q
      ? porFiltro.filter((l) =>
          achatar([l.nome, l.categoria ?? "", l.telefone ?? "", l.endereco ?? ""].join(" ")).includes(q)
        )
      : porFiltro;

    // Nota decrescente por padrão: o vendedor ataca os melhores primeiro.
    // Quem não tem nota vai para o fim (é o `nulls last` do índice do banco).
    return [...porBusca].sort((a, b) => {
      if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
      const chave = ordem === "nota" ? "nota" : "avaliacoes";
      const x = a[chave];
      const y = b[chave];
      if (x === null && y === null) return a.nome.localeCompare(b.nome, "pt-BR");
      if (x === null) return 1;
      if (y === null) return -1;
      if (y !== x) return y - x;
      // Empate de nota: mais avaliações é mais sólido.
      return (b.avaliacoes ?? 0) - (a.avaliacoes ?? 0);
    });
  }, [leads, filtro, busca, ordem, meuId]);

  /* --------------------------------------------------- avisos */
  function avisar(tom: Aviso["tom"], texto: string) {
    setAviso({ tom, texto, selo: Date.now() });
  }

  useEffect(() => {
    if (relogio.current) window.clearTimeout(relogio.current);
    // Sucesso se apaga sozinho; erro fica até o vendedor fechar, porque erro
    // que desaparece antes de ser lido é o mesmo que falhar em silêncio.
    if (aviso?.tom === "ok") {
      relogio.current = window.setTimeout(() => setAviso(null), 6500);
    }
    return () => {
      if (relogio.current) window.clearTimeout(relogio.current);
    };
  }, [aviso]);

  /**
   * Casca de toda ação. O `finally` é o contrato da tela: o botão volta ao
   * normal aconteça o que acontecer, nunca fica girando para sempre.
   */
  async function executar(
    leadId: string,
    fn: () => Promise<Resultado>,
    erroNoAviso = true
  ): Promise<Resultado> {
    setOcupado(leadId);
    try {
      const r = await fn();
      if (r.ok) avisar("ok", r.recado);
      else if (erroNoAviso) avisar("erro", r.erro);
      return r;
    } catch (e) {
      // Rede caiu, deploy no meio, Server Action recusada: ainda assim o
      // vendedor precisa ver algo em português.
      const texto = `A ação não chegou ao servidor: ${
        e instanceof Error ? e.message : String(e)
      }`;
      if (erroNoAviso) avisar("erro", texto);
      return { ok: false, erro: texto };
    } finally {
      setOcupado(null);
    }
  }

  const fichas: { id: Filtro; nome: string; dica: string; n: number; tom?: string }[] = [
    {
      id: "sem_dono",
      nome: "Sem dono",
      dica: "ninguém ligou ainda",
      n: conta.semDono,
      tom: "sinal",
    },
    { id: "meus", nome: "Meus", dica: "você pegou; agora ligue", n: conta.meus, tom: "voce" },
    {
      id: "qualificados",
      nome: "Qualificados",
      dica: "contato do decisor na mão",
      n: conta.qualificados,
      tom: "ok",
    },
    { id: "todos", nome: "Todos", dica: "o poço inteiro", n: conta.total },
  ];

  const pct = (n: number) => (conta.total ? (n / conta.total) * 100 : 0);

  return (
    <div className={estilo.tela}>
      {demonstracao && (
        <p className={estilo.demo} role="status">
          <strong>Dados de demonstração.</strong> Não há credenciais do Supabase no{" "}
          <code>.env</code>, então estes {leads.length} leads são inventados e nenhuma ação é
          gravada. Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para ver o poço de verdade.
        </p>
      )}

      {/* ====================================================== topo */}
      <header className={estilo.topo}>
        <div className={estilo.cabeca}>
          <div>
            <span className="rotulo">o poço</span>
            <h1 className={estilo.titulo}>Leads</h1>
            <p className={estilo.lema}>
              Antes de ligar, <em>pegue o lead para si</em> — é assim que os outros vendedores
              sabem que você já está em cima dele.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setModal({ tipo: "novo" })}
            disabled={Boolean(ocupado)}
          >
            + Novo lead
          </button>
        </div>

        {/* As fichas são o filtro E o placar. O número de "sem dono" é o
            maior da tela porque é a pergunta que a tela faz. */}
        <div className={estilo.placar}>
          {fichas.map((f) => (
            <button
              key={f.id}
              type="button"
              className={estilo.ficha}
              data-ativo={filtro === f.id}
              data-tom={f.tom ?? "neutro"}
              data-grande={f.id === "sem_dono"}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
            >
              <strong>{f.n}</strong>
              <span className="rotulo">{f.nome}</span>
              <em>{f.dica}</em>
            </button>
          ))}
        </div>

        {/* A régua mede posse, não qualificação: as três fatias são sem dono,
            seus e dos outros, e somam o poço inteiro. É o retrato de quanto
            ainda está intocado. */}
        <div className={estilo.regua} aria-hidden>
          <span className={estilo.fatia} data-tom="sinal" style={{ width: `${pct(conta.semDono)}%` }} />
          <span className={estilo.fatia} data-tom="voce" style={{ width: `${pct(conta.meus)}%` }} />
          <span className={estilo.fatia} data-tom="outro" style={{ width: `${pct(conta.deOutros)}%` }} />
        </div>
        <p className={estilo.legenda}>
          <span className="telemetria">
            {conta.semDono} de {conta.total} sem dono
            {conta.descartados > 0 && ` · ${conta.descartados} descartados`}
            {meuNome && ` · você é ${meuNome}`}
          </span>
        </p>

        <div className={estilo.controles}>
          <input
            className={`campo ${estilo.busca}`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria ou telefone…"
            aria-label="Buscar lead"
          />
          <div className={estilo.ordenar}>
            <span className="rotulo">ordem</span>
            {ORDENS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={estilo.chip}
                data-ativo={ordem === o.id}
                onClick={() => setOrdem(o.id)}
                aria-pressed={ordem === o.id}
              >
                {o.nome}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ====================================================== lista */}
      <section className={`painel ${estilo.lista}`}>
        <div className={estilo.cabecalhoLista} aria-hidden>
          <span className="rotulo">pet shop</span>
          <span className="rotulo">telefone da lista</span>
          <span className="rotulo">google</span>
          <span className="rotulo">quem está com ele</span>
          <span />
        </div>

        {visiveis.length === 0 ? (
          <p className={estilo.vazio}>
            {busca.trim()
              ? `Nada com “${busca.trim()}”.`
              : filtro === "sem_dono"
                ? `O poço secou: todos os ${conta.total} leads têm dono.`
                : filtro === "meus"
                  ? "Você não está com nenhum lead. Pegue um e ligue."
                  : filtro === "qualificados"
                    ? "Nenhum qualificado ainda. Qualificar é sair da ligação com o telefone de quem decide."
                    : "O poço está vazio. Importe os leads do Maps ou crie um à mão."}
          </p>
        ) : (
          <ul className={estilo.linhas}>
            {visiveis.map((lead) => (
              <LeadLinha
                key={lead.id}
                lead={lead}
                meuId={meuId}
                ocupado={ocupado === lead.id}
                aoPegar={() => executar(lead.id, () => pegarLead(lead.id))}
                aoLargar={() => executar(lead.id, () => largarLead(lead.id))}
                aoQualificar={() => setModal({ tipo: "qualificar", lead })}
                aoDesqualificar={() => setModal({ tipo: "desqualificar", lead })}
              />
            ))}
          </ul>
        )}

        {visiveis.length > 0 && (
          <p className={estilo.rodape}>
            <span className="telemetria">
              {visiveis.length} {visiveis.length === 1 ? "lead" : "leads"} na tela
              {visiveis.length !== conta.total && ` · ${conta.total} no total`}
            </span>
          </p>
        )}
      </section>

      {/* ====================================================== modais */}
      {modal?.tipo === "qualificar" && (
        <QualificarModal
          key={modal.lead.id}
          leadNome={modal.lead.nome}
          telefoneDaLista={modal.lead.telefone}
          jaQualificado={modal.lead.situacao === "qualificado"}
          aoFechar={() => setModal(null)}
          aoEnviar={async (contato: ContatoNovo) => {
            // erroNoAviso = false: o erro aparece DENTRO do modal, junto do
            // que foi digitado, que é onde o vendedor está olhando.
            const r = await executar(
              modal.lead.id,
              () => qualificarLead(modal.lead.id, contato),
              false
            );
            if (r.ok) setModal(null);
            return r;
          }}
        />
      )}

      {modal?.tipo === "desqualificar" && (
        <LeadDesqualificar
          key={modal.lead.id}
          leadNome={modal.lead.nome}
          motivoAtual={modal.lead.motivo_desqualificacao}
          aoFechar={() => setModal(null)}
          aoEnviar={async (motivo: string) => {
            const r = await executar(
              modal.lead.id,
              () => desqualificarLead(modal.lead.id, motivo),
              false
            );
            if (r.ok) setModal(null);
            return r;
          }}
        />
      )}

      {modal?.tipo === "novo" && (
        <NovoLeadModal
          aoFechar={() => setModal(null)}
          aoEnviar={async (dados: LeadNovo) => {
            const r = await executar("novo", () => criarLead(dados), false);
            if (r.ok) setModal(null);
            return r;
          }}
        />
      )}

      {/* ====================================================== aviso */}
      {aviso && (
        <div
          className={estilo.aviso}
          data-tom={aviso.tom}
          // Erro interrompe o leitor de tela; sucesso espera a brecha.
          role={aviso.tom === "erro" ? "alert" : "status"}
          aria-live={aviso.tom === "erro" ? "assertive" : "polite"}
        >
          <p>{aviso.texto}</p>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
