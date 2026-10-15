"use client";

import { useState } from "react";
import type { Resultado } from "@/app/(crm)/leads/acoes";
import LeadModal from "./LeadModal";
import estilo from "./LeadDesqualificar.module.css";

type Props = {
  leadNome: string;
  /** Se já houver um motivo gravado, ele volta no campo para ser corrigido. */
  motivoAtual?: string | null;
  aoEnviar: (motivo: string) => Promise<Resultado>;
  aoFechar: () => void;
};

// Atalhos para os motivos que mais aparecem na prospecção de pet shop. São
// um ponto de partida: o campo continua editável.
const SUGESTOES = [
  "Não atende / número errado",
  "Já tem agência",
  "Rede — decide fora da cidade",
  "Fechou as portas",
  "Não quer presença online",
  "Pediu para não ser contatado",
];

/**
 * O outro lado da dobradiça: o contato aconteceu e o telefone de quem decide
 * NÃO saiu dele. O motivo não é burocracia — é o que impede o próximo
 * vendedor de gastar um contato no mesmo lugar.
 */
export default function LeadDesqualificar({
  leadNome,
  motivoAtual,
  aoEnviar,
  aoFechar,
}: Props) {
  const [motivo, setMotivo] = useState(motivoAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await aoEnviar(motivo);
      // Falhou: o texto fica onde está, para o vendedor só reenviar.
      if (!r.ok) setErro(r.erro);
    } catch (e) {
      setErro(`A ação não chegou ao servidor: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LeadModal
      rotulo={leadNome}
      titulo="Não qualificar"
      erro={erro}
      aoFechar={aoFechar}
      explicacao={
        <>
          Você fez contato e <strong>não saiu com o telefone de quem decide</strong>. Escreva por quê —
          é isso que evita outro vendedor queimar um contato aqui.
        </>
      }
    >
      <form className={estilo.forma} onSubmit={enviar}>
        <label className={estilo.campo}>
          <span className="rotulo">Motivo</span>
          <textarea
            className={`campo ${estilo.motivo}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Em uma linha: o que travou."
            maxLength={400}
            required
          />
        </label>

        <div className={estilo.sugestoes}>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              className={estilo.sugestao}
              onClick={() => setMotivo(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className={estilo.pe}>
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? "Gravando…" : "Marcar como não qualificado"}
          </button>
        </div>
      </form>
    </LeadModal>
  );
}
