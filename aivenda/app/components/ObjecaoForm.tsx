"use client";

import { useState } from "react";
import CampoTexto from "./CampoTexto";
import CampoLista from "./CampoLista";
import { CampoSegmentado, CampoInterruptor } from "./CampoEscolha";
import { camposExtras, paraId, EVIDENCIAS, TIPOS, type Objecao } from "./ObjecoesTipos";
import estilo from "./ObjecaoForm.module.css";

type Props = {
  objecao: Objecao;
  onChange: (o: Objecao) => void;
  onRemover: () => void;
  /** Depois que o id foi para o disco ele trava: é a chave que o Jev devolve. */
  idTravado: boolean;
  /** Ids das OUTRAS objeções, para avisar de colisão antes de tentar salvar. */
  idsOcupados: Set<string>;
  alterada: boolean;
};

export default function ObjecaoForm({
  objecao,
  onChange,
  onRemover,
  idTravado,
  idsOcupados,
  alterada,
}: Props) {
  const [confirmando, setConfirmando] = useState(false);

  /**
   * Toda edição passa por aqui. O spread do objeto INTEIRO é o que preserva os
   * campos que este formulário não mostra: eles nunca saem do estado, então
   * voltam para o disco exatamente como vieram.
   */
  const mexer = (mudanca: Partial<Objecao>) => onChange({ ...objecao, ...mudanca });

  const extras = camposExtras(objecao);

  const erroId =
    objecao.id.trim() === ""
      ? "sem id não salva"
      : idsOcupados.has(objecao.id)
        ? "outra objeção já usa este id"
        : objecao.id !== paraId(objecao.id)
          ? "use só minúsculas, números e _ (sugestão: " + paraId(objecao.id) + ")"
          : undefined;

  return (
    <div className={estilo.forma}>
      <header className={estilo.topo}>
        <div className={estilo.identificacao}>
          <code className={estilo.id}>{objecao.id || "sem_id"}</code>
          <span className={estilo.selo} data-tipo={objecao.tipo}>
            {TIPOS.find((t) => t.valor === objecao.tipo)?.rotulo || objecao.tipo}
          </span>
          {alterada && <span className={estilo.alterada}>alterada</span>}
        </div>
        <h2 className={estilo.nome}>{objecao.nome || "sem nome"}</h2>
      </header>

      {/* ---------------- os três que decidem o acerto ---------------- */}
      <section className={estilo.bloco}>
        <div className={estilo.tituloBloco}>
          <h3>O que decide o acerto</h3>
          <p>
            Se o card certo aparece na hora certa, é por causa destes três campos. O resto do
            formulário é catalogação.
          </p>
        </div>

        <CampoTexto
          rotulo="Como soa na boca do cliente"
          chave="comoSoa"
          destaque="cliente"
          explicacao="A descrição que o Jev compara com a fala do cliente — o campo que mais afeta o acerto. Escreva como a objeção SOA quando o cliente fala, não o nome dela, e diga também o que ela NÃO é, para não roubar a fala de outra objeção. Fica em inglês de propósito: é onde o Jev acerta mais."
          valor={objecao.comoSoa}
          onChange={(v) => mexer({ comoSoa: v })}
          multilinha
          linhas={6}
          idioma="en"
          contador
          placeholder="The customer says..."
          aviso={
            objecao.comoSoa.trim().length === 0
              ? "vazio: o Jev não tem como casar esta objeção com nenhuma fala"
              : objecao.comoSoa.trim().length < 120
                ? "curto. As descrições que acertam mais dizem também o que a objeção NÃO é"
                : undefined
          }
        />

        <CampoTexto
          rotulo="Headline do card"
          chave="headline"
          destaque="voce"
          explicacao="A frase curta que acende no card durante a call. É o que você vai falar. Tem que ser lida de relance, com o cliente falando no seu ouvido."
          valor={objecao.headline}
          onChange={(v) => mexer({ headline: v })}
          exemplo="ex.: «Caro comparado com quê»"
          aviso={
            objecao.headline.trim() === ""
              ? "sem headline o card não tem o que mostrar"
              : objecao.headline.length > 42
                ? `${objecao.headline.length} caracteres — longo para ler em um segundo`
                : undefined
          }
        />

        <CampoTexto
          rotulo="Pivot"
          chave="pivot"
          destaque="sinal"
          explicacao="A regra tática que evita o erro clássico desta objeção. É o lembrete que impede você de fazer a besteira óbvia no calor da hora."
          valor={objecao.pivot}
          onChange={(v) => mexer({ pivot: v })}
          multilinha
          linhas={2}
          exemplo="ex.: «Não desça de preço antes do não.»"
          aviso={objecao.pivot.trim() === "" ? "sem pivot o card perde a regra" : undefined}
        />

        {/* Prévia esquemática: a ordem em que o vendedor lê o card na call. */}
        <div className={estilo.previa}>
          <span className="rotulo">prévia do card</span>
          <p className={estilo.previaHeadline}>{objecao.headline || "headline"}</p>
          <p className={estilo.previaArgumento}>
            {objecao.argumento || "o argumento completo aparece aqui"}
          </p>
          <p className={estilo.previaPivot}>{objecao.pivot || "o pivot aparece aqui"}</p>
        </div>
      </section>

      {/* ---------------- identidade ---------------- */}
      <section className={estilo.bloco}>
        <div className={estilo.tituloBloco}>
          <h3>Identidade</h3>
          <p>Como esta objeção é chamada e de onde ela veio.</p>
        </div>

        <div className={estilo.duasColunas}>
          <CampoTexto
            rotulo="Id"
            chave="id"
            valor={objecao.id}
            onChange={(v) => mexer({ id: paraId(v) })}
            mono
            travado={idTravado}
            motivoTravado="É a chave que o Jev devolve para dizer qual objeção é. Trocar depois quebra todo histórico e tudo que aponta para cá — por isso só se escreve uma vez."
            erro={erroId}
            exemplo="minúsculas, sem acento, separado por _"
          />
          <CampoTexto
            rotulo="Nome"
            chave="nome"
            explicacao="Só para você achar na lista. Não entra na decisão."
            valor={objecao.nome}
            onChange={(v) => mexer({ nome: v })}
            aviso={objecao.nome.trim() === "" ? "sem nome fica difícil achar na lista" : undefined}
          />
        </div>

        <div className={estilo.duasColunas}>
          <CampoSegmentado
            rotulo="Tipo"
            chave="tipo"
            explicacao="Objeção é empurrão contra a oferta. Pergunta é dúvida neutra. Triagem é quem atendeu não ser o dono. Stop manda encerrar a ligação."
            valor={objecao.tipo}
            opcoes={TIPOS}
            onChange={(v) => mexer({ tipo: v })}
          />
          <CampoTexto
            rotulo="Momento"
            chave="momento"
            explicacao="Em que etapa da operação esta entrada vale."
            valor={objecao.momento}
            onChange={(v) => mexer({ momento: v })}
            mono
            exemplo="hoje o catálogo inteiro é cold_call"
          />
        </div>

        <CampoTexto
          rotulo="Evidência"
          chave="evidencia"
          explicacao="De onde saiu este texto. Serve para você saber no que confiar quando o card não funcionar na call."
          valor={objecao.evidencia}
          onChange={(v) => mexer({ evidencia: v })}
          opcoes={EVIDENCIAS}
        />

        <CampoInterruptor
          rotulo="Precisa de prova"
          chave="precisa_de_prova"
          explicacao="Marque quando o argumento só fecha se você tiver um caso, um número ou um print para mostrar. Sem a prova, ele vira promessa."
          valor={objecao.precisa_de_prova}
          onChange={(v) => mexer({ precisa_de_prova: v })}
          textoLigado="sim — o argumento depende de prova"
          textoDesligado="não — vale sozinho"
        />
      </section>

      {/* ---------------- gatilhos e texto ---------------- */}
      <section className={estilo.bloco}>
        <div className={estilo.tituloBloco}>
          <h3>Gatilhos e texto</h3>
          <p>As palavras que denunciam a objeção e o argumento inteiro por trás da headline.</p>
        </div>

        <CampoLista
          rotulo="Núcleos"
          chave="nucleos"
          explicacao="Os pedaços literais que aparecem na fala do cliente. No catálogo vão em minúsculas e sem acento, do jeito que a transcrição costuma entregar."
          valor={objecao.nucleos}
          onChange={(v) => mexer({ nucleos: v })}
          placeholder="ta caro"
        />

        <CampoTexto
          rotulo="Argumento"
          chave="argumento"
          explicacao="O parágrafo completo, do jeito que você falaria. A headline é o atalho dele."
          valor={objecao.argumento}
          onChange={(v) => mexer({ argumento: v })}
          multilinha
          linhas={4}
        />

        <CampoTexto
          rotulo="Fonte"
          chave="fonte"
          explicacao="Onde isto foi ouvido: arquivo da transcrição, e de preferência a frase literal."
          valor={objecao.fonte}
          onChange={(v) => mexer({ fonte: v })}
          multilinha
          linhas={2}
          mono
        />
      </section>

      {/* ---------------- campos preservados ---------------- */}
      {extras.length > 0 && (
        <section className={estilo.bloco}>
          <div className={estilo.tituloBloco}>
            <h3>Outros campos, preservados</h3>
            <p>
              Estão no <code>objecoes.json</code> e este formulário não sabe editá-los. Ficam aqui à
              mostra, somente leitura, e voltam para o disco exatamente como vieram — um formulário
              não apaga um dado só porque não tem um campo para ele.
            </p>
          </div>
          <dl className={estilo.extras}>
            {extras.map(([chave, valor]) => (
              <div key={chave} className={estilo.extra}>
                <dt>{chave}</dt>
                <dd>
                  {Array.isArray(valor)
                    ? valor.map((v, i) => (
                        <span key={i} className={estilo.extraFicha}>
                          {String(v)}
                        </span>
                      ))
                    : JSON.stringify(valor)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ---------------- remover ---------------- */}
      <footer className={estilo.rodape}>
        {confirmando ? (
          <div className={estilo.confirma}>
            <span>
              Remover <strong>{objecao.nome || objecao.id}</strong> do catálogo? Só vale depois de
              salvar.
            </span>
            <button
              type="button"
              className={`btn ${estilo.btnPerigo}`}
              onClick={() => {
                setConfirmando(false);
                onRemover();
              }}
            >
              Remover
            </button>
            <button type="button" className="btn" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`btn ${estilo.btnRemover}`}
            onClick={() => setConfirmando(true)}
          >
            Remover esta objeção
          </button>
        )}
      </footer>
    </div>
  );
}
