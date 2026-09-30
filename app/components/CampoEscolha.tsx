"use client";

import estilo from "./CampoEscolha.module.css";

type Opcao = { valor: string; rotulo: string };

type PropsSegmentado = {
  rotulo: string;
  chave?: string;
  explicacao?: string;
  valor: string;
  opcoes: Opcao[];
  onChange: (valor: string) => void;
};

/**
 * Controle segmentado — mostrador de equipamento, não dropdown.
 * Se o valor do arquivo não estiver entre as opções conhecidas, ele entra como
 * um segmento extra: a tela nunca troca um dado do catálogo por conta própria.
 */
export function CampoSegmentado({
  rotulo,
  chave,
  explicacao,
  valor,
  opcoes,
  onChange,
}: PropsSegmentado) {
  const conhecido = opcoes.some((o) => o.valor === valor);
  const todas = conhecido || valor === "" ? opcoes : [...opcoes, { valor, rotulo: valor }];

  return (
    <div className={estilo.caixa}>
      <div className={estilo.cabeca}>
        <span className={estilo.rotulo}>{rotulo}</span>
        {chave && <code className={estilo.chave}>{chave}</code>}
      </div>
      {explicacao && <p className={estilo.explicacao}>{explicacao}</p>}
      <div className={estilo.trilho} role="group" aria-label={rotulo}>
        {todas.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={estilo.segmento}
            data-ativo={o.valor === valor || undefined}
            onClick={() => onChange(o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

type PropsInterruptor = {
  rotulo: string;
  chave?: string;
  explicacao?: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
  textoLigado?: string;
  textoDesligado?: string;
};

/** Booleano. Um interruptor com o estado escrito ao lado, não só a posição. */
export function CampoInterruptor({
  rotulo,
  chave,
  explicacao,
  valor,
  onChange,
  textoLigado = "sim",
  textoDesligado = "não",
}: PropsInterruptor) {
  return (
    <div className={estilo.caixa}>
      <div className={estilo.cabeca}>
        <span className={estilo.rotulo}>{rotulo}</span>
        {chave && <code className={estilo.chave}>{chave}</code>}
      </div>
      {explicacao && <p className={estilo.explicacao}>{explicacao}</p>}
      <button
        type="button"
        className={estilo.chave_switch}
        role="switch"
        aria-checked={valor}
        data-ligado={valor || undefined}
        onClick={() => onChange(!valor)}
      >
        <span className={estilo.pista}>
          <span className={estilo.botao} />
        </span>
        <span className={estilo.estadoTexto}>{valor ? textoLigado : textoDesligado}</span>
      </button>
    </div>
  );
}
