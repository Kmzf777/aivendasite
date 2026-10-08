"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { criarCliente } from "@/lib/supabase/cliente";
import { ETAPAS, type Etapa, type Evento } from "@/lib/tipos";
import KanbanColuna from "./KanbanColuna";
import PainelLead from "./PainelLead";
import {
  cartoesDaEtapa,
  eTerminal,
  nomeEtapa,
  temperatura,
  type CartaoLead as Cartao,
} from "./KanbanTipos";
import estilo from "./Kanban.module.css";

type Tom = "ok" | "erro" | "demo";
type Aviso = { texto: string; tom: Tom };

type Props = {
  iniciais: Cartao[];
  /** `null` em demonstração. Em operação é o auth.uid() de quem está logado. */
  vendedorId: string | null;
  /** Sem credenciais no .env: o quadro anda na tela e não grava nada. */
  demonstracao: boolean;
};

function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ==================================================================
// O quadro.
//
// Toda gravação passa por aqui, e sempre no mesmo rito:
//   1. pinta na tela na hora (o vendedor não espera o banco);
//   2. marca o cartão como "gravando";
//   3. chama o banco;
//   4. se o banco recusar, DESFAZ na tela e diz por quê.
//
// O passo 4 é o ponto todo. Um kanban que finge ter salvo é pior do que
// um kanban que não salva: o vendedor confia na tela e perde o lead.
//
// Quem guarda a verdade é um ref, não o state. Explicação em `aplicar`.
// ==================================================================
export default function Kanban({ iniciais, vendedorId, demonstracao }: Props) {
  // `iniciais` vem do Server Component. Mudança de rota remonta o
  // componente, então não há sincronização a fazer depois da montagem.
  const [cartoes, setCartoes] = useState<Cartao[]>(iniciais);
  const refCartoes = useRef<Cartao[]>(iniciais);

  /**
   * Toda alteração do quadro passa por aqui.
   *
   * O ref é a fonte da verdade porque `mover` precisa LER o estado anterior
   * (para saber a etapa de origem e para poder desfazer) e ESCREVER em
   * seguida. Com `useState` puro, duas setas clicadas em sequência rápida
   * leriam a mesma versão antiga e a segunda apagaria a primeira.
   */
  const aplicar = useCallback((fn: (cs: Cartao[]) => Cartao[]) => {
    const novos = fn(refCartoes.current);
    refCartoes.current = novos;
    setCartoes(novos);
  }, []);

  const [salvando, setSalvando] = useState<ReadonlySet<string>>(() => new Set<string>());
  const refSalvando = useRef<ReadonlySet<string>>(salvando);
  const marcar = useCallback((id: string, ligado: boolean) => {
    const s = new Set(refSalvando.current);
    if (ligado) s.add(id);
    else s.delete(id);
    refSalvando.current = s;
    setSalvando(s);
  }, []);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const refAberto = useRef<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const relogioAviso = useRef<number | null>(null);

  // Um cliente por montagem. `createBrowserClient` guarda a sessão em cookie,
  // então não há estado a perder entre chamadas.
  const refBanco = useRef<ReturnType<typeof criarCliente> | null>(null);
  const banco = () => (refBanco.current ??= criarCliente());

  const anunciar = useCallback((tom: Tom, texto: string) => {
    setAviso({ tom, texto });
    if (relogioAviso.current) window.clearTimeout(relogioAviso.current);
    // Erro fica mais tempo: é o que precisa ser lido.
    relogioAviso.current = window.setTimeout(() => setAviso(null), tom === "erro" ? 12_000 : 6_000);
  }, []);

  useEffect(() => () => {
    if (relogioAviso.current) window.clearTimeout(relogioAviso.current);
  }, []);

  // ------------------------------------------------------------ mover

  /**
   * O foco a devolver depois que o cartão for recriado na outra coluna.
   *
   * O React desmonta o cartão da coluna de origem e monta um nó NOVO no
   * destino: o elemento focado deixa de existir e o foco cai no <body>. Quem
   * move pelo teclado recomeçaria a navegação a cada movimento.
   *
   * O pedido fica num ref e é consumido por um efeito, NÃO por
   * requestAnimationFrame — rAF não roda em aba de fundo, e a restauração
   * sumia em silêncio (foi assim que este bug apareceu no teste). Efeito roda
   * depois do commit, quando o DOM novo já existe, e não depende de o
   * navegador querer pintar.
   */
  const focoPendente = useRef<{ alvo: string; cartao: string } | null>(null);
  const devolverFoco = useCallback((alvo: string, idCartao: string) => {
    focoPendente.current = { alvo, cartao: idCartao };
  }, []);

  // Roda depois de qualquer commit que mexa no quadro ou no painel: é quando
  // o nó de destino do foco já existe no DOM.
  useEffect(() => {
    const pedido = focoPendente.current;
    if (!pedido) return;
    focoPendente.current = null;
    const el = document.getElementById(pedido.alvo);
    // Seta que nasceu desabilitada (o cartão chegou à ponta do funil) não
    // recebe foco: nesse caso o título do cartão segura a pessoa no lugar.
    if (el instanceof HTMLButtonElement && !el.disabled) el.focus();
    else document.getElementById(`cartao-${pedido.cartao}`)?.focus();
  }, [cartoes, aberto]);

  const mover = useCallback(
    async (id: string, destino: Etapa, focoApos?: string) => {
      const antes = refCartoes.current.find((c) => c.id === id);
      if (!antes || antes.etapa === destino) return;
      // Uma gravação por cartão. Sem isto, dois cliques rápidos nas setas
      // disparariam dois UPDATEs e o desfazer de um apagaria o outro.
      if (refSalvando.current.has(id)) return;

      const origem = antes.etapa;
      const agora = new Date().toISOString();
      const nota = `${nomeEtapa(origem)} → ${nomeEtapa(destino)}`;

      const eventoProvisorio: Evento = {
        id: `provisorio-${id}-${Date.now()}`,
        lead_id: id,
        vendedor_id: vendedorId,
        tipo: "moveu",
        nota,
        criado_em: agora,
      };

      // 1. pinta na hora. `paradoHoras` zera: mover é atividade.
      aplicar((cs) =>
        cs.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                etapa: destino,
                entrouEm: agora,
                ultimaAtividadeEm: agora,
                paradoHoras: 0,
                eventos: [eventoProvisorio, ...c.eventos],
              }
        )
      );

      if (focoApos) devolverFoco(focoApos, id);

      const desfazer = () => {
        aplicar((cs) => cs.map((c) => (c.id === id ? antes : c)));
        // Desfazer também recria o cartão: o foco precisa voltar de novo.
        if (focoApos) devolverFoco(focoApos, id);
      };

      if (demonstracao || !vendedorId) {
        anunciar("demo", `${antes.nome}: ${nota} — demonstração, nada foi gravado.`);
        return;
      }

      marcar(id, true);
      try {
        const sb = banco();

        // O `.select()` não é luxo: quando o RLS barra o UPDATE o Supabase
        // devolve SUCESSO com zero linhas, sem erro. Se eu não exigisse a
        // linha de volta, um movimento recusado pelo banco passaria por
        // salvo — exatamente a mentira que este quadro não pode contar.
        const { data, error } = await sb
          .from("leads")
          .update({ etapa: destino })
          .eq("id", id)
          .eq("vendedor_id", vendedorId)
          .eq("situacao", "qualificado")
          .select("id, etapa, situacao")
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) {
          throw new Error(
            "o banco não devolveu a linha. O lead pode ter sido desqualificado ou passado para outro vendedor."
          );
        }

        // O gatilho `leads_coerencia` pode normalizar a etapa (por exemplo se
        // a situação deixou de ser 'qualificado'). O banco manda: se ele
        // devolveu outra coisa, é a outra coisa que vai para a tela.
        if (data.etapa !== destino) {
          desfazer();
          anunciar(
            "erro",
            `${antes.nome}: o banco gravou "${data.etapa ?? "nenhuma etapa"}" em vez de ${nomeEtapa(destino)}. Recarregue a tela.`
          );
          return;
        }

        const { error: erroEvento } = await sb.from("eventos").insert({
          lead_id: id,
          vendedor_id: vendedorId,
          tipo: "moveu",
          nota,
        });

        if (erroEvento) {
          // A etapa FOI gravada. Desfazer aqui seria desfazer o que o banco
          // já aceitou. Então o movimento fica e o buraco é declarado.
          aplicar((cs) =>
            cs.map((c) =>
              c.id !== id
                ? c
                : { ...c, eventos: c.eventos.filter((e) => e.id !== eventoProvisorio.id) }
            )
          );
          anunciar(
            "erro",
            `${antes.nome} foi movido para ${nomeEtapa(destino)}, mas o histórico não registrou: ${erroEvento.message}`
          );
          return;
        }

        anunciar("ok", `${antes.nome}: ${nota}`);
      } catch (e) {
        desfazer();
        anunciar(
          "erro",
          `${antes.nome} voltou para ${nomeEtapa(origem)} — o banco recusou: ${mensagemDeErro(e)}`
        );
      } finally {
        marcar(id, false);
      }
    },
    [anunciar, aplicar, demonstracao, devolverFoco, marcar, vendedorId]
  );

  // ------------------------------------------------------------ anotar

  const anotar = useCallback(
    async (id: string, texto: string): Promise<boolean> => {
      const limpo = texto.trim();
      if (!limpo) return false;
      const antes = refCartoes.current.find((c) => c.id === id);
      if (!antes) return false;

      const agora = new Date().toISOString();
      const provisorio: Evento = {
        id: `provisorio-nota-${id}-${Date.now()}`,
        lead_id: id,
        vendedor_id: vendedorId,
        tipo: "nota",
        nota: limpo,
        criado_em: agora,
      };

      // Anotar é trabalhar o lead: zera o relógio do esquecimento.
      aplicar((cs) =>
        cs.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                ultimaAtividadeEm: agora,
                paradoHoras: 0,
                eventos: [provisorio, ...c.eventos],
              }
        )
      );

      if (demonstracao || !vendedorId) {
        anunciar("demo", "Anotação só na tela — demonstração, sem banco.");
        return true;
      }

      const { error } = await banco()
        .from("eventos")
        .insert({ lead_id: id, vendedor_id: vendedorId, tipo: "nota", nota: limpo });

      if (error) {
        aplicar((cs) =>
          cs.map((c) =>
            c.id !== id
              ? c
              : {
                  ...c,
                  ultimaAtividadeEm: antes.ultimaAtividadeEm,
                  paradoHoras: antes.paradoHoras,
                  eventos: c.eventos.filter((e) => e.id !== provisorio.id),
                }
          )
        );
        anunciar("erro", `A anotação não foi gravada: ${error.message}`);
        return false;
      }

      anunciar("ok", `Anotação gravada em ${antes.nome}.`);
      return true;
    },
    [anunciar, aplicar, demonstracao, vendedorId]
  );

  // ------------------------------------------------------------ painel

  const abrir = useCallback((id: string) => {
    refAberto.current = id;
    setAberto(id);
  }, []);

  const fechar = useCallback(() => {
    const anterior = refAberto.current;
    refAberto.current = null;
    // O foco volta para o cartão que abriu o painel. Sem isto quem navega
    // por teclado é devolvido ao início do documento a cada fechamento.
    if (anterior) devolverFoco(`cartao-${anterior}`, anterior);
    setAberto(null);
  }, [devolverFoco]);

  // ------------------------------------------------------------ contas

  const colunas = useMemo(
    () => ETAPAS.map((e) => ({ ...e, lista: cartoesDaEtapa(cartoes, e.id) })),
    [cartoes]
  );

  const emJogo = cartoes.filter((c) => !eTerminal(c.etapa)).length;
  const frios = cartoes.filter(
    (c) => temperatura(c.etapa, c.paradoHoras) === "frio"
  ).length;

  const cartaoAberto = aberto ? cartoes.find((c) => c.id === aberto) ?? null : null;

  return (
    <div className={estilo.tudo}>
      <div className={estilo.resumo}>
        <span className={estilo.medida}>
          <b>{cartoes.length}</b> no funil
        </span>
        <span className={estilo.medida}>
          <b>{emJogo}</b> em jogo
        </span>
        <span className={estilo.medida} data-grave={frios > 0 ? "sim" : "nao"}>
          <b>{frios}</b> parado{frios === 1 ? "" : "s"} há mais de 7 dias
        </span>
        <span className={estilo.dica}>
          arraste o cartão ou use <kbd>◀</kbd> <kbd>▶</kbd> para mover
        </span>
      </div>

      {/* Região viva: a única forma de quem usa leitor de tela saber que o
          movimento foi gravado — ou recusado. Fica sempre no DOM, porque
          região criada junto com o texto não é anunciada. */}
      <p className={estilo.aviso} data-tom={aviso?.tom ?? "nenhum"} role="status" aria-live="polite">
        {aviso?.texto ?? ""}
      </p>

      <div className={estilo.area} data-painel={cartaoAberto ? "sim" : "nao"}>
        <div className={estilo.quadro}>
          {colunas.map((c) => (
            <KanbanColuna
              key={c.id}
              etapa={c.id}
              nome={c.nome}
              cartoes={c.lista}
              arrastando={arrastando}
              salvando={salvando}
              aoAbrir={abrir}
              aoMover={mover}
              aoIniciarArraste={setArrastando}
              aoTerminarArraste={() => setArrastando(null)}
            />
          ))}
        </div>

        {cartaoAberto && (
          <aside className={estilo.doca}>
            <PainelLead
              // A `key` remonta o painel ao trocar de lead: a anotação
              // meio escrita de um lead não pode vazar para o outro.
              key={cartaoAberto.id}
              cartao={cartaoAberto}
              demonstracao={demonstracao}
              aoFechar={fechar}
              aoMover={mover}
              aoAnotar={anotar}
              salvando={salvando.has(cartaoAberto.id)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
