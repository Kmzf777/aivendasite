"use client";

import { useId, useState } from "react";
import type { ItemColhido } from "@/hooks/motorCopiloto";
import estilo from "./FimDaLigacao.module.css";

type Props = {
  resultado: { confirmar: ItemColhido[]; naoFez: { id: string; dica: string }[] };
  aoConfirmar: (itens: ItemColhido[]) => void;
  aoDescartar: () => void;
};

// O item com a decisão do vendedor pendurada. `campo` e `trecho` não mudam:
// são o que foi dito. Só `valor` e `marcado` são dele.
type Linha = ItemColhido & { marcado: boolean };

// Telefone é o que o ASR erra mais, e um dígito trocado só salta aos olhos
// em monoespaçada com dígito de largura fixa. Decide pelo conteúdo, não pelo
// nome do campo: `campo` é texto de catálogo e pode ser reescrito lá.
function pareceNumero(valor: string) {
  const digitos = valor.replace(/\D/g, "").length;
  return digitos >= 6 && digitos >= valor.length / 2;
}

// ==================================================================
// A tela de fim de ligação — o portão entre o que o sistema ACHOU que
// ouviu e a ficha do lead.
//
// Durante a call, lib/colheita.js casa padrões de texto e junta telefone,
// nome de quem atendeu, nome do dono e melhor horário. Nada disso foi
// salvo: palpite de regex em cima de ASR acerta muito e erra feio, e o
// erro é silencioso. "O Vicente não trabalha mais aqui" casa o padrão de
// dono e vira "dono: Vicente" — ficha errada, e na próxima ligação o
// vendedor pede pelo Vicente.
//
// Daí as três coisas que esta tela não pode perder:
//   1. o TRECHO ao lado do valor — é ele que faz o descarte custar dois
//      segundos em vez de uma conferência;
//   2. desmarcar linha por linha — o padrão certo e o palpite ruim chegam
//      com a mesma cara;
//   3. valor editável — o ASR erra dígito, e corrigir aqui é mais barato
//      que abrir a ficha depois.
// ==================================================================
export default function FimDaLigacao({ resultado, aoConfirmar, aoDescartar }: Props) {
  // POR QUE o estado nasce das props e NUNCA ressincroniza com elas:
  // `motor.fim()` monta um objeto novo a cada chamada. Se a tela o chamar
  // dentro do próprio render, cada re-render traria `resultado` com outra
  // identidade — e um efeito de sincronia apagaria o que o vendedor acabou
  // de digitar. A ligação acabou: este resultado é uma foto. Para mostrar
  // outra ligação, o ponto de uso remonta com `key`.
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    resultado.confirmar.map((item) => ({ ...item, marcado: true })),
  );
  // O pai pode levar um quadro para desmontar esta tela. Sem a trava, o
  // segundo clique manda os mesmos itens de novo para a ficha.
  const [enviado, setEnviado] = useState(false);

  const prefixo = useId();

  // Valor apagado não vai para a ficha nem marcado: campo em branco é pior
  // que campo ausente, porque parece preenchido e conferido.
  const prontos = linhas.filter((l) => l.marcado && l.valor.trim() !== "");

  const alternar = (i: number) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, marcado: !l.marcado } : l)));

  const editar = (i: number, valor: string) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, valor } : l)));

  const salvar = () => {
    if (enviado) return;
    setEnviado(true);
    // Só o que está marcado, com o valor como ele ficou na tela. O `trecho`
    // viaja junto: é a origem do dado, e quem olhar a ficha depois vai
    // querer saber de onde saiu aquele nome.
    aoConfirmar(prontos.map(({ campo, valor, trecho }) => ({ campo, valor: valor.trim(), trecho })));
  };

  const fechar = () => {
    if (enviado) return;
    setEnviado(true);
    aoDescartar();
  };

  const naoFez = resultado.naoFez;
  const vazio = linhas.length === 0;

  return (
    // Sem tecla de atalho para fechar, e de propósito: ESC aqui jogaria no
    // lixo a única cópia do que a ligação colheu. Sair é um clique dito.
    <div className={estilo.fundo}>
      <section
        className={estilo.quadro}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${prefixo}-titulo`}
      >
        <header className={estilo.topo}>
          <span className="rotulo">fim da ligação</span>
          <h2 id={`${prefixo}-titulo`} className={estilo.titulo}>
            {vazio ? "Nada para anotar" : "Confira antes de salvar"}
          </h2>
        </header>

        {vazio ? (
          <p className={estilo.explica}>
            A ligação não deixou telefone, nome nem horário para a ficha. Nada foi salvo.
          </p>
        ) : (
          <>
            <p className={estilo.explica}>
              Isto saiu do que foi dito na ligação, por padrão de texto — é palpite, não registro.
              O trecho embaixo de cada campo é a frase que o gerou. Só vai para a ficha o que
              ficar marcado.
            </p>

            <ul className={estilo.lista}>
              {linhas.map((l, i) => {
                const idValor = `${prefixo}-v${i}`;
                const branco = l.valor.trim() === "";
                return (
                  // A chave é o índice porque `campo` repete: dois telefones
                  // citados na mesma ligação chegam com o mesmo rótulo.
                  <li
                    key={i}
                    className={`${estilo.linha} ${l.marcado ? "" : estilo.fora} ${
                      l.marcado && branco ? estilo.branca : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className={estilo.caixa}
                      checked={l.marcado}
                      onChange={() => alternar(i)}
                      // O rótulo visível pertence ao campo de texto; a caixa
                      // precisa do dela para o leitor de tela dizer o que
                      // está sendo descartado.
                      aria-label={`Salvar ${l.campo}`}
                      disabled={enviado}
                    />

                    <div className={estilo.corpo}>
                      <label className="rotulo" htmlFor={idValor}>
                        {l.campo}
                      </label>
                      <input
                        id={idValor}
                        className={`campo ${estilo.valor} ${
                          pareceNumero(l.valor) ? estilo.digitos : ""
                        }`}
                        value={l.valor}
                        onChange={(e) => editar(i, e.target.value)}
                        maxLength={120}
                        inputMode={pareceNumero(l.valor) ? "tel" : "text"}
                        disabled={enviado}
                      />
                      {l.trecho && <p className={estilo.trecho}>{l.trecho}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {naoFez.length > 0 && (
          // Nota de rodapé, não cobrança: cinza, embaixo, depois do que
          // importa. Em vermelho isto viraria boletim de erro, e o vendedor
          // aprenderia a fechar a tela sem ler — levando a confirmação junto.
          <section className={estilo.sobrou}>
            <span className="rotulo">ficou para a próxima</span>
            <ul>
              {naoFez.map((x) => (
                <li key={x.id}>{x.dica}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className={estilo.pe}>
          {vazio ? (
            <button type="button" className="btn" onClick={fechar} disabled={enviado}>
              Fechar
            </button>
          ) : (
            <>
              <button type="button" className={estilo.descartar} onClick={fechar} disabled={enviado}>
                Descartar tudo
              </button>
              <button
                type="button"
                className={`btn btn-forte ${estilo.salvar}`}
                onClick={salvar}
                disabled={enviado || prontos.length === 0}
              >
                {prontos.length === 0
                  ? "Nada marcado"
                  : `Salvar ${prontos.length} ${prontos.length === 1 ? "item" : "itens"}`}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
