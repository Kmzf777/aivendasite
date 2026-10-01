// ==================================================================
// Motor do copiloto — áudio, reconhecimento e decisão.
//
// Isto NÃO é um hook e NÃO vive dentro do React de propósito. Leia o
// bloco "A TRAVA DO RECONHECEDOR" antes de mover esta lógica para
// dentro de um componente: o Chrome permite UM SpeechRecognition ativo
// por processo, e o React monta efeito duas vezes em desenvolvimento.
//
// A tela só lê snapshots (`ler()`) e chama ações a partir de eventos do
// usuário. Nenhum efeito de React liga ou desliga o reconhecedor.
// ==================================================================

import {
  CONFIG,
  NOMES_FASE,
  montarState,
  aplicarRegra,
  calcularCusto,
} from "../lib/decisao.js";
import { quemFalou, quemFalouPorTransicoes } from "../lib/atribuir.js";
import {
  perguntasDoCliente,
  perguntasDoVendedor,
  copilotoInicial,
  turnoDoCliente,
  turnoDoVendedor,
  fimDaLigacao,
} from "../lib/copiloto.js";

// ------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------

export type Modo = "tecla" | "dois";
export type AcaoDecisao = "card" | "alerta" | "esperar" | "repetida" | "nada";

export type Objecao = {
  id: string;
  nome: string;
  comoSoa?: string;
  headline?: string;
  pivot?: string;
  argumento?: string;
  // "objecao" | "pergunta" | "triagem" | "stop". Declarado aqui porque NÃO é
  // catalogação: lib/copiloto.js lê `objecao.tipo === "stop"` para limpar a
  // tela e deixar só o encerramento. Sem o campo no tipo, alguém que
  // "arrumasse" o catálogo tirando o campo quebraria o stop sem ver erro
  // nenhum — e o sintoma seria uma dica de venda em cima de um "não me ligue
  // mais". Opcional porque o catálogo antigo (lib/objecoes-exemplo.js) não tem.
  tipo?: string;
};

export type Card = {
  // Muda a cada card novo. A tela usa como `key` para a animação renascer
  // mesmo quando a objeção é parecida com a anterior.
  chave: number;
  tipo: "card" | "alerta";
  rotulo: string;
  headline: string;
  pivot: string;
  argumento: string;
  confianca: number; // 0..1
  ms: number;
  falaCliente: string;
};

export type ItemHistorico = { chave: number; nome: string };

// O que aparece empilhado na tela. Veja lib/dicas.js: no maximo 3, no maximo
// 6 palavras cada, e nunca entre aspas — nao e para ler em voz alta.
export type Dica = {
  id: string;
  tipo: "stop" | "objecao" | "lacuna" | "sentimento";
  texto: string;
  nova: boolean;
  rodadas: number;
};

export type ItemColhido = { campo: string; valor: string; trecho: string };

// O catálogo de um tipo de ligação. Vive em fluxos/*.json e é validado por
// `node valida-fluxo.js` antes de subir — id sem comoSoa some da lista do Jev
// em silêncio, e isso só apareceria no meio de uma ligação.
export type Fluxo = {
  id: string;
  nome?: string;
  etapas: { id: string; nome?: string; comoSoa: string; exige?: string[]; pula_se?: string[] }[];
  acoes: { id: string; comoSoa: string; dica: string }[];
};

// O estado do copiloto é opaco aqui de propósito: quem o manipula é
// lib/copiloto.js, que é puro e tem teste próprio. Este arquivo só o carrega.
type EstadoCopiloto = {
  etapa: { etapa: number; feitas: string[]; visto: string[] };
  colheita: {
    telefones: unknown[];
    nomes: unknown[];
    horario: unknown | null;
  };
  dicas: Dica[];
  ultimaMostrada: string | null;
};

export type Estado = {
  situacao: "parado" | "ligando" | "ouvindo";
  modo: Modo;
  erro: string | null;
  aviso: string | null;
  apertado: boolean; // tecla do push-to-talk
  ouvindoVoz: boolean; // reconhecedor entre onstart e onend
  decidindo: boolean; // chamada ao Jev em voo
  testando: boolean; // medidores do modal ligados
  card: Card | null;
  historico: ItemHistorico[];
  faseCall: string | null;
  // --- fluxo, dicas e colheita ---
  fluxoId: string | null;
  fluxoNome: string | null;
  etapa: string | null; // nome legivel da etapa atual
  etapaPos: string | null; // "3 de 9"
  dicas: Dica[];
  colhidos: number; // quantos itens esperam confirmacao ao desligar
  ultimaAcao: AcaoDecisao | null;
  decisoes: number;
  latencia: number | null; // média em ms
  custo: number; // US$ estimado
  usandoWorklet: boolean;
  modelo: string;
};

// `seu` é só para PINTAR a curva: diz se a tecla estava presa quando a
// amostra chegou. A atribuição de verdade NÃO usa isto — ela integra as
// transições com timestamp de evento (ver PONTO 3). Aqui um atraso de
// 50 ms na cor não custa nada; lá custaria a frase inteira.
export type Amostra = { t: number; eV: number; eC: number; seu: boolean };

type Fala = { quem: string; fala: string };

type Decisao = {
  acao: AcaoDecisao;
  fase: string | null;
  temObjecao: number;
  confianca: number;
  escolha: string;
  objecao?: Objecao;
};

// A regra vem de lib/decisao.js, que é JS. Damos nome ao contrato aqui
// e nunca reimplementamos a regra: ela tem duas portas e está medida.
const decidirRegra = aplicarRegra as unknown as (
  resposta: unknown,
  objecoes: Objecao[],
  ultimaMostrada: string | null
) => Decisao;

const NOMES: Record<string, string> = NOMES_FASE as Record<string, string>;

// ------------------------------------------------------------------
// Reconhecedor: tipos mínimos próprios.
//
// `SpeechRecognition` não é padrão em todos os lib.dom, e o Chrome expõe
// `webkitSpeechRecognition`. Descrever só o que usamos evita depender da
// versão do TypeScript e deixa a API stubável nos testes.
// ------------------------------------------------------------------

type ResultadoSR = { isFinal: boolean; 0: { transcript: string } };
type EventoSR = { resultIndex: number; results: { length: number; [i: number]: ResultadoSR } };

type Reconhecedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: (track?: unknown) => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((ev: EventoSR) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type FabricaSR = new () => Reconhecedor;

function obterSR(): FabricaSR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: FabricaSR;
    webkitSpeechRecognition?: FabricaSR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ==================================================================
// A TRAVA DO RECONHECEDOR (leia antes de mexer)
// ==================================================================
// O Chrome permite UM SpeechRecognition ativo por processo. Iniciar o
// segundo aborta o primeiro em ~2 ms, sem erro, sem aviso: a tela fica
// com cara de certa e não ouve nada. Já matou uma arquitetura deste
// projeto inteira.
//
// O StrictMode do Next monta e desmonta todo efeito DUAS vezes em
// desenvolvimento. Se o reconhecedor nascesse num useEffect, a segunda
// montagem abortaria o da primeira e o reconhecimento morreria calado.
//
// Três defesas, nesta ordem:
//   1. o motor é UM só por módulo (singleton abaixo), então as duas
//      montagens do StrictMode falam com o mesmo objeto;
//   2. nada aqui é iniciado por efeito — só pelo clique em "Ligar",
//      que é gesto do usuário e não é duplicado pelo StrictMode;
//   3. esta variável de módulo: antes de criar um reconhecedor novo,
//      o anterior é abortado explicitamente. Assim, se algum caminho
//      escapar, sobra um — e é o novo, não o velho.
// ==================================================================
let recAtivo: Reconhecedor | null = null;

// ------------------------------------------------------------------
// Constantes portadas do sistema vanilla (../coldcall.html)
// ------------------------------------------------------------------

// Áudio cru: qualquer processamento do navegador atrapalha tanto o ASR
// quanto a medida de energia que decide quem falou.
const CRU = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const AMOSTRA_MS = 50;

// ------------------------------------------------------------------
// Quando perguntar ao Jev.
//
// Medido numa call real, com "Eu preciso ver com meu marido": o Chrome
// entrega o primeiro parcial em 0 ms e depois um a cada ~150 ms. Ele NÃO
// é o gargalo. Os dois desperdícios eram nossos:
//
//   1. a primeira pergunta saía com 2 caracteres ("Eu"), inútil - e ainda
//      consumia a janela do teto, que era a única porta aberta;
//   2. entre 213 e 1006 ms chegaram SETE parciais e nenhuma pergunta saiu,
//      porque o debounce de 500 ms era rearmado a cada parcial novo. Com
//      parcial a cada 150 ms, aquele timer nunca disparava.
//
// Por isso o gatilho agora é o CRESCIMENTO do texto, não o silêncio: numa
// fala contínua o texto cresce, e é nele que a objeção aparece. O silêncio
// vira só o caso de borda (a frase acabou).
// ------------------------------------------------------------------
const PARCIAL = {
  // Abaixo disso não há o que classificar: "Eu" não é objeção de nada.
  // Mas o piso tem que caber em "tá caro", que tem 7 caracteres e é a
  // objeção mais comum do catálogo. Errar para cima aqui custa uma venda;
  // errar para baixo custa US$ 0,000044 numa resposta "nada".
  minParaPerguntar: 6,
  // Cresceu isto desde a última pergunta? Então há texto novo que pode
  // conter a objeção - vale perguntar de novo.
  minCrescimento: 8,
  // Piso entre duas perguntas, para não disparar a cada parcial.
  minIntervaloMs: 350,
  // Rede de segurança: fala longa sem crescimento que atinja o mínimo.
  tetoMs: 700,
  // A frase acabou (parou de chegar texto novo).
  pausaMs: 450,
  atrasoAsrMs: 1200, // largura mínima da janela de atribuição (ver abaixo)
};

// Duas escalas chegam ao medidor: RMS de forma de onda (worklet) e média
// de espectro em bytes/255 (AnalyserNode). Cada caminho tem sua conversão.
const pctRms = (x: number) =>
  Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(x, 1e-6)) + 60) / 60) * 100));
const pctAnalisador = (x: number) => Math.min(100, x * 260);

// Âncora para traduzir timestamp de EVENTO (contado do time origin da
// página, igual a performance.now()) para relógio de parede, que é a base
// das janelas de frase. Calculada na primeira chamada, no browser.
let ancoraEvento = 0;
function paraRelogio(ts: number | undefined): number {
  if (!ancoraEvento) ancoraEvento = Date.now() - performance.now();
  return typeof ts === "number" && ts > 0 ? ancoraEvento + ts : Date.now();
}

function texto(e: unknown): string {
  const x = e as { name?: string; message?: string };
  if (x && (x.name || x.message)) return [x.name, x.message].filter(Boolean).join(" — ");
  return String(e);
}

// Fila do barramento de eventos. Não bloqueia nada e falha em silêncio:
// o painel de eventos é diagnóstico, não parte do caminho da decisão.
function publicarEvento(ev: unknown) {
  if (typeof fetch !== "function") return;
  void fetch("/api/evento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ev),
  }).catch(() => {});
}

const INICIAL: Estado = {
  situacao: "parado",
  modo: "tecla",
  erro: null,
  aviso: null,
  apertado: false,
  ouvindoVoz: false,
  decidindo: false,
  testando: false,
  card: null,
  historico: [],
  faseCall: null,
  fluxoId: null,
  fluxoNome: null,
  etapa: null,
  etapaPos: null,
  dicas: [],
  colhidos: 0,
  ultimaAcao: null,
  decisoes: 0,
  latencia: null,
  custo: 0,
  usandoWorklet: false,
  modelo: String(CONFIG.modelo),
};

// ==================================================================
// O motor
// ==================================================================

export class MotorCopiloto {
  estado: Estado = INICIAL;

  private ouvintes = new Set<() => void>();

  // --- catálogo
  private objecoes: Objecao[] = [];

  // --- áudio
  private ctx: AudioContext | null = null;
  private streams: MediaStream[] = [];
  private medidor: AudioWorkletNode | null = null;
  private ganhoMudo: GainNode | null = null;
  private anV: AnalyserNode | null = null;
  private anC: AnalyserNode | null = null;
  private timerNivel: ReturnType<typeof setInterval> | null = null;
  private usandoWorklet = false;
  private ancoraCtx = 0;
  private janela: Amostra[] = [];
  private nivelV = 0;
  private nivelC = 0;

  // --- reconhecimento
  private rec: Reconhecedor | null = null;
  private track: MediaStreamTrack | null = null;
  private ativo = false; // o onend usa isto para decidir se reergue

