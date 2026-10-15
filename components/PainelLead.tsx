"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ETAPAS, type Etapa } from "@/lib/tipos";
import {
  eTerminal,
  nomeEtapa,
  rotuloTempo,
  temperatura,
  type CartaoLead as Cartao,
} from "./KanbanTipos";
import estilo from "./PainelLead.module.css";

type Props = {
  cartao: Cartao;
  demonstracao: boolean;
  /** Gravação do movimento em voo: as etapas congelam. */
  salvando: boolean;
  aoFechar: () => void;
  aoMover: (id: string, destino: Etapa, focoApos?: string) => void;
  /** Devolve `false` quando o banco recusou — o texto fica no campo. */
  aoAnotar: (id: string, texto: string) => Promise<boolean>;
};

const RELOGIO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function quando(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? RELOGIO.format(new Date(t)) : "—";
}

/** O `tipo` do evento é texto livre no banco. Traduzo o que conheço e mostro o resto cru. */
const NOMES_DE_EVENTO: Record<string, string> = {
  moveu: "mudou de coluna",
  nota: "anotação",
  ligacao: "ligação",
  qualificou: "qualificou",
  desqualificou: "desqualificou",
  // Eventos antigos do tipo "objecao" continuam no banco; aparecem como nota.
  objecao: "nota",
  proposta: "proposta",
  fechou: "fechou",
  perdeu: "perdeu",
  pegou: "pegou o lead",
};

function paraDiscagem(telefone: string): string {
  return telefone.replace(/[^\d+]/g, "");
}

