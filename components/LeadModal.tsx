"use client";

import { useEffect, useRef } from "react";
import estilo from "./LeadModal.module.css";

type Props = {
  titulo: string;
  /** A linha de cima, em caixa alta: diz QUAL lead está sendo mexido. */
  rotulo?: string;
  /** Uma frase explicando o que a ação significa. Aqui não é decoração. */
  explicacao?: React.ReactNode;
  /** Mensagem de erro da última tentativa. Fica dentro do modal, junto do que foi digitado. */
  erro?: string | null;
  aoFechar: () => void;
  children: React.ReactNode;
};

/**
 * Casca dos três formulários do poço (qualificar, não qualificar, novo lead).
 * Existe para a sobreposição, o Escape e o foco inicial não serem escritos
 * três vezes com três comportamentos diferentes.
 */
export default function LeadModal({
  titulo,
  rotulo,
  explicacao,
  erro,
  aoFechar,
  children,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLParagraphElement>(null);

  // Numa tela baixa o erro nasce abaixo da dobra, e um erro que ninguém vê
  // é o mesmo que falhar em silêncio. Então a tela vai até ele.
  useEffect(() => {
    if (erro) aviso.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [erro]);

  useEffect(() => {
    // Foco no primeiro campo: quem abre isto está com o telefone na mão.
    const primeiro = caixa.current?.querySelector<HTMLElement>(
      "input:not([type=checkbox]), textarea"
    );
    primeiro?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    // Clique no fundo NÃO fecha, de propósito. Estes formulários são
    // preenchidos durante o contato, e perder o telefone do dono por um
    // clique torto é o pior que esta tela pode fazer. Sair é no ✕, no
    // Cancelar ou no Escape — todos deliberados.
    <div className={estilo.fundo}>
      <div className={estilo.caixa} role="dialog" aria-modal="true" aria-label={titulo} ref={caixa}>
        <header className={estilo.topo}>
          <div>
            {rotulo && <span className="rotulo">{rotulo}</span>}
            <h2 className={estilo.titulo}>{titulo}</h2>
          </div>
          <button type="button" className={estilo.fechar} onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </header>

        {explicacao && <p className={estilo.explicacao}>{explicacao}</p>}

        {children}

        {/* O erro mora aqui embaixo, dentro do modal, porque o que o usuário
            digitou continua na tela e ele precisa dos dois juntos. */}
        {erro && (
          <p className={estilo.erro} role="alert" ref={aviso}>
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