  // --- frase em curso
  private parcialAtual = "";
  private timerParcial: ReturnType<typeof setTimeout> | null = null;
  private ultimoDisparo = 0;
  private textoDecidido = "";
  private tInicioFrase = 0;
  private tUltimoFinal = 0;

  // --- push-to-talk
  private transicoes: { t: number; apertado: boolean }[] = [];
  private apertado = false;
  private tecladoLigado = false;

  // --- decisão
  private falas: Fala[] = [];
  private ultimaMostrada: string | null = null;

  // Fluxo e estado do copiloto. Nulos até a tela chamar definirFluxo():
  // sem fluxo escolhido o motor funciona como antes, só com card de objeção.
  private fluxo: Fluxo | null = null;
  private co: EstadoCopiloto | null = null;
  private seqV = 0; // sequência própria do turno do vendedor
  private seq = 0;
  private latencias: number[] = [];
  private chaveCard = 0;

  // --- ciclo de vida da tela
  private montagens = 0;
  private timerLiberar: ReturnType<typeof setTimeout> | null = null;

  // ----------------------------------------------------------------
  // Assinatura (useSyncExternalStore)
  // ----------------------------------------------------------------
  assinar = (fn: () => void) => {
    this.ouvintes.add(fn);
    return () => {
      this.ouvintes.delete(fn);
    };
  };

  ler = () => this.estado;

  private mudar(p: Partial<Estado>) {
    this.estado = { ...this.estado, ...p };
    for (const fn of this.ouvintes) {
      try {
        fn();
      } catch {}
    }
  }

  // ----------------------------------------------------------------
  // Retenção pela tela.
  //
  // O StrictMode faz montar → desmontar → montar. Se a desmontagem
  // desligasse a call na hora, um remonte (StrictMode ou Fast Refresh no
  // meio de uma call) mataria o áudio. Então a soltura é ADIADA: se uma
  // montagem nova chegar antes do prazo, ela cancela o desligamento.
  // Sair de verdade da tela desliga, como tem que ser.
  // ----------------------------------------------------------------
  reter = () => {
    this.montagens++;
    if (this.timerLiberar) {
      clearTimeout(this.timerLiberar);
      this.timerLiberar = null;
    }
  };

  liberar = () => {
    this.montagens = Math.max(0, this.montagens - 1);
    if (this.montagens > 0) return;
    if (this.timerLiberar) clearTimeout(this.timerLiberar);
    this.timerLiberar = setTimeout(() => {
      this.timerLiberar = null;
      if (this.montagens <= 0) this.desligar();
    }, 400);
  };

  // ----------------------------------------------------------------
  // Catálogo e modo
  // ----------------------------------------------------------------
  definirCatalogo(lista: Objecao[]) {
    if (!Array.isArray(lista) || !lista.length) return;
    this.objecoes = lista;
  }

  quantasObjecoes() {
    return this.objecoes.length;
  }

  // O fluxo entra de fora, como o catálogo: o motor não busca nada sozinho.
  // Quem chama é a tela, depois do vendedor escolher qual ligação vai fazer.
  // Trocar de fluxo zera o estado da ligação de propósito — prospecção e
  // conversão não compartilham etapa nem o que já foi feito.
  definirFluxo(fluxo: Fluxo) {
    if (!fluxo || !Array.isArray(fluxo.etapas) || !fluxo.etapas.length) return;
    this.fluxo = fluxo;
    this.co = copilotoInicial(fluxo);
    this.publicarFluxo();
  }

  temFluxo() {
    return !!this.fluxo;
  }

  // Espelha o estado do copiloto no Estado que a tela lê.
  private publicarFluxo() {
    if (!this.fluxo || !this.co) return;
    const e = this.fluxo.etapas[this.co.etapa.etapa];
    this.mudar({
      fluxoId: this.fluxo.id,
      fluxoNome: this.fluxo.nome || this.fluxo.id,
      etapa: e ? e.nome || e.id : null,
      etapaPos: e ? this.co.etapa.etapa + 1 + " de " + this.fluxo.etapas.length : null,
      dicas: (this.co.dicas || []) as Dica[],
      colhidos:
        (this.co.colheita.telefones || []).length +
        (this.co.colheita.nomes || []).length +
        (this.co.colheita.horario ? 1 : 0),
    });
  }

  // A tela de fim de ligação. Nada daqui vai para a ficha do lead sozinho:
  // cada item vem com o trecho que o gerou, para o vendedor confirmar.
  fim(): { confirmar: ItemColhido[]; naoFez: { id: string; dica: string }[] } | null {
    if (!this.fluxo || !this.co) return null;
    return fimDaLigacao(this.fluxo, this.co) as {
      confirmar: ItemColhido[];
      naoFez: { id: string; dica: string }[];
    };
  }

  definirModo(modo: Modo) {
    if (this.estado.situacao !== "parado") return;
    this.mudar({ modo });
  }

  limparRecado() {
    if (this.estado.erro || this.estado.aviso) this.mudar({ erro: null, aviso: null });
  }

  // ----------------------------------------------------------------
  // Leituras de alta frequência — NÃO passam por estado de React.
  // A curva e os medidores são lidos num requestAnimationFrame pelos
  // componentes; 20 amostras por segundo virando re-render seria
  // desperdício puro numa tela que precisa ser rápida.
  // ----------------------------------------------------------------
  // Funções-propriedade, não métodos: elas são passadas por referência
  // para os componentes (e entram em dependências de efeito), então
  // precisam de identidade estável e de `this` amarrado.
  lerCurva = (): Amostra[] => {
    return this.janela;
  };

  lerNiveis = (): { v: number; c: number } => {
    const f = this.usandoWorklet ? pctRms : pctAnalisador;
    return { v: f(this.nivelV), c: f(this.nivelC) };
  };

  // 0..1 na escala do caminho de medição que está ativo. Quem desenha não
  // precisa saber se a energia veio do worklet (RMS de onda) ou do
  // AnalyserNode (média de espectro) — as escalas são diferentes.
  escala = (x: number): number => {
    const f = this.usandoWorklet ? pctRms : pctAnalisador;
    return f(x) / 100;
  };

