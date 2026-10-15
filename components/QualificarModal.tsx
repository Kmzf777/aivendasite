"use client";

import { useState } from "react";
import type { ContatoNovo, Resultado } from "@/app/(crm)/leads/acoes";
import LeadModal from "./LeadModal";
import estilo from "./QualificarModal.module.css";

type Props = {
  leadNome: string;
  /** O telefone que veio da lista do Maps. Pode já ser o do dono. */
  telefoneDaLista: string | null;
  /** True quando o lead já está qualificado: aqui a gente só soma um contato. */
  jaQualificado: boolean;
  aoEnviar: (contato: ContatoNovo) => Promise<Resultado>;
  aoFechar: () => void;
};

const CARGOS = ["Dono", "Dona", "Sócio", "Sócia", "Gerente", "Responsável pelo marketing"];

/**
 * O formulário que define o produto.
 *
 * Qualificar aqui NÃO é dizer "tem dor e verba". É um fato binário: ou o
 * vendedor saiu do contato com o telefone de quem decide, ou não saiu. Este
 * modal só existe para capturar esse contato — se ele não for preenchido, o
 * lead não vira qualificado, porque não estaria.
 */
export default function QualificarModal({
  leadNome,
  telefoneDaLista,
  jaQualificado,
  aoEnviar,
  aoFechar,
}: Props) {
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await aoEnviar({ nome, cargo, telefone });
      // Em caso de erro NÃO fecho e NÃO limpo: o que foi digitado continua
      // na tela, porque relembrar o nome do dono depois do contato é caro.
      if (!r.ok) setErro(r.erro);
    } catch (e) {
      setErro(`A ação não chegou ao servidor: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // Sempre: botão nenhum fica girando para sempre.
      setEnviando(false);
    }
  }

  return (
    <LeadModal
      rotulo={leadNome}
      titulo={jaQualificado ? "Mais um contato" : "Qualificar"}
      erro={erro}
      aoFechar={aoFechar}
      explicacao={
        jaQualificado ? (
          <>
            Este lead já está qualificado. O que você grava aqui é{" "}
            <strong>outro contato de quem decide</strong>.
          </>
        ) : (
          <>
            Qualificar quer dizer uma coisa só: <strong>você tem o contato de quem decide</strong>.
            Não é achar que tem verba — é ter o número do dono ou do gerente na mão. É este o ativo
            que o contato produziu.
          </>
        )
      }
    >
      <form className={estilo.forma} onSubmit={enviar}>
        <label className={estilo.campo}>
          <span className="rotulo">Quem decide</span>
          <input
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome de quem bate o martelo"
            maxLength={120}
            required
          />
        </label>

        <label className={estilo.campo}>
          <span className="rotulo">Cargo (opcional)</span>
          <input
            className="campo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Dono, gerente, sócio…"
            list="cargos-decisor"
            maxLength={120}
          />
          <datalist id="cargos-decisor">
            {CARGOS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className={estilo.campo}>
          <span className="rotulo">Telefone de quem decide</span>
          <input
            className={`campo ${estilo.mono}`}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(34) 9____-____"
            inputMode="tel"
            maxLength={40}
            required
          />
          {/* Caminho curto para o caso descrito na regra: às vezes o número
              que já estava na lista do Maps é o celular do próprio dono. */}
          {telefoneDaLista && telefoneDaLista !== telefone && (
            <button
              type="button"
              className={estilo.atalho}
              onClick={() => setTelefone(telefoneDaLista)}
            >
              o número da lista <code>{telefoneDaLista}</code> já é de quem decide
            </button>
          )}
        </label>

        <div className={estilo.pe}>
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-forte" disabled={enviando}>
            {enviando ? "Gravando…" : jaQualificado ? "Gravar contato" : "Qualificar lead"}
          </button>
        </div>
      </form>
    </LeadModal>
  );
}
