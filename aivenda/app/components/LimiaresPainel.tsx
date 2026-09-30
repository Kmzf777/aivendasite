"use client";

import CampoTexto from "./CampoTexto";
import {
  LIMIARES_NUMERICOS,
  LIMIARES_PADRAO,
  type ChaveNumerica,
  type Limiares,
  type DescricaoLimiar,
} from "./ObjecoesTipos";
import estilo from "./LimiaresPainel.module.css";

type Props = {
  valor: Limiares;
  onChange: (v: Limiares) => void;
};

export default function LimiaresPainel({ valor, onChange }: Props) {
  const mexer = (mudanca: Partial<Limiares>) => onChange({ ...valor, ...mudanca });

  // Escrita por chave dinâmica sem perder o tipo: ChaveNumerica só aponta para
  // campos number, então o compilador aceita a atribuição.
  const mudarNumero = (chave: ChaveNumerica, n: number) => {
    const novo: Limiares = { ...valor };
    novo[chave] = n;
    onChange(novo);
  };

  const tudoPadrao = LIMIARES_NUMERICOS.every(
    (d) => valor[d.chave] === LIMIARES_PADRAO[d.chave],
  ) && valor.modelo === LIMIARES_PADRAO.modelo;

  return (
    <div className={estilo.painel}>
      <header className={estilo.topo}>
        <span className="rotulo">configuração do motor</span>
        <h2 className={estilo.titulo}>Limiares do Jev</h2>
        <p className={estilo.lema}>
          O Jev responde com um número de 0 a 1 para cada pergunta. Estes são os cortes que decidem
          se o card sobe na tela ou fica quieto. Mais alto = menos card e menos falso positivo; mais
          baixo = mais card e mais ruído.
        </p>
        <button
          type="button"
          className={`btn ${estilo.restaurar}`}
          disabled={tudoPadrao}
          onClick={() => onChange({ ...LIMIARES_PADRAO })}
        >
          {tudoPadrao ? "tudo no padrão" : "restaurar todos os padrões"}
        </button>
      </header>

      <div className={estilo.linhas}>
        {LIMIARES_NUMERICOS.map((d) => (
          <LinhaLimiar
            key={d.chave}
            descricao={d}
            valor={valor[d.chave]}
            onChange={(n) => mudarNumero(d.chave, n)}
          />
        ))}
      </div>

      <div className={estilo.modelo}>
        <CampoTexto
          rotulo="Modelo"
          chave="modelo"
          mono
          explicacao="Fixado de propósito, e não «jev-latest»: num sistema de decisão calibrado, a calibragem não pode mudar sozinha embaixo da aplicação. Se o modelo trocar, todos os limiares acima voltam a ser chute."
          valor={valor.modelo}
          onChange={(v) => mexer({ modelo: v })}
          aviso={
            valor.modelo !== LIMIARES_PADRAO.modelo
              ? `fora do padrão (${LIMIARES_PADRAO.modelo}) — os limiares acima foram medidos nele`
              : undefined
          }
          exemplo={`padrão ${LIMIARES_PADRAO.modelo}`}
        />
        {valor.modelo !== LIMIARES_PADRAO.modelo && (
          <button
            type="button"
            className={estilo.voltarPadrao}
            onClick={() => mexer({ modelo: LIMIARES_PADRAO.modelo })}
          >
            voltar ao padrão
          </button>
        )}
      </div>

      {/* Onde isso vai parar. Sem essa linha o usuário não tem como saber se
          mexer aqui teve efeito de verdade. */}
      <p className={estilo.nota}>
        Os valores são gravados em <code>limiares.json</code>, ao lado do catálogo, e a{" "}
        <strong>/coldcall</strong> os carrega ao abrir — valem já na primeira decisão da call. Os
        padrões acima são os do objeto <code>CONFIG</code> em <code>lib/decisao.js</code>, para onde
        um valor volta se você apagá-lo. Valor fora de 0–1 é recusado em vez de aplicado calado.
      </p>
    </div>
  );
}

function LinhaLimiar({
  descricao,
  valor,
  onChange,
}: {
  descricao: DescricaoLimiar;
  valor: number;
  onChange: (n: number) => void;
}) {
  const padrao = LIMIARES_PADRAO[descricao.chave];
  const fora = valor !== padrao;

  // Sempre em passos de 0,01 e preso entre 0 e 1: é a faixa que o Jev devolve.
  const prender = (n: number) => Math.min(1, Math.max(0, Math.round(n * 100) / 100));

  return (
    <section className={estilo.linha} data-porta={descricao.segundaPorta || undefined}>
      <div className={estilo.linhaCabeca}>
        <div>
          <h3 className={estilo.linhaRotulo}>
            {descricao.rotulo}
            {descricao.segundaPorta && <span className={estilo.selo}>segunda porta</span>}
          </h3>
          <code className={estilo.linhaChave}>{descricao.chave}</code>
        </div>
        <div className={estilo.numeros}>
          <input
            className={estilo.numero}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={valor}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(prender(n));
            }}
            aria-label={`${descricao.rotulo} — valor`}
          />
          <button
            type="button"
            className={estilo.voltarPadrao}
            disabled={!fora}
            onClick={() => onChange(padrao)}
          >
            {fora ? `voltar a ${padrao.toFixed(2)}` : `padrão ${padrao.toFixed(2)}`}
          </button>
        </div>
      </div>

      <p className={estilo.linhaExplicacao}>{descricao.explicacao}</p>

      <div className={estilo.reguaCaixa}>
        <input
          className={estilo.regua}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={valor}
          onChange={(e) => onChange(prender(Number(e.target.value)))}
          aria-label={`${descricao.rotulo} — régua`}
        />
        {/* Marca do padrão: dá para ver de longe o quanto você se afastou dele. */}
        <span
          className={estilo.marcaPadrao}
          style={{ left: `${padrao * 100}%` }}
          aria-hidden
          data-fora={fora || undefined}
        />
        <div className={estilo.escala} aria-hidden>
          <span>0,00 · nunca segura</span>
          <span>1,00 · quase nunca passa</span>
        </div>
      </div>
    </section>
  );
}