  // ================================================================
  // Áudio
  // ================================================================
  private async abrirCanais(idV: string, idC: string, modo: Modo): Promise<MediaStreamTrack> {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const pegar = async (id: string) => {
      const base: MediaTrackConstraints = id
        ? { deviceId: { exact: id }, channelCount: 1 }
        : { channelCount: 1 };
      const s = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(base, CRU) });
      this.streams.push(s);
      return ctx.createMediaStreamSource(s);
    };

    const fV = await pegar(idV);
    // No push-to-talk há UMA fonte só: quem rotula é a tecla, não a energia.
    const fC = modo === "dois" ? await pegar(idC) : null;

    // Um AudioContext pode nascer suspenso; suspenso, o worklet não processa.
    try {
      await ctx.resume();
    } catch {}

    this.usandoWorklet = await this.ligarWorklet(fV, fC, modo);
    if (!this.usandoWorklet) this.ligarAnalisadores(fV, fC);

    // Mistura para UM reconhecedor. Não conecta em ctx.destination: tocar
    // nas caixas criaria eco de volta no microfone.
    const dest = ctx.createMediaStreamDestination();
    fV.connect(dest);
    if (fC) fC.connect(dest);
    return dest.stream.getAudioTracks()[0];
  }

  // Caminho bom: AudioWorklet. process() roda na thread de renderização de
  // áudio, que o Chrome NÃO estrangula com a aba oculta. No modo "duas
  // entradas" isso é a diferença entre funcionar e não funcionar, porque o
  // vendedor está falando no celular e a janela não tem foco.
  private async ligarWorklet(
    fV: MediaStreamAudioSourceNode,
    fC: MediaStreamAudioSourceNode | null,
    modo: Modo
  ): Promise<boolean> {
    const ctx = this.ctx!;
    if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
      this.semWorklet("este navegador não tem AudioWorklet", modo);
      return false;
    }
    // Tudo num try só: carregar o módulo, criar o nó E ligar o grafo.
    // Qualquer um dos três pode falhar e em todos os casos queremos o
    // fallback, não uma exceção subindo até o botão.
    try {
      await ctx.audioWorklet.addModule("/worklet-energia.js");
      const medidor = new AudioWorkletNode(ctx, "medidor-energia", {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { intervaloMs: AMOSTRA_MS },
      });
      this.medidor = medidor;

      // Âncora do relógio do contexto para relógio de parede. Carrega um
      // erro da ordem de dezenas de ms; contra o 1 Hz do estrangulamento
      // que estamos evitando, é ruído.
      this.ancoraCtx = Date.now() - ctx.currentTime * 1000;

      medidor.port.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { t: number; eV: number; eC: number };
        this.empurrarAmostra(this.ancoraCtx + m.t * 1000, m.eV, m.eC);
      };

      fV.connect(medidor, 0, 0); // input 0 do medidor = você
      if (fC) fC.connect(medidor, 0, 1); // input 1 = cliente; vazio no push-to-talk

      // O grafo do Web Audio é puxado pelo destino: nó que não alcança o
      // destination não tem process() chamado. O ganho 0 garante que nada
      // volta para as caixas e vira eco no microfone.
      const ganhoMudo = ctx.createGain();
      ganhoMudo.gain.value = 0;
      medidor.connect(ganhoMudo);
      ganhoMudo.connect(ctx.destination);
      this.ganhoMudo = ganhoMudo;
    } catch (e) {
      if (this.medidor) {
        this.medidor.port.onmessage = null;
        try {
          this.medidor.disconnect();
        } catch {}
      }
      if (this.ganhoMudo) {
        try {
          this.ganhoMudo.disconnect();
        } catch {}
      }
      this.medidor = null;
      this.ganhoMudo = null;
      this.semWorklet(texto(e), modo);
      return false;
    }
    return true;
  }

  // Nunca falhar em silêncio. No modo "duas entradas" o fallback é ruim de
  // verdade: a atribuição depende da energia e a janela costuma estar sem foco.
  private semWorklet(motivo: string, modo: Modo) {
    this.usandoWorklet = false;
    this.mudar({
      usandoWorklet: false,
      aviso:
        modo === "dois"
          ? "Sem AudioWorklet (" +
            motivo +
            "). Caí na medição por timer, que o Chrome estrangula para ~1 Hz quando a aba perde o foco — mantenha esta janela visível e em foco, ou a atribuição por energia vai errar."
          : "Sem AudioWorklet (" +
            motivo +
            "). A curva de voz fica grosseira; a atribuição por tecla não é afetada, porque ela não usa timer.",
    });
  }

  // Fallback: AnalyserNode + setInterval. ESTE setInterval é o bug que o
  // worklet contorna (medido: 999/1001/1000/1008/991 ms com AMOSTRA_MS=50,
  // ou seja 1,1 Hz em vez de 20 Hz). Está aqui só para navegador sem
  // AudioWorklet, e semWorklet() avisa o usuário quando caímos nele.
  private ligarAnalisadores(
    fV: MediaStreamAudioSourceNode,
    fC: MediaStreamAudioSourceNode | null
  ) {
    const ctx = this.ctx!;
    this.anV = ctx.createAnalyser();
    this.anV.fftSize = 512;
    this.anV.smoothingTimeConstant = 0.2;
    fV.connect(this.anV);
    if (fC) {
      this.anC = ctx.createAnalyser();
      this.anC.fftSize = 512;
      this.anC.smoothingTimeConstant = 0.2;
      fC.connect(this.anC);
    }
  }

  private nivel(an: AnalyserNode | null): number {
    if (!an) return 0;
    const b = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(b);
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length) / 255;
  }

  private comecarMedicao() {
    if (this.timerNivel) clearInterval(this.timerNivel);
    this.timerNivel = null;
    // Com o worklet não há nada a iniciar: ele posta desde que foi conectado.
    if (this.usandoWorklet) return;
    this.timerNivel = setInterval(() => {
      this.empurrarAmostra(Date.now(), this.nivel(this.anV), this.nivel(this.anC));
    }, AMOSTRA_MS);
  }

  private empurrarAmostra(t: number, eV: number, eC: number) {
    this.nivelV = eV;
    this.nivelC = eC;
    this.janela.push({ t, eV, eC, seu: this.apertado });
    if (this.janela.length > 2000) this.janela = this.janela.slice(-1200);
  }

  private pararAudio() {
    if (this.timerNivel) clearInterval(this.timerNivel);
    this.timerNivel = null;
    if (this.medidor) {
      // Mata o processador na thread de áudio e corta o grafo. Sem isto ele
      // seguiria postando amostras para uma janela que ninguém mais lê.
      try {
        this.medidor.port.postMessage("parar");
      } catch {}
      this.medidor.port.onmessage = null;
      try {
        this.medidor.disconnect();
      } catch {}
      this.medidor = null;
    }
    if (this.ganhoMudo) {
      try {
        this.ganhoMudo.disconnect();
      } catch {}
      this.ganhoMudo = null;
    }
    this.usandoWorklet = false;
    this.anV = null;
    this.anC = null;
    this.nivelV = 0;
    this.nivelC = 0;
    for (const s of this.streams) s.getTracks().forEach((t) => t.stop());
    this.streams = [];
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      void Promise.resolve(c.close()).catch(() => {});
    }
    this.track = null;
  }

  // ================================================================
  // Testar níveis (o modal)
  // ================================================================
  async testar(op: { idV: string; idC: string; modo: Modo }) {
    if (this.estado.situacao !== "parado") return;
    this.pararAudio();
    this.mudar({ erro: null, aviso: null, modo: op.modo });
    try {
      await this.abrirCanais(op.idV, op.idC, op.modo);
    } catch (e) {
      this.pararAudio();
      this.mudar({ testando: false, erro: "Não consegui abrir as entradas: " + texto(e) });
      return;
    }
    this.comecarMedicao();
    this.mudar({ testando: true, usandoWorklet: this.usandoWorklet });
  }

  pararTeste() {
    if (!this.estado.testando) return;
    this.pararAudio();
    this.mudar({ testando: false });
  }

  // ================================================================
  // Ligar / desligar
  // ================================================================
  async ligar(op: { idV: string; idC: string; modo: Modo }) {
    // Idempotente: dois cliques, ou dois caminhos chegando aqui juntos,
    // não podem virar dois reconhecedores. "ligando" já é ocupado.
    if (this.estado.situacao !== "parado") return;

    const SR = obterSR();
    if (!SR) {
      this.mudar({ erro: "Este navegador não tem a Web Speech API. Use o Chrome." });
      return;
    }

    this.mudar({ situacao: "ligando", erro: null, aviso: null, modo: op.modo });
    this.pararAudio(); // um teste de níveis pode estar rodando

    let track: MediaStreamTrack;
    try {
      track = await this.abrirCanais(op.idV, op.idC, op.modo);
    } catch (e) {
      this.pararAudio();
      this.mudar({
        situacao: "parado",
        testando: false,
        erro: "Não consegui abrir as entradas: " + texto(e),
      });
      return;
    }

    // Call nova, contadores novos.
    this.janela = [];
    this.falas = [];
    this.latencias = [];
    this.ultimaMostrada = null;
    this.tUltimoFinal = 0;
    this.seq = 0;
    this.zerarFrase();

    // Semeia as transições com o estado conhecido AGORA. Sem a semente, uma
    // janela de frase que comece antes do primeiro keydown cairia no default
    // (solta): por sorte é o mesmo valor, mas depender de sorte aqui é ruim.
    this.transicoes = [{ t: Date.now(), apertado: this.apertado }];

    this.comecarMedicao();
    this.ligarTeclado();

    this.track = track;
    this.ativo = true;
    const r = this.criarReconhecedor(track);
    this.rec = r;
    try {
      r.start(track);
    } catch (e) {
      this.ativo = false;
      this.desligar();
      this.mudar({ erro: "Não consegui iniciar o reconhecimento: " + texto(e) });
      return;
    }

    this.mudar({
      situacao: "ouvindo",
      testando: false,
      usandoWorklet: this.usandoWorklet,
      card: null,
      historico: [],
      faseCall: null,
      ultimaAcao: null,
      decisoes: 0,
      latencia: null,
      custo: 0,
    });
  }

  desligar = () => {
    if (this.timerLiberar) {
      clearTimeout(this.timerLiberar);
      this.timerLiberar = null;
    }
    this.ativo = false;
    this.zerarFrase();
    this.desligarTeclado();
    if (this.rec) {
      const r = this.rec;
      this.rec = null;
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      r.onstart = null;
      r.onsoundstart = null;
      r.onspeechstart = null;
      try {
        r.abort();
      } catch {}
      if (recAtivo === r) recAtivo = null;
    }
    this.pararAudio();
    this.mudar({
      situacao: "parado",
      testando: false,
      apertado: false,
      ouvindoVoz: false,
      decidindo: false,
    });
  };

  // ================================================================
  // Reconhecimento — UMA instância, no stream misturado
  // ================================================================
  private criarReconhecedor(track: MediaStreamTrack): Reconhecedor {
    const SR = obterSR()!;

    // A trava. Ver o bloco grande no topo do arquivo.
    if (recAtivo) {
      try {
        recAtivo.abort();
      } catch {}
      recAtivo = null;
    }

    const r = new SR();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    recAtivo = r;

    r.onstart = () => this.mudar({ ouvindoVoz: true });

    // Marca o início da fala no domínio do ÁUDIO, não no da rede. É o
    // melhor ancoradouro que existe para a janela de atribuição.
    r.onsoundstart = () => this.marcar("som começou (onsoundstart)");
    r.onspeechstart = () => {
      this.marcar("fala começou (onspeechstart)");
      if (!this.tInicioFrase) this.tInicioFrase = Date.now();
    };

    r.onresult = (ev) => this.aoResultado(ev);

    r.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        this.mudar({ erro: "Permissão de áudio negada." });
        this.desligar();
        return;
      }
      // "no-speech" e "aborted" são rotina: o onend reergue.
      if (ev.error === "network") this.mudar({ aviso: "Rede instável no reconhecimento de voz." });
    };

    // O Chrome encerra a sessão sozinho depois de silêncio. Reergue.
    r.onend = () => {
      this.mudar({ ouvindoVoz: false });
      if (!this.ativo || this.rec !== r) return;
      setTimeout(() => {
        if (!this.ativo || this.rec !== r) return;
        try {
          r.start(this.track ?? track);
        } catch {
          setTimeout(() => {
            if (this.ativo && this.rec === r && r.onend) r.onend();
          }, 500);
        }
      }, 250);
    };

    return r;
  }

  // ----------------------------------------------------------------
  // PONTO 5 — a janela de atribuição precisa ter LARGURA.
  //
  // `de` é o início da frase. Ancoramos em onspeechstart (domínio do
  // áudio); na falta dele, em agora - 1200 ms, porque quando o primeiro
  // parcial chega a pessoa já começou a falar há um tempo — o ASR do
  // Chrome atrasa. Marcar o início como `agora` criava janela de largura
  // ZERO: a atribuição devolvia null (e null aqui significa "não dá para
  // atribuir com honestidade", então é respeitado) e a PRIMEIRA chance de
  // decidir era jogada fora. Era isto que fazia o sistema parecer lento.
  // ----------------------------------------------------------------
  private quemFalouNaJanela(agora: number): string | null {
    const de = Math.max(this.tUltimoFinal, this.tInicioFrase) || agora - 6000;
    // Push-to-talk decide pelas TRANSIÇÕES da tecla (exato, sem timer);
    // duas entradas decidem pela energia amostrada no AudioWorklet.
    return this.estado.modo === "tecla"
      ? quemFalouPorTransicoes(this.transicoes, de, agora)
      : quemFalou(this.janela, de, agora);
  }

  private zerarFrase() {
    if (this.timerParcial) clearTimeout(this.timerParcial);
    this.timerParcial = null;
    this.parcialAtual = "";
    this.textoDecidido = "";
    this.tInicioFrase = 0;
    this.ultimoDisparo = 0;
  }

  // ----------------------------------------------------------------
  // PONTO 4 — decidir com texto PARCIAL, sem esperar silêncio.
  //
  // O Chrome só marca isFinal depois de detectar fim de fala, o que exige
  // pausa. Numa fala longa e sem pausa o final não chega, e uma objeção
  // dita no meio da frase nunca viraria card — foi o que apareceu no
  // primeiro teste ao vivo. Então disparamos por dois motivos:
  //   teto  (1200 ms) -> está falando sem parar;
  //   pausa (500 ms)  -> parou de sair texto novo, a frase acabou.
  //
  // Medido: o Jev não atrapalha aqui. Assim que a objeção é dita, o
  // terminou_de_falar sobe sozinho (0.11 antes de "tá caro", 0.85 depois)
  // e a regra libera o card mesmo com mais palavras vindo atrás.
  // ----------------------------------------------------------------
  private aoResultado(ev: EventoSR) {
    {
      // Quantos parciais o Chrome entrega ANTES do final? É o número que
      // decide se dá para responder durante a fala ou se somos reféns do
      // endpointing dele.
      let fin = 0, parc = 0, tam = 0;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i][0];
        tam = Math.max(tam, (alt?.transcript || "").trim().length);
        ev.results[i].isFinal ? fin++ : parc++;
      }
      this.marcar(fin ? "FINAL do Chrome" : "parcial do Chrome", tam + " ch");
    }
    const agora = Date.now();
    if (!this.tInicioFrase) this.tInicioFrase = agora - PARCIAL.atrasoAsrMs;

    let parcial = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = (ev.results[i][0].transcript || "").trim();
      if (!t) continue;
      if (ev.results[i].isFinal) {
        if (this.timerParcial) clearTimeout(this.timerParcial);
        this.timerParcial = null;
        const quem = this.quemFalouNaJanela(agora);
        this.tUltimoFinal = agora;
        this.zerarFrase();
        if (quem) this.registrar(quem, t);
      } else {
        parcial += t + " ";
      }
    }

    parcial = parcial.trim();
    if (!parcial) return;
    this.parcialAtual = parcial;

    const desdeUltima = agora - this.ultimoDisparo;
    const cresceu = parcial.length - this.textoDecidido.length;
    const grandeOBastante = parcial.length >= PARCIAL.minParaPerguntar;

    // Cresceu o suficiente, respeitando o piso entre perguntas. É o caminho
    // normal numa fala contínua - o texto cresce e a objeção aparece nele.
    const porCrescimento =
      grandeOBastante && cresceu >= PARCIAL.minCrescimento && desdeUltima >= PARCIAL.minIntervaloMs;

    // Rede: falando sem parar mas sem crescer o bastante.
    const porTeto = grandeOBastante && desdeUltima >= PARCIAL.tetoMs;

    if (porCrescimento || porTeto) {
      this.dispararParcial(parcial, agora);
    } else {
      // O silêncio virou caso de borda: só vale quando o texto PAROU de
      // crescer. Rearmar a cada parcial era o que travava tudo antes.
      if (this.timerParcial) clearTimeout(this.timerParcial);
      this.timerParcial = setTimeout(
        () => this.dispararParcial(this.parcialAtual, Date.now()),
        PARCIAL.pausaMs
      );
    }
  }

  // Pergunta ao Jev com o texto que existe até agora, sem esperar o ponto final.
  // ------------------------------------------------------------------
  // Cronômetro de diagnóstico.
  //
  // O rodapé já mostra o tempo do Jev, mas ele é só o último pedaço. O
  // atraso que se sente na call pode estar no ASR do Chrome (entre a fala
  // e o primeiro parcial), na nossa política de disparo, ou na rede. Sem
  // separar os três, qualquer ajuste é chute.
  //
  // Leia no console da aba:  copilotoCronometro()
  // ------------------------------------------------------------------
  private marcar(evento: string, extra?: string) {
    const g = globalThis as unknown as { __cron?: { t: number; evento: string; extra?: string }[] };
    if (!g.__cron) g.__cron = [];
    g.__cron.push({ t: Math.round(performance.now()), evento, extra });
    if (g.__cron.length > 200) g.__cron.splice(0, g.__cron.length - 200);
  }

  private dispararParcial(txt: string, agora: number) {
    if (!txt || !this.ativo) return;
    // Não repergunta a mesma coisa. Mas o portão só vale da SEGUNDA vez em
    // diante: exigir crescimento na primeira pulava objeção curta, e
    // "tá caro" tem 7 caracteres — justamente a que mais importa.
    if (
      this.textoDecidido &&
      txt.length - this.textoDecidido.length < PARCIAL.minCrescimento &&
      txt.startsWith(this.textoDecidido)
    )
      return;
    const quem = this.quemFalouNaJanela(agora);
    if (quem !== "cliente") return; // só a fala do cliente decide
    this.textoDecidido = txt;
    this.ultimoDisparo = agora;
    // NÃO entra no histórico: parcial ainda vai mudar.
    this.marcar("→ perguntei ao Jev", txt.length + " ch");
    void this.decidir(txt);
  }

  private registrar(quem: string, txt: string) {
    this.falas.push({ quem, fala: txt });
    if (this.falas.length > 40) this.falas = this.falas.slice(-40);
    publicarEvento({ tipo: "fala", quem, texto: txt });
    if (quem === "cliente") {
      this.marcar("→ perguntei ao Jev (final)", txt.length + " ch");
      void this.decidir(txt);
      return;
    }
    // A fala do VENDEDOR também decide agora, mas só no FINAL da frase.
    // O cliente dispara no parcial porque velocidade decide o card; aqui o
    // que importa é "o que ele acabou de fazer", e isso só faz sentido com a
    // frase inteira. De quebra, custa metade das chamadas.
    if (this.fluxo && this.co) {
      this.marcar("→ perguntei ao Jev (vendedor)", txt.length + " ch");
      void this.decidirVendedor(txt);
    }
  }

  // ================================================================
  // Decisão — a regra é de lib/decisao.js, aqui só se pergunta
  // ================================================================
  private async decidir(textoCliente: string) {
    const meu = ++this.seq; // PONTO 7: número de sequência
    const t0 = performance.now();
    this.mudar({ decidindo: true });

    let json: { usage?: unknown; error?: string } | null = null;
    try {
      const r = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.modelo,
          state: montarState(this.falas, textoCliente),
          // As 4 de sempre mais o sentimento. Uma chamada só: o Jev aceita
          // várias perguntas de uma vez, então isto não dobra latência.
          questions: perguntasDoCliente(this.objecoes),
        }),
      });
      json = (await r.json()) as { usage?: unknown; error?: string };
      if (!r.ok) throw new Error(json?.error || "HTTP " + r.status);
    } catch (e) {
      if (meu === this.seq) this.mudar({ decidindo: false, aviso: "Falha ao falar com o Jev: " + texto(e) });
      return;
    }

    const ms = Math.round(performance.now() - t0);
    if (meu < this.seq) return; // chegou fala mais nova: esta resposta é velha

    const custoDesta = calcularCusto(json?.usage) as number;
    this.latencias.push(ms);
    const media = Math.round(this.latencias.reduce((a, b) => a + b, 0) / this.latencias.length);

    // Com fluxo escolhido, o turno passa pelo copiloto: ele aplica a MESMA
    // regra de decisao.js e ainda colhe telefone e nome, move a etapa e monta
    // as dicas. Sem fluxo, o motor segue como antes — só card de objeção.
    let d: Decisao;
    if (this.fluxo && this.co) {
      const r = turnoDoCliente(this.fluxo, this.co, json, textoCliente, this.objecoes) as {
        co: EstadoCopiloto;
        decisao: Decisao;
      };
      this.co = r.co;
      d = r.decisao;
      this.ultimaMostrada = r.co.ultimaMostrada;
      this.publicarFluxo();
    } else {
      d = decidirRegra(json, this.objecoes, this.ultimaMostrada);
    }

    this.marcar("← Jev respondeu");
    let card = this.estado.card;
    let historico = this.estado.historico;

    if (d.acao === "card" && d.objecao) {
      this.ultimaMostrada = d.escolha;
      const o = d.objecao;
      card = {
        chave: ++this.chaveCard,
        tipo: "card",
        rotulo: o.nome || o.id,
        // A headline é a frase que o vendedor vai FALAR; o pivot é a regra
        // que evita o erro. O argumento fica guardado para a seta ↓.
        headline: o.headline || o.nome || o.id,
        pivot: o.pivot || "",
        argumento: o.argumento || "",
        confianca: d.confianca,
        ms,
        falaCliente: textoCliente,
      };
      historico = [{ chave: card.chave, nome: o.nome || o.id }, ...historico].slice(0, 8);
    } else if (d.acao === "alerta") {
      card = {
        chave: ++this.chaveCard,
        tipo: "alerta",
        rotulo: "fora do catálogo",
        headline: "Sem argumento pronto",
        pivot: "Devolva uma pergunta e ganhe tempo. Cadastre esta objeção depois da call.",
        argumento: "",
        confianca: d.temObjecao,
        ms,
        falaCliente: textoCliente,
      };
    }

    this.mudar({
      card,
      historico,
      faseCall: d.fase ? NOMES[d.fase] || d.fase : this.estado.faseCall,
      ultimaAcao: d.acao,
      decisoes: this.estado.decisoes + 1,
      latencia: media,
      custo: this.estado.custo + custoDesta,
      decidindo: false,
      aviso: null,
    });

    publicarEvento({
      tipo: "decisao",
      acao: d.acao,
      fase: d.fase,
      confianca: d.confianca,
      temObjecao: d.temObjecao,
      escolha: d.escolha,
      objecao: d.objecao || null,
      falaCliente: textoCliente,
      ms,
      custo: custoDesta,
    });
  }

  // ================================================================
  // O turno do VENDEDOR
  // ================================================================
  // Pergunta duas coisas: o que ele acabou de fazer, e em que etapa a conversa
  // está. O que ele JÁ FEZ antes não se pergunta — isso é flag no estado do
  // fluxo, e perguntar daria resposta trêmula (ver o cabeçalho de lib/fluxo.js).
  //
  // Sequência PRÓPRIA (`seqV`): esta chamada e a do cliente correm em paralelo
  // e não podem invalidar uma à outra. Usar `this.seq` faria a fala do vendedor
  // descartar a decisão de objeção que estava chegando.
  private async decidirVendedor(texto: string) {
    if (!this.fluxo || !this.co) return;
    const meu = ++this.seqV;
    const t0 = performance.now();

    let json: { usage?: unknown; error?: string } | null = null;
    try {
      const r = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.modelo,
          state: montarState(this.falas, texto),
          questions: perguntasDoVendedor(this.fluxo, this.co),
        }),
      });
      json = (await r.json()) as { usage?: unknown; error?: string };
      if (!r.ok) throw new Error(json?.error || "HTTP " + r.status);
    } catch {
      // Falha aqui NÃO vira aviso na tela. O caminho crítico é o card de
      // objeção; a dica de lacuna é um extra. Um banner vermelho no meio da
      // ligação por causa do extra custa mais do que o extra vale.
      this.marcar("← turno do vendedor falhou (silencioso)");
      return;
    }

    if (meu < this.seqV) return; // chegou fala mais nova do vendedor

    const ms = Math.round(performance.now() - t0);
    const custoDesta = calcularCusto(json?.usage) as number;

    const r = turnoDoVendedor(this.fluxo, this.co, json, texto) as {
      co: EstadoCopiloto;
      acao: string | null;
    };
    this.co = r.co;
    this.publicarFluxo();
    this.mudar({ custo: this.estado.custo + custoDesta });
    this.marcar("← vendedor: " + (r.acao || "nada"), ms + "ms");

    publicarEvento({
      tipo: "turno-vendedor",
      acao: r.acao,
      etapa: this.estado.etapa,
      texto,
      ms,
      custo: custoDesta,
    });
  }

  // ================================================================
  // PONTO 3 — push-to-talk por TRANSIÇÕES, nunca por amostragem.
  //
  // O reconhecedor não para nem começa junto com a tecla: start →
  // audiostart leva ~208 ms e comeria o início de cada frase. Ele roda
  // contínuo e a tecla só ROTULA, pela janela de tempo da frase.
  //
  // Guardamos transições, não amostras, por dois motivos nesta ordem:
  //
  //  1. o Chrome estrangula setInterval para ~1 Hz quando a aba está
  //     oculta ou sem foco (medido nesta máquina: 999/1001/1000/1008/991
  //     ms com intervalo pedido de 50 ms). Uma frase de 2 s rendia 2
  //     amostras em vez de 40, e a fração que decide quem falou virava
  //     chute de resolução 50%. keydown/keyup não são timers: chegam
  //     quando acontecem.
  //
  //  2. e.timeStamp diz quando a tecla foi FISICAMENTE acionada, não
  //     quando o handler rodou. Com a thread principal ocupada (fetch do
  //     Jev, montagem do card) o handler atrasa dezenas de ms; o
  //     timestamp do evento não.
  //
  // A integração da fração está em lib/atribuir.js. Não troque isto por
  // amostragem periódica "para simplificar": o bug volta inteiro.
  // ================================================================
  private registrarTransicao(apertado: boolean, ts: number | undefined) {
    this.transicoes.push({ t: paraRelogio(ts), apertado });
    // Teto para não crescer sem fim numa call longa. Podamos guardando uma
    // transição a MAIS do que a janela útil precisa: a mais antiga que sobra
    // funciona como semente do estado para janelas que comecem antes dela.
    // Esvaziar a lista faria o estado voltar ao default (solta) no meio de
    // um aperto — e a frase seria rotulada como do cliente.
    if (this.transicoes.length > 400) this.transicoes = this.transicoes.slice(-201);
  }

  private aoKeydown = (e: KeyboardEvent) => {
    if (e.code !== "Space" || this.estado.modo !== "tecla" || e.repeat) return;
    const alvo = document.activeElement;
    if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
    e.preventDefault(); // senão o espaço rola a página
    if (this.apertado) return; // já contabilizada (auto-repeat, teclado duplo)
    this.apertado = true;
    this.registrarTransicao(true, e.timeStamp);
    this.mudar({ apertado: true });
  };

  private aoKeyup = (e: KeyboardEvent) => {
    if (e.code !== "Space" || this.estado.modo !== "tecla") return;
    e.preventDefault();
    if (!this.apertado) return; // keyup sem keydown correspondente
    this.apertado = false;
    this.registrarTransicao(false, e.timeStamp);
    this.mudar({ apertado: false });
  };

  // Perder o foco com a tecla presa deixaria TUDO depois rotulado como
  // você: o keyup nem chega quando a janela perde o foco no meio do
  // aperto. Aqui não há e.timeStamp útil, então o instante do próprio
  // blur é o melhor que temos.
  private aoBlur = () => {
    if (!this.apertado) return;
    this.apertado = false;
    this.registrarTransicao(false, performance.now());
    this.mudar({ apertado: false });
  };

  private ligarTeclado() {
    if (this.tecladoLigado || typeof document === "undefined") return;
    document.addEventListener("keydown", this.aoKeydown);
    document.addEventListener("keyup", this.aoKeyup);
    window.addEventListener("blur", this.aoBlur);
    this.tecladoLigado = true;
  }

  private desligarTeclado() {
    if (!this.tecladoLigado) return;
    document.removeEventListener("keydown", this.aoKeydown);
    document.removeEventListener("keyup", this.aoKeyup);
    window.removeEventListener("blur", this.aoBlur);
    this.tecladoLigado = false;
    this.apertado = false;
  }

  // Só para teste: diz se existe reconhecedor vivo neste processo.
  static recAtivo() {
    return recAtivo;
  }
}