function comProtocolo(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// ==================================================================
// O painel do lead.
//
// Não é um modal: o quadro continua usável atrás dele, porque mexer no
// funil enquanto se lê o histórico de um lead é trabalho normal. Por isso
// não há `aria-modal` nem trava de foco — só Esc para fechar e devolução
// do foco ao cartão de origem (feita pelo quadro).
// ==================================================================
export default function PainelLead({
  cartao,
  demonstracao,
  salvando,
  aoFechar,
  aoMover,
  aoAnotar,
}: Props) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  // O painel recebe o foco ao abrir para que o leitor de tela comece a ler
  // daqui, e não de onde estava.
  useEffect(() => {
    caixa.current?.focus();
  }, []);

  const temp = temperatura(cartao.etapa, cartao.paradoHoras);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const deu = await aoAnotar(cartao.id, texto);
    setEnviando(false);
    if (deu) setTexto("");
  };

  return (
    <div
      className={estilo.painel}
      role="dialog"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      ref={caixa}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          aoFechar();
        }
      }}
    >
      <header className={estilo.topo}>
        <div className={estilo.identidade}>
          <p className={estilo.etapaAtual} data-terminal={eTerminal(cartao.etapa) ? "sim" : "nao"}>
            {nomeEtapa(cartao.etapa)}
          </p>
          <h2 className={estilo.nome} id={idTitulo}>
            {cartao.nome}
          </h2>
          {cartao.categoria && <p className={estilo.categoria}>{cartao.categoria}</p>}
        </div>
        <button type="button" className={estilo.fechar} onClick={aoFechar} aria-label="Fechar o painel (Esc)">
          <span aria-hidden>✕</span>
        </button>
      </header>

      <div className={estilo.rolo}>
        {/* ---------------- mover ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>Mover para</h3>
          <div className={estilo.trilha} role="group" aria-label="Etapa do funil">
            {ETAPAS.map((e) => {
              const travado = e.id === cartao.etapa || salvando;
              return (
                // `aria-disabled` em vez de `disabled`: o navegador tira o foco
                // de um botão que acabou de ser desabilitado, e aqui isso
                // aconteceria JUSTO no botão que a pessoa clicou — ela
                // perderia o lugar no painel a cada movimento. Assim o botão
                // continua focável, anuncia que está indisponível, e o clique
                // é barrado na mão.
                <button
                  key={e.id}
                  type="button"
                  className={estilo.etapaBotao}
                  data-aqui={e.id === cartao.etapa ? "sim" : "nao"}
                  aria-current={e.id === cartao.etapa ? "true" : undefined}
                  aria-disabled={travado}
                  onClick={() => {
                    if (travado) return;
                    aoMover(cartao.id, e.id);
                  }}
                >
                  {e.nome}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------- tempo ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>Tempo</h3>
          <dl className={estilo.tabela}>
            <div data-temp={temp}>
              <dt>Parado</dt>
              <dd className={estilo.destaque}>{rotuloTempo(cartao.paradoHoras)}</dd>
            </div>
            <div>
              <dt>Nesta coluna desde</dt>
              <dd>{quando(cartao.entrouEm)}</dd>
            </div>
            <div>
              <dt>Última atividade</dt>
              <dd>{quando(cartao.ultimaAtividadeEm)}</dd>
            </div>
          </dl>
        </section>

        {/* ---------------- quem decide ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>
            Quem decide {cartao.contatos.length > 1 && <span>· {cartao.contatos.length} contatos</span>}
          </h3>
          {cartao.contatos.length === 0 ? (
            <p className={estilo.furo}>
              Nenhum contato cadastrado. Um lead sem o número de quem decide não deveria
              estar neste quadro — a qualificação ficou pela metade.
            </p>
          ) : (
            <ul className={estilo.contatos}>
              {cartao.contatos.map((c) => (
                <li key={c.id}>
                  <p className={estilo.contatoNome}>
                    <strong>{c.nome || "nome não anotado"}</strong>
                    {c.e_decisor && <span className={estilo.selo}>decide</span>}
                  </p>
                  {c.cargo && <p className={estilo.cargo}>{c.cargo}</p>}
                  {c.telefone ? (
                    <a className={estilo.telefone} href={`tel:${paraDiscagem(c.telefone)}`}>
                      {c.telefone}
                    </a>
                  ) : (
                    <p className={estilo.furo}>sem telefone</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- o estabelecimento ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>O estabelecimento</h3>
          <dl className={estilo.tabela}>
            {cartao.telefone && (
              <div>
                <dt>Telefone da loja</dt>
                <dd>
                  <a className={estilo.telefone} href={`tel:${paraDiscagem(cartao.telefone)}`}>
                    {cartao.telefone}
                  </a>
                </dd>
              </div>
            )}
            {cartao.endereco && (
              <div>
                <dt>Endereço</dt>
                <dd>{cartao.endereco}</dd>
              </div>
            )}
            {cartao.nota !== null && (
              <div>
                <dt>Google Maps</dt>
                <dd>
                  {cartao.nota.toFixed(1)}
                  {cartao.avaliacoes !== null && ` · ${cartao.avaliacoes} avaliações`}
                </dd>
              </div>
            )}
            {cartao.site && (
              <div>
                <dt>Site</dt>
                <dd>
                  <a href={comProtocolo(cartao.site)} target="_blank" rel="noreferrer noopener">
                    {cartao.site}
                  </a>
                </dd>
              </div>
            )}
            {cartao.instagram && (
              <div>
                <dt>Instagram</dt>
                <dd>{cartao.instagram}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* ---------------- anotar ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>Anotar</h3>
          <textarea
            className={`campo ${estilo.anotacao}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter grava sem sair do campo: quem está ao telefone
              // não solta o teclado para procurar o botão.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={3}
            placeholder="O que ficou combinado? (Ctrl+Enter grava)"
            aria-label={`Anotação sobre ${cartao.nome}`}
          />
          <div className={estilo.acoes}>
            <button
              type="button"
              className="btn btn-forte"
              onClick={() => void enviar()}
              disabled={!texto.trim() || enviando}
            >
              {enviando ? "gravando…" : "Anotar"}
            </button>
            {demonstracao && <span className={estilo.demo}>demonstração: nada vai para o banco</span>}
          </div>
        </section>

        {/* ---------------- histórico ---------------- */}
        <section className={estilo.bloco}>
          <h3 className={estilo.rotulo}>Histórico</h3>
          {cartao.eventos.length === 0 ? (
            <p className={estilo.nada}>Nenhum evento registrado neste lead.</p>
          ) : (
            <ol className={estilo.historico}>
              {cartao.eventos.map((e) => (
                <li key={e.id}>
                  <p className={estilo.linhaEvento}>
                    <span className={estilo.tipo}>{NOMES_DE_EVENTO[e.tipo] ?? e.tipo}</span>
                    <time className={estilo.data}>{quando(e.criado_em)}</time>
                  </p>
                  {e.nota && <p className={estilo.notaEvento}>{e.nota}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
