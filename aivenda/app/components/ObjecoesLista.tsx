"use client";

import { useMemo, useState } from "react";
import { TIPOS, type Linha } from "./ObjecoesTipos";
import estilo from "./ObjecoesLista.module.css";

/** Chave de seleção da aba dos limiares. Não é a chave de nenhuma linha. */
export const ALVO_LIMIARES = "__limiares__";

type Props = {
  linhas: Linha[];
  /** Chave da linha selecionada, ou ALVO_LIMIARES. */
  selecao: string;
  onSelecionar: (alvo: string) => void;
  /** Chaves com edição pendente de salvar. */
  alteradas: Set<string>;
  /** Chaves criadas nesta sessão e que ainda não foram para o disco. */
  novas: Set<string>;
  limiaresAlterados: boolean;
  onNova: () => void;
};

export default function ObjecoesLista({
  linhas,
  selecao,
  onSelecionar,
  alteradas,
  novas,
  limiaresAlterados,
  onNova,
}: Props) {
  const [busca, setBusca] = useState("");

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // A busca varre também o comoSoa e os núcleos: é lá que está a fala do
    // cliente, e é por ela que a gente costuma procurar ("quem falou de preço?").
    const filtradas = q
      ? linhas.filter((l) =>
          [l.dado.id, l.dado.nome, l.dado.headline, l.dado.comoSoa, l.dado.pivot, l.dado.nucleos.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : linhas;

    const ordem = [...TIPOS.map((t) => t.valor)];
    for (const l of filtradas) if (!ordem.includes(l.dado.tipo)) ordem.push(l.dado.tipo);

    return ordem
      .map((tipo) => ({
        tipo,
        rotulo: TIPOS.find((t) => t.valor === tipo)?.rotulo || tipo,
        itens: filtradas.filter((l) => l.dado.tipo === tipo),
      }))
      .filter((g) => g.itens.length > 0);
  }, [linhas, busca]);

  const achados = grupos.reduce((n, g) => n + g.itens.length, 0);

  return (
    <nav className={estilo.trilha} aria-label="Catálogo de objeções">
      <button
        type="button"
        className={estilo.limiares}
        data-ativo={selecao === ALVO_LIMIARES || undefined}
        onClick={() => onSelecionar(ALVO_LIMIARES)}
      >
        <span className={estilo.limiaresRotulo}>Limiares do Jev</span>
        <span className={estilo.limiaresNota}>as portas que liberam o card</span>
        {limiaresAlterados && <span className={estilo.pinta} data-tom="alterado" />}
      </button>

      <div className={estilo.buscaCaixa}>
        <input
          className={`campo ${estilo.busca}`}
          value={busca}
          placeholder="buscar por nome, id, fala do cliente…"
          spellCheck={false}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button
            type="button"
            className={estilo.limpar}
            aria-label="limpar busca"
            onClick={() => setBusca("")}
          >
            ×
          </button>
        )}
      </div>

      <div className={estilo.contagem}>
        <span className="telemetria">
          {busca ? `${achados} de ${linhas.length}` : `${linhas.length} no catálogo`}
        </span>
        <button type="button" className={estilo.nova} onClick={onNova}>
          + nova
        </button>
      </div>

      <div className={estilo.rolo}>
        {grupos.length === 0 && <p className={estilo.vazio}>Nada casou com «{busca}».</p>}

        {grupos.map((g) => (
          <section key={g.tipo} className={estilo.grupo}>
            <h3 className={estilo.grupoTitulo}>
              {g.rotulo}
              <span>{g.itens.length}</span>
            </h3>
            <ul>
              {g.itens.map((l) => {
                // Faltando um dos três campos-chave, o card não funciona na
                // call. A lista avisa antes de a ligação acontecer.
                const incompleta =
                  !l.dado.comoSoa.trim() || !l.dado.headline.trim() || !l.dado.pivot.trim();
                return (
                  <li key={l.chave}>
                    <button
                      type="button"
                      className={estilo.item}
                      data-ativo={selecao === l.chave || undefined}
                      onClick={() => onSelecionar(l.chave)}
                    >
                      <span className={estilo.itemNome}>
                        {l.dado.nome || l.dado.id || "sem nome"}
                      </span>
                      <span className={estilo.itemId}>{l.dado.id || "sem_id"}</span>
                      <span className={estilo.marcas}>
                        {incompleta && (
                          <span
                            className={estilo.pinta}
                            data-tom="incompleta"
                            title="falta comoSoa, headline ou pivot"
                          />
                        )}
                        {novas.has(l.chave) ? (
                          <span className={estilo.etiqueta} data-tom="nova">
                            nova
                          </span>
                        ) : alteradas.has(l.chave) ? (
                          <span
                            className={estilo.pinta}
                            data-tom="alterado"
                            title="editada, não salva"
                          />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
