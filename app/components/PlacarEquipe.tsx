"use client";

import type { Vendedor } from "@/app/(crm)/leads/carregar";
import estilo from "./PlacarEquipe.module.css";

type Props = {
  semDono: number;
  meus: number;
  deOutros: number;
  total: number;
  vendedores: Vendedor[];
  meuId: string | null;
  /** Clicar numa fatia da barra filtra a lista. */
  aoFiltrar: (f: "sem_dono" | "com_dono" | "meus") => void;
  filtro: string;
};

export default function PlacarEquipe({
  semDono,
  meus,
  deOutros,
  total,
  vendedores,
  meuId,
  aoFiltrar,
  filtro,
}: Props) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const comDono = meus + deOutros;

  // A equipe inteira, menos quem nunca encostou num lead. Mostrar cinco
  // cartões zerados empurra para baixo quem está produzindo — o placar
  // existe para dar vontade de aparecer nele, não para catalogar gente.
  const noPlacar = vendedores.filter(
    (v) => v.fechados + v.qualificados + v.emContato > 0 || v.id === meuId
  );

  return (
    <section className={estilo.placar}>
      {/* ----- a barra ----- */}
      <div className={estilo.barra} role="group" aria-label="Posse dos leads">
        <button
          type="button"
          className={estilo.fatia}
          data-tom="livre"
          data-ativo={filtro === "sem_dono"}
          style={{ width: `${pct(semDono)}%` }}
          onClick={() => aoFiltrar("sem_dono")}
          title={`${semDono} sem dono`}
          aria-label={`Filtrar os ${semDono} leads sem dono`}
        />
        <button
          type="button"
          className={estilo.fatia}
          data-tom="meu"
          data-ativo={filtro === "meus"}
          style={{ width: `${pct(meus)}%` }}
          onClick={() => aoFiltrar("meus")}
          title={`${meus} seus`}
          aria-label={`Filtrar os ${meus} leads que são seus`}
        />
        <button
          type="button"
          className={estilo.fatia}
          data-tom="outro"
          data-ativo={filtro === "com_dono"}
          style={{ width: `${pct(deOutros)}%` }}
          onClick={() => aoFiltrar("com_dono")}
          title={`${deOutros} com outros vendedores`}
          aria-label={`Filtrar os ${comDono} leads que já têm dono`}
        />
      </div>

      <div className={estilo.legenda}>
        <button type="button" className={estilo.marcador} data-tom="livre" onClick={() => aoFiltrar("sem_dono")}>
          <strong>{semDono}</strong> sem dono
        </button>
        <button type="button" className={estilo.marcador} data-tom="meu" onClick={() => aoFiltrar("meus")}>
          <strong>{meus}</strong> seus
        </button>
        <button type="button" className={estilo.marcador} data-tom="outro" onClick={() => aoFiltrar("com_dono")}>
          <strong>{comDono}</strong> com dono
        </button>
      </div>

      {/* ----- os vendedores ----- */}
      {noPlacar.length > 0 && (
        <ul className={estilo.vendedores}>
          {noPlacar.map((v) => {
            const euMesmo = v.id === meuId;
            return (
              <li key={v.id} className={estilo.cartao} data-eu={euMesmo}>
                <div className={estilo.quem}>
                  <span className={estilo.inicial} aria-hidden>
                    {(v.nome.trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className={estilo.nome}>
                    {v.nome}
                    {euMesmo && <em> você</em>}
                  </span>
                </div>

                <div className={estilo.numeros}>
                  {/* Fechado primeiro, e maior: é o desfecho. Qualificado é
                      meio do caminho, e "na mão" é só promessa. */}
                  <span className={estilo.numero} data-tom="ganho">
                    <strong>{v.fechados}</strong>
                    <em>fechados</em>
                  </span>
                  <span className={estilo.numero} data-tom="ok">
                    <strong>{v.qualificados}</strong>
                    <em>qualificados</em>
                  </span>
                  <span className={estilo.numero}>
                    <strong>{v.emContato}</strong>
                    <em>na mão</em>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
