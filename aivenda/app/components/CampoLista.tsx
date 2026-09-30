"use client";

import { useId, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import estilo from "./CampoLista.module.css";

type Props = {
  rotulo: string;
  chave?: string;
  explicacao?: string;
  valor: string[];
  onChange: (valor: string[]) => void;
  placeholder?: string;
};

/**
 * Editor de array de palavras (o campo `nucleos`).
 *
 * Enter ou vírgula confirma. Colar uma lista separada por vírgula ou por linha
 * entra tudo de uma vez — é assim que se traz um bloco de núcleos de uma
 * transcrição sem digitar item por item.
 */
export default function CampoLista({
  rotulo,
  chave,
  explicacao,
  valor,
  onChange,
  placeholder,
}: Props) {
  const id = useId();
  const [rascunho, setRascunho] = useState("");
  const [repetido, setRepetido] = useState<string | null>(null);

  function somar(bruto: string) {
    const novos = bruto
      .split(/[,\n;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!novos.length) return;

    const jaTem: string[] = [];
    const lista = [...valor];
    for (const n of novos) {
      if (lista.some((v) => v.toLowerCase() === n.toLowerCase())) jaTem.push(n);
      else lista.push(n);
    }
    setRepetido(jaTem.length ? jaTem[0] : null);
    if (lista.length !== valor.length) onChange(lista);
    setRascunho("");
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      somar(rascunho);
      return;
    }
    // Backspace com o campo vazio apaga o último núcleo: atalho de quem
    // está limpando a lista rápido.
    if (e.key === "Backspace" && rascunho === "" && valor.length) {
      e.preventDefault();
      onChange(valor.slice(0, -1));
    }
  }

  function colar(e: ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text");
    if (/[,\n;]/.test(texto)) {
      e.preventDefault();
      somar(rascunho + texto);
    }
  }

  return (
    <div className={estilo.caixa}>
      <label className={estilo.cabeca} htmlFor={id}>
        <span className={estilo.rotulo}>{rotulo}</span>
        {chave && <code className={estilo.chave}>{chave}</code>}
        <span className={estilo.conta}>{valor.length}</span>
      </label>

      {explicacao && <p className={estilo.explicacao}>{explicacao}</p>}

      <div className={estilo.corral}>
        {valor.map((n, i) => (
          <span key={`${n}-${i}`} className={estilo.ficha}>
            {n}
            <button
              type="button"
              className={estilo.tirar}
              aria-label={`remover ${n}`}
              onClick={() => onChange(valor.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className={estilo.entrada}
          value={rascunho}
          placeholder={valor.length ? "+ núcleo" : placeholder || "digite e aperte Enter"}
          spellCheck={false}
          onChange={(e) => {
            setRascunho(e.target.value);
            setRepetido(null);
          }}
          onKeyDown={tecla}
          onPaste={colar}
          onBlur={() => somar(rascunho)}
        />
      </div>

      <div className={estilo.pe}>
        {repetido ? (
          <span className={estilo.aviso}>«{repetido}» já estava na lista</span>
        ) : (
          <span className={estilo.nota}>
            Enter ou vírgula confirma · colar uma lista separada por vírgula entra tudo de uma vez
          </span>
        )}
      </div>
    </div>
  );
}