// ------------------------------------------------------------------
// UM motor por módulo. As duas montagens do StrictMode compartilham
// este objeto, então não existe "o outro reconhecedor".
// ------------------------------------------------------------------
let instancia: MotorCopiloto | null = null;

export function obterMotor(): MotorCopiloto {
  if (!instancia) instancia = new MotorCopiloto();
  return instancia;
}

export const ESTADO_INICIAL = INICIAL;

// ====================================================================
// Leitor do cronômetro, para o console da aba.
//
//   copilotoCronometro()
//
// Imprime a linha do tempo da última frase com o intervalo entre cada
// etapa, para separar o que é ASR do Chrome, o que é nossa política de
// disparo e o que é rede.
// ====================================================================
if (typeof window !== "undefined") {
  (window as unknown as { copilotoCronometro: () => void }).copilotoCronometro = () => {
    const g = globalThis as unknown as { __cron?: { t: number; evento: string; extra?: string }[] };
    const l = g.__cron || [];
    if (!l.length) { console.log("Nada gravado ainda. Ligue e fale uma frase."); return; }
    // Corta na última vez que uma fala começou: queremos UMA frase.
    const i = l.map((x) => x.evento).lastIndexOf("fala começou (onspeechstart)");
    const frase = i >= 0 ? l.slice(i) : l;
    const t0 = frase[0].t;
    console.table(
      frase.map((x, k) => ({
        "desde a fala": (x.t - t0) + " ms",
        "desde o anterior": k ? "+" + (x.t - frase[k - 1].t) + " ms" : "—",
        etapa: x.evento,
        "": x.extra || "",
      }))
    );
  };
}
