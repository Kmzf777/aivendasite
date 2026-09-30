"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ObjecoesLista, { ALVO_LIMIARES } from "./ObjecoesLista";
import ObjecaoForm from "./ObjecaoForm";
import LimiaresPainel from "./LimiaresPainel";
import {
  estavel,
  idLivre,
  normalizar,
  objecaoEmBranco,
  type Limiares,
  type Linha,
  type Objecao,
} from "./ObjecoesTipos";
import estilo from "./ObjecoesEditor.module.css";

type Props = {
  listaInicial: unknown[];
  limiaresIniciais: Limiares;
};

type Recado = { tom: "ok" | "erro" | "aviso"; texto: string };

/**
 * Chaves internas determinísticas para a carga inicial: o mesmo valor no
 * servidor e no cliente, senão a hidratação reclamaria.
 */
function montarLinhas(bruto: unknown[]): Linha[] {
  return bruto.map((o, i) => ({ chave: `linha_${i}`, dado: normalizar(o) }));
}

export default function ObjecoesEditor({ listaInicial, limiaresIniciais }: Props) {
  const [linhas, setLinhas] = useState<Linha[]>(() => montarLinhas(listaInicial));
  const [limiares, setLimiares] = useState<Limiares>(limiaresIniciais);

  /**
   * `base` é o retrato do que está no disco: o que veio na carga e, depois de
   * cada salvamento bem-sucedido, o que acabou de ser gravado. Serve para
   * saber o que ainda não foi salvo e para travar os ids já persistidos.
   */
  const [base, setBase] = useState(() => ({
    linhas: montarLinhas(listaInicial),
    limiares: limiaresIniciais,
  }));

  // Abre na primeira objeção, não nos limiares: o assunto desta tela é o
  // catálogo, e é no formulário que estão as explicações dos três campos.
  const [selecao, setSelecao] = useState<string>(() =>
    listaInicial.length ? "linha_0" : ALVO_LIMIARES,
  );
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<Recado | null>(null);
  /** Esvaziar o catálogo é sério demais para acontecer num clique só. */
  const [confirmandoVazio, setConfirmandoVazio] = useState(false);

  const contador = useRef(0);
  const cronometro = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anunciar = useCallback((r: Recado | null) => {
    if (cronometro.current) clearTimeout(cronometro.current);
    setRecado(r);
    // Sucesso desaparece sozinho; erro e aviso ficam até a próxima ação.
    if (r?.tom === "ok") cronometro.current = setTimeout(() => setRecado(null), 7000);
  }, []);
  useEffect(
    () => () => {
      if (cronometro.current) clearTimeout(cronometro.current);
    },
    [],
  );

  // ---------------------------------------------------------- o que mudou

  const porChave = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of base.linhas) m.set(l.chave, estavel(l.dado));
    return m;
  }, [base.linhas]);

  const alteradas = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) {
      const antes = porChave.get(l.chave);
      if (antes !== undefined && antes !== estavel(l.dado)) s.add(l.chave);
    }
    return s;
  }, [linhas, porChave]);

  const novas = useMemo(
    () => new Set(linhas.filter((l) => !porChave.has(l.chave)).map((l) => l.chave)),
    [linhas, porChave],
  );

  const removidas = useMemo(() => {
    const vivas = new Set(linhas.map((l) => l.chave));
    return base.linhas.filter((l) => !vivas.has(l.chave));
  }, [linhas, base.linhas]);

  const limiaresAlterados = estavel(limiares) !== estavel(base.limiares);
  const sujo =
    limiaresAlterados || alteradas.size > 0 || novas.size > 0 || removidas.length > 0;

  /** Chaves cuja objeção já foi para o disco: o id delas trava. */
  const persistidas = useMemo(() => new Set(base.linhas.map((l) => l.chave)), [base.linhas]);

  const selecionada = linhas.find((l) => l.chave === selecao);

  // ---------------------------------------------------------- edição

  function trocar(chave: string, dado: Objecao) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, dado } : l)));
  }

  function criar() {
    const chave = `nova_${contador.current++}`;
    const id = idLivre("nova_objecao", new Set(linhas.map((l) => l.dado.id)));
    setLinhas((atual) => [...atual, { chave, dado: objecaoEmBranco(id) }]);
    setSelecao(chave);
    anunciar({
      tom: "aviso",
      texto: "Objeção criada só na tela. Escolha o id agora — depois de salvar ele trava.",
    });
  }

  function remover(alvo: Linha) {
    const i = linhas.findIndex((l) => l.chave === alvo.chave);
    setLinhas((atual) => atual.filter((l) => l.chave !== alvo.chave));
    const vizinha = linhas[i + 1] || linhas[i - 1];
    setSelecao(vizinha ? vizinha.chave : ALVO_LIMIARES);
    anunciar({
      tom: "aviso",
      texto: `«${alvo.dado.nome || alvo.dado.id}» sai do catálogo quando você salvar.`,
    });
  }

  // ---------------------------------------------------------- salvar

  /** O primeiro problema que impede o salvamento, com a linha para focar. */
  function conferir(): { texto: string; alvo: string } | null {
    const vistos = new Map<string, Linha[]>();
    for (const l of linhas) {
      if (!l.dado.id.trim()) {
        return {
          texto: `«${l.dado.nome || "sem nome"}» está sem id — sem isso não salva.`,
          alvo: l.chave,
        };
      }
      vistos.set(l.dado.id, [...(vistos.get(l.dado.id) || []), l]);
    }
    for (const [id, iguais] of vistos) {
      if (iguais.length > 1) {
        // Foca a ÚLTIMA: numa colisão, a recém-criada é a que precisa mudar.
        return {
          texto: `o id «${id}» aparece ${iguais.length} vezes — ele tem que ser único.`,
          alvo: iguais[iguais.length - 1].chave,
        };
      }
    }
    return null;
  }

  const salvar = useCallback(async () => {
    if (salvando) return;

    const problema = conferir();
    if (problema) {
      setSelecao(problema.alvo);
      anunciar({ tom: "erro", texto: "Não salvei: " + problema.texto });
      return;
    }

    const lista = linhas.map((l) => l.dado);

    // Se o catálogo ficou vazio, a gravação apagaria todos os registros do
    // arquivo. Pede confirmação em dois cliques antes de deixar acontecer.
    if (lista.length === 0 && !confirmandoVazio) {
      setConfirmandoVazio(true);
      anunciar({
        tom: "erro",
        texto:
          "O catálogo está vazio. Salvar assim apaga todas as objeções do objecoes.json. Clique em salvar de novo para confirmar.",
      });
      return;
    }

    setSalvando(true);
    anunciar(null);
    try {
      const r = await fetch("/api/objecoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // O formato {lista, limiares}; o array puro também é aceito pela API,
        // mas aí os limiares não iriam junto.
        body: JSON.stringify({ lista, limiares }),
      });

      if (!r.ok) {
        let motivo = `o servidor respondeu ${r.status}`;
        try {
          const j = await r.json();
          if (j?.error) motivo = String(j.error);
        } catch {
          /* resposta sem json: fica o status */
        }
        throw new Error(motivo);
      }

      const resposta = await r.json().catch(() => null);

      // O retrato passa a ser o que acabou de ir para o disco. O estado da
      // tela NÃO é substituído pela resposta do servidor de propósito: se
      // algum dia a resposta vier diferente, o usuário não perde o que digitou.
      setBase({ linhas, limiares });
      setConfirmandoVazio(false);
      anunciar({
        tom: "ok",
        texto:
          `Salvo às ${new Date().toLocaleTimeString("pt-BR")} · ${lista.length} objeções` +
          (resposta?.limiares ? " · limiares gravados" : ""),
      });
    } catch (e) {
      anunciar({
        tom: "erro",
        texto:
          "Não salvou: " +
          (e as Error).message +
          ". Nada do que você digitou foi perdido — tente de novo.",
      });
    } finally {
      setSalvando(false);
    }
  }, [linhas, limiares, salvando, confirmandoVazio, anunciar]);

  // Ctrl/Cmd+S. Numa tela de edição longa é o reflexo de quem escreve.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (sujo) void salvar();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [salvar, sujo]);

  // Fechar a aba com edição pendente perde trabalho: o navegador pergunta.
  useEffect(() => {
    if (!sujo) return;
    function sair(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, [sujo]);

  // ---------------------------------------------------------- render

  const pendencias = [
    novas.size ? `${novas.size} nova${novas.size > 1 ? "s" : ""}` : null,
    alteradas.size ? `${alteradas.size} editada${alteradas.size > 1 ? "s" : ""}` : null,
    removidas.length ? `${removidas.length} removida${removidas.length > 1 ? "s" : ""}` : null,
    limiaresAlterados ? "limiares" : null,
  ].filter(Boolean);

  return (
    <div className={estilo.tela}>
      <header className={estilo.topo}>
        <div className={estilo.marcaCaixa}>
          <Link href="/" className={estilo.voltar}>
            ← copiloto
          </Link>
          <h1 className={estilo.marca}>Objeções</h1>
          <p className={estilo.lema}>
            O Jev não escreve nada: ele só decide <em>qual</em> objeção é. O que o card diz é o que
            está escrito aqui.
          </p>
        </div>

        <div className={estilo.comandos}>
          <span className={`telemetria ${estilo.pendencias}`}>
            {sujo ? `não salvo · ${pendencias.join(" · ")}` : "tudo salvo"}
          </span>
          <button
            type="button"
            className={`btn btn-forte ${estilo.salvar}`}
            disabled={!sujo || salvando}
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando…" : confirmandoVazio ? "Confirmar catálogo vazio" : "Salvar"}
          </button>
        </div>
      </header>

      {/* Retorno do salvamento. Nunca falha em silêncio: sucesso, aviso e erro
          passam todos por aqui, com aria-live para leitor de tela. Fica fora
          da área que rola, senão o aviso sumiria justo para quem está no fim
          de um formulário longo — que é quando se salva. */}
      <div className={estilo.avisoCaixa} aria-live="polite">
        {recado && (
          <p className={estilo.recado} data-tom={recado.tom}>
            {recado.texto}
            <button
              type="button"
              className={estilo.fechar}
              aria-label="fechar aviso"
              onClick={() => anunciar(null)}
            >
              ×
            </button>
          </p>
        )}
        {base.linhas.length === 0 && (
          <p className={estilo.recado} data-tom="erro">
            O catálogo chegou vazio. Se o <code>objecoes.json</code> existe e tem conteúdo, isso é
            falha de leitura — e salvar agora grava um arquivo vazio em cima dele. Confira o arquivo
            antes de mexer aqui.
          </p>
        )}
      </div>

      <div className={estilo.corpo}>
        <aside className={estilo.trilha}>
          <ObjecoesLista
            linhas={linhas}
            selecao={selecao}
            onSelecionar={setSelecao}
            alteradas={alteradas}
            novas={novas}
            limiaresAlterados={limiaresAlterados}
            onNova={criar}
          />
        </aside>

        <main className={estilo.mesa}>
          {selecao === ALVO_LIMIARES ? (
            <LimiaresPainel valor={limiares} onChange={setLimiares} />
          ) : selecionada ? (
            <ObjecaoForm
              // A chave da linha é estável mesmo enquanto o id muda: o
              // formulário não remonta a cada tecla digitada no campo id.
              key={selecionada.chave}
              objecao={selecionada.dado}
              onChange={(nova) => trocar(selecionada.chave, nova)}
              onRemover={() => remover(selecionada)}
              idTravado={persistidas.has(selecionada.chave)}
              idsOcupados={
                new Set(
                  linhas.filter((l) => l.chave !== selecionada.chave).map((l) => l.dado.id),
                )
              }
              alterada={alteradas.has(selecionada.chave) || novas.has(selecionada.chave)}
            />
          ) : (
            <p className={estilo.nada}>
              Essa objeção não está mais na lista. Escolha outra à esquerda.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
