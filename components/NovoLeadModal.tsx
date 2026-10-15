"use client";

import { useState } from "react";
import type { LeadNovo, Resultado } from "@/app/(crm)/leads/acoes";
import LeadModal from "./LeadModal";
import estilo from "./NovoLeadModal.module.css";

type Props = {
  aoEnviar: (lead: LeadNovo) => Promise<Resultado>;
  aoFechar: () => void;
};

const VAZIO: LeadNovo = {
  nome: "",
  telefone: "",
  categoria: "",
  endereco: "",
  nota: "",
  avaliacoes: "",
  instagram: "",
  site: "",
  // A regra de operação é: antes de contatar, o lead é seu. Quem digita um lead
  // à mão quase sempre acabou de descobrir ele e vai contatar agora.
  pegarParaMim: true,
};

/**
 * Lead que não veio do raspador: indicação, placa na rua, alguém que ligou.
 * Nome e telefone bastam — o resto é opcional de propósito, porque exigir
 * endereço e nota faria o vendedor desistir de cadastrar.
 */
export default function NovoLeadModal({ aoEnviar, aoFechar }: Props) {
  const [form, setForm] = useState<LeadNovo>(VAZIO);
  const [mais, setMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function mexer<C extends keyof LeadNovo>(campo: C, valor: LeadNovo[C]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await aoEnviar(form);
      // Erro: nada é limpo. O vendedor corrige o que estiver errado e reenvia.
      if (!r.ok) setErro(r.erro);
    } catch (e) {
      setErro(`A ação não chegou ao servidor: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LeadModal
      rotulo="origem manual"
      titulo="Novo lead"
      erro={erro}
      aoFechar={aoFechar}
      explicacao={
        <>
          Nome e telefone bastam. O lead entra marcado como <strong>manual</strong>, separado dos
          117 que vieram do Google Maps.
        </>
      }
    >
      <form className={estilo.forma} onSubmit={enviar}>
        <div className={estilo.dupla}>
          <label className={estilo.campo}>
            <span className="rotulo">Nome</span>
            <input
              className="campo"
              value={form.nome}
              onChange={(e) => mexer("nome", e.target.value)}
              placeholder="Pet Shop do Zé"
              maxLength={200}
              required
            />
          </label>

          <label className={estilo.campo}>
            <span className="rotulo">Telefone</span>
            <input
              className={`campo ${estilo.mono}`}
              value={form.telefone}
              onChange={(e) => mexer("telefone", e.target.value)}
              placeholder="(34) 9____-____"
              inputMode="tel"
              maxLength={40}
              required
            />
          </label>
        </div>

        <label className={estilo.caixinha}>
          <input
            type="checkbox"
            checked={Boolean(form.pegarParaMim)}
            onChange={(e) => mexer("pegarParaMim", e.target.checked)}
          />
          <span>
            Já pegar para mim
            <em>
              Avisa os outros vendedores que você está em cima dele. Desmarque se é só para o poço.
            </em>
          </span>
        </label>

        <button type="button" className={estilo.abrirMais} onClick={() => setMais((m) => !m)}>
          {mais ? "− esconder o resto" : "+ categoria, endereço, nota, links"}
        </button>

        {mais && (
          <div className={estilo.opcionais}>
            <div className={estilo.dupla}>
              <label className={estilo.campo}>
                <span className="rotulo">Categoria</span>
                <input
                  className="campo"
                  value={form.categoria ?? ""}
                  onChange={(e) => mexer("categoria", e.target.value)}
                  placeholder="Pet Shop, Veterinário…"
                  maxLength={120}
                />
              </label>
              <label className={estilo.campo}>
                <span className="rotulo">Endereço</span>
                <input
                  className="campo"
                  value={form.endereco ?? ""}
                  onChange={(e) => mexer("endereco", e.target.value)}
                  placeholder="Rua, número"
                  maxLength={300}
                />
              </label>
            </div>

            <div className={estilo.dupla}>
              <label className={estilo.campo}>
                <span className="rotulo">Nota do Google</span>
                <input
                  className={`campo ${estilo.mono}`}
                  value={form.nota ?? ""}
                  onChange={(e) => mexer("nota", e.target.value)}
                  placeholder="4,7"
                  inputMode="decimal"
                  maxLength={10}
                />
              </label>
              <label className={estilo.campo}>
                <span className="rotulo">Avaliações</span>
                <input
                  className={`campo ${estilo.mono}`}
                  value={form.avaliacoes ?? ""}
                  onChange={(e) => mexer("avaliacoes", e.target.value)}
                  placeholder="105"
                  inputMode="numeric"
                  maxLength={12}
                />
              </label>
            </div>

            <div className={estilo.dupla}>
              <label className={estilo.campo}>
                <span className="rotulo">Instagram</span>
                <input
                  className="campo"
                  value={form.instagram ?? ""}
                  onChange={(e) => mexer("instagram", e.target.value)}
                  placeholder="instagram.com/…"
                  maxLength={300}
                />
              </label>
              <label className={estilo.campo}>
                <span className="rotulo">Site</span>
                <input
                  className="campo"
                  value={form.site ?? ""}
                  onChange={(e) => mexer("site", e.target.value)}
                  placeholder="sem site? deixe vazio — é o seu argumento"
                  maxLength={300}
                />
              </label>
            </div>
          </div>
        )}

        <div className={estilo.pe}>
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-forte" disabled={enviando}>
            {enviando ? "Criando…" : "Criar lead"}
          </button>
        </div>
      </form>
    </LeadModal>
  );
}
