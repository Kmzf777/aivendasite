"use client";

import { useId } from "react";
import estilo from "./CampoTexto.module.css";

/**
 * Cor do fio à esquerda dos três campos que decidem o acerto do sistema.
 * Segue a semântica que globals.css já estabeleceu:
 *   cliente (laranja) = a voz do cliente  -> comoSoa
 *   voce    (azul)    = a sua voz         -> headline
 *   sinal   (âmbar)   = o pivot           -> pivot
 */
export type Destaque = "cliente" | "voce" | "sinal";

type Props = {
  rotulo: string;
  /** O nome técnico do campo, em mono. É o que aparece no objecoes.json. */
  chave?: string;
  explicacao?: string;
  valor: string;
  onChange: (valor: string) => void;
  multilinha?: boolean;
  linhas?: number;
  mono?: boolean;
  placeholder?: string;
  destaque?: Destaque;
  /** Exemplo curto, mostrado abaixo do campo. */
  exemplo?: string;
  /** Campo travado com o motivo à mostra (o caso do id). */
  travado?: boolean;
  motivoTravado?: string;
  /** Alerta amarelo: o campo funciona, mas assim o sistema erra mais. */
  aviso?: string;
  /** Erro vermelho: assim não salva. */
  erro?: string;
  /** Vira um <select> com estas opções. */
  opcoes?: { valor: string; rotulo: string }[];
  /** Idioma do corretor. O comoSoa é escrito em inglês de propósito. */
  idioma?: string;
  contador?: boolean;
};

export default function CampoTexto({
  rotulo,
  chave,
  explicacao,
  valor,
  onChange,
  multilinha,
  linhas = 4,
  mono,
  placeholder,
  destaque,
  exemplo,
  travado,
  motivoTravado,
  aviso,
  erro,
  opcoes,
  idioma,
  contador,
}: Props) {
  const id = useId();
  const classes = [estilo.campo, mono ? estilo.mono : "", erro ? estilo.comErro : ""].join(" ");

  return (
    <div
      className={estilo.caixa}
      data-destaque={destaque || undefined}
      data-travado={travado || undefined}
    >
      <label className={estilo.cabeca} htmlFor={id}>
        <span className={estilo.rotulo}>{rotulo}</span>
        {chave && <code className={estilo.chave}>{chave}</code>}
        {travado && (
          <span className={estilo.cadeado} title={motivoTravado}>
            travado
          </span>
        )}
      </label>

      {explicacao && <p className={estilo.explicacao}>{explicacao}</p>}

      {opcoes ? (
        <select
          id={id}
          className={`campo ${classes} ${estilo.seletor}`}
          value={valor}
          disabled={travado}
          onChange={(e) => onChange(e.target.value)}
        >
          {/* Se o arquivo trouxe um valor fora da lista, ele entra como opção
              extra: a tela não pode reescrever silenciosamente o dado. */}
          {!opcoes.some((o) => o.valor === valor) && valor !== "" && (
            <option value={valor}>{valor} (fora da lista)</option>
          )}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      ) : multilinha ? (
        <textarea
          id={id}
          className={`campo ${classes}`}
          value={valor}
          rows={linhas}
          placeholder={placeholder}
          readOnly={travado}
          lang={idioma}
          spellCheck={idioma ? undefined : false}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className={`campo ${classes}`}
          value={valor}
          placeholder={placeholder}
          readOnly={travado}
          lang={idioma}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {(exemplo || contador || aviso || erro || (travado && motivoTravado)) && (
        <div className={estilo.pe}>
          {erro && <span className={estilo.erro}>{erro}</span>}
          {!erro && aviso && <span className={estilo.aviso}>{aviso}</span>}
          {!erro && !aviso && travado && motivoTravado && (
            <span className={estilo.nota}>{motivoTravado}</span>
          )}
          {!erro && !aviso && !travado && exemplo && (
            <span className={estilo.nota}>{exemplo}</span>
          )}
          {contador && (
            <span className={estilo.contador}>
              {valor.trim().length ? `${valor.trim().length} caracteres` : "vazio"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
