// Motor do simulador de WhatsApp do modo demo.
//
// REGRA DESTE ARQUIVO: ZERO I/O e ZERO React. Entra um estado + uma mensagem do
// "cliente", sai um estado novo. É o mesmo contrato de `src/lib/bot.ts`, e pelo
// mesmo motivo: é o que permite testar cada caminho do demo sem browser.
//
// POR QUE ELE EXISTE: no demo, `decidirBot` roda de verdade no browser. Mas
// `decidirBot` é um decisor sem memória — ele recebe um SNAPSHOT (stage,
// contadores da última hora, segundos desde a última fala) que no produto é
// montado pelo webhook a partir do banco. Este módulo é o webhook do demo: ele
// guarda o histórico e DERIVA desse histórico exatamente os mesmos campos, com
// a mesma semântica de `src/app/api/webhook/route.ts`:
//
//   menusEnviadosNaUltimaHora  = falas do bot com menu interativo, < 1 h
//   respostasNaUltimaHora      = todas as falas do bot, < 1 h
//   segundosDesdeUltimaFala    = agora − última fala do bot (undefined se nunca falou)
//
// É isso que faz as duas guardas do produto funcionarem de verdade no demo, em
// vez de serem simuladas. Nenhuma guarda está desligada aqui.
//
// ---------------------------------------------------------------------------
// DECISÃO 1 — O RELÓGIO É INJETADO, E A UI É QUEM MENTE (SE QUISER)
// ---------------------------------------------------------------------------
// As guardas dependem de tempo real: a janela de leitura cala o bot por 10 s
// depois de cada fala dele. Num demo, a dona do petshop toca dois botões em 3
// segundos — e com o relógio de parede o bot ficaria mudo, o que parece defeito
// e queima o entregável justamente no momento em que ela está encantada.
//
// Desligar a guarda no demo seria desonesto: o produto que ela vai receber TEM
// essa guarda. Então o motor não lê `Date.now()` em lugar nenhum: todo passo
// recebe `agoraMs` de fora. O motor é honesto; o relógio é responsabilidade de
// quem chama.
//
// `SimuladorWhatsApp.tsx` passa um relógio VIRTUAL que avança
// `PASSO_DE_TURNO_MS` (12 s, um pouco acima da janela) a cada turno do cliente.
// Em tempo simulado, portanto, ela sempre "leu" o menu antes de responder — o
// que é verdade: ela leu. O que o relógio virtual corrige é só a distorção de
// que o demo comprime minutos de conversa em segundos de uso.
//
// E a guarda continua demonstrável: se o cliente manda uma segunda mensagem
// enquanto o bot ainda está digitando, a UI NÃO avança o turno, as duas caem no
// mesmo instante simulado e a janela de leitura cala o bot de verdade — que é
// precisamente o caso real que a guarda existe para cobrir (a frase quebrada em
// três balões, escrita antes de o menu chegar na tela).
//
// ---------------------------------------------------------------------------
// DECISÃO 2 — O SILÊNCIO É EXPLICADO
// ---------------------------------------------------------------------------
// `decidirBot` devolve `{ acao: 'none' }` sem dizer por quê — no produto isso é
// suficiente, porque ninguém está olhando. Num simulador, silêncio sem
// explicação é indistinguível de bug, e o bug imaginado é pior que o silêncio
// real.
//
// Então o passo devolve `silencio: Silencio | null`. `explicarSilencio` deriva o
// motivo reavaliando as MESMAS condições, NA MESMA ORDEM de `decidirBot`. Isso é
// um espelho, e espelho pode rachar: se a ordem de `decidirBot` mudar, mude aqui
// também. Em troca, nada do comportamento depende deste espelho — ele só rotula
// uma decisão que já foi tomada, e um rótulo errado nunca muda a resposta.

import {
  decidirBot,
  montarMenu,
  BOT_TETO_RESPOSTAS_POR_HORA,
  BOT_JANELA_LEITURA_SEGUNDOS,
  type BotConfig,
  type BotEntrada,
  type BotMenu,
  type BotOpcao,
  type BotSaida,
  type BotStage,
} from '@/lib/bot'
import { BOT_CONFIG_DEMO, BOT_OPCOES_DEMO } from './dados'

/** Janela de contagem das guardas: "na última hora", como no webhook. */
export const JANELA_CONTAGEM_MS = 3_600_000

/**
 * Quanto o relógio virtual da UI avança por turno do cliente. Acima de
 * `BOT_JANELA_LEITURA_SEGUNDOS` de propósito — ver DECISÃO 1 no cabeçalho.
 */
export const PASSO_DE_TURNO_MS = (BOT_JANELA_LEITURA_SEGUNDOS + 2) * 1000

export type QuemFalou = 'cliente' | 'bot'

/** Uma mensagem na conversa simulada. `menu` presente = mensagem interativa. */
export type Fala = {
  id: string
  quem: QuemFalou
  texto: string
  /** Só em fala do bot, e só quando a mensagem é interativa (start / remenu). */
  menu?: BotMenu
  emMs: number
}

export type MotivoSilencio =
  | 'bot_desligado'
  | 'sem_opcoes'
  | 'fluxo_encerrado'
  | 'teto'
  | 'janela'
  | 'entregue_ao_humano'

export type Silencio = { motivo: MotivoSilencio; texto: string }

export type EstadoSimulador = {
  config: BotConfig
  opcoes: BotOpcao[]
  falas: Fala[]
  /** `bot_stage` do cliente simulado. `null` = nunca passou pelo fluxo do bot. */
  stage: BotStage | null
  servicoEscolhido: string | null
  /** Último silêncio deliberado, para a UI avisar. Zerado quando o bot fala. */
  silencio: Silencio | null
}

export type Passo = {
  estado: EstadoSimulador
  /** A fala do cliente e, se houve, a(s) do bot — em ordem de chegada. */
  novasFalas: Fala[]
  silencio: Silencio | null
  /** A decisão crua de `decidirBot`, para quem quiser inspecionar o motor. */
  saida: BotSaida
}

export function estadoInicial(opts?: {
  config?: BotConfig
  opcoes?: BotOpcao[]
  stage?: BotStage | null
}): EstadoSimulador {
  return {
    config: opts?.config ?? BOT_CONFIG_DEMO,
    opcoes: opts?.opcoes ?? BOT_OPCOES_DEMO,
    falas: [],
    stage: opts?.stage ?? null,
    servicoEscolhido: null,
    silencio: null,
  }
}

/**
 * Recomeça a conversa preservando a configuração do bot.
 *
 * Limite assumido e consciente: isto é um cliente NOVO, não o mesmo cliente
 * continuando. Como as guardas contam a partir do histórico, apagar o histórico
 * também zera o teto — no produto o teto é por telefone e não some com um
 * clique. É o comportamento certo para um demo (cada tentativa é uma conversa
 * limpa) e o errado para o produto, que não usa este módulo.
 */
export function reiniciar(estado: EstadoSimulador): EstadoSimulador {
  return estadoInicial({ config: estado.config, opcoes: estado.opcoes })
}

/**
 * O menu que ainda está "na tela" do cliente, ou `null`.
 *
 * Com o fluxo encerrado (`done`) não há mais escolha a capturar: `decidirBot`
 * devolveria `none` para qualquer toque. Devolver `null` aqui é o que permite à
 * UI renderizar os botões do menu antigo desabilitados, como o WhatsApp faz,
 * em vez de oferecer um toque que não vai responder.
 */
export function menuAtual(estado: EstadoSimulador): BotMenu | null {
  if (estado.stage === 'done') return null
  for (let i = estado.falas.length - 1; i >= 0; i -= 1) {
    const f = estado.falas[i]
    if (f.quem === 'bot') return f.menu ?? null
  }
  return null
}

export type Contadores = {
  menusEnviadosNaUltimaHora: number
  respostasNaUltimaHora: number
  segundosDesdeUltimaFala?: number
}

/**
 * Deriva do histórico o que o webhook derivaria do banco.
 *
 * `segundosDesdeUltimaFala` fica `undefined` (não zero) quando o bot nunca
 * falou: zero significaria "falou agora" e calaria a saudação pela janela de
 * leitura — o contrário do que `decidirBot` espera.
 */
export function derivarContadores(falas: Fala[], agoraMs: number): Contadores {
  const corte = agoraMs - JANELA_CONTAGEM_MS
  let menus = 0
  let respostas = 0
  let ultimaFalaMs: number | null = null

  for (const f of falas) {
    if (f.quem !== 'bot') continue
    if (ultimaFalaMs === null || f.emMs > ultimaFalaMs) ultimaFalaMs = f.emMs
    if (f.emMs < corte) continue
    respostas += 1
    if (f.menu) menus += 1
  }

  return {
    menusEnviadosNaUltimaHora: menus,
    respostasNaUltimaHora: respostas,
    ...(ultimaFalaMs === null
      ? {}
      : { segundosDesdeUltimaFala: (agoraMs - ultimaFalaMs) / 1000 }),
  }
}

/** Toque num reply button. `botaoId` é o id da opção. */
export function tocarBotao(
  estado: EstadoSimulador,
  botaoId: string,
  agoraMs: number
): Passo {
  // O webhook grava a escolha com o TÍTULO do botão (é o que a Meta entrega em
  // `button_reply.title`), então o balão do cliente mostra o título, não o id.
  const titulo = estado.opcoes.find((o) => o.botao_id === botaoId)?.titulo ?? botaoId
  return passo(estado, { botaoId, texto: titulo }, agoraMs)
}

/** Texto livre digitado pelo cliente. */
export function digitarTexto(
  estado: EstadoSimulador,
  texto: string,
  agoraMs: number
): Passo {
  return passo(estado, { botaoId: null, texto }, agoraMs)
}

function passo(
  estado: EstadoSimulador,
  entrada: { botaoId: string | null; texto: string },
  agoraMs: number
): Passo {
  const contadores = derivarContadores(estado.falas, agoraMs)

  // `clienteExiste` é `stage !== null`, nunca "existe uma linha de cliente" —
  // ver regra 4 do CLAUDE.md. Aqui a regra é literal: o cliente simulado é novo
  // enquanto não entrou no fluxo do bot.
  const botEntrada: BotEntrada = {
    clienteExiste: estado.stage !== null,
    stage: estado.stage,
    config: estado.config,
    opcoes: estado.opcoes,
    botaoId: entrada.botaoId,
    ...contadores,
  }

  const saida = decidirBot(botEntrada)

  let n = estado.falas.length
  const proximoId = () => {
    n += 1
    return `fala-${n}`
  }

  const falaCliente: Fala = {
    id: proximoId(),
    quem: 'cliente',
    texto: entrada.texto,
    emMs: agoraMs,
  }

  // `texto` e `menu` são exclusivos em `BotSaida`; `giveup` e `none` não têm
  // nenhum dos dois, e é daí que vem o silêncio.
  const falasBot: Fala[] = []
  if (saida.menu) {
    falasBot.push({
      id: proximoId(),
      quem: 'bot',
      texto: saida.menu.corpo,
      menu: saida.menu,
      emMs: agoraMs,
    })
  } else if (saida.texto) {
    falasBot.push({ id: proximoId(), quem: 'bot', texto: saida.texto, emMs: agoraMs })
  }

  // Espelho do UPDATE condicional do webhook: a transição só vale se o stage
  // atual é o que `decidirBot` esperava. No simulador não há concorrência, mas
  // replicar a condição mantém o demo fiel ao produto.
  const stage =
    saida.proximoStage !== undefined && saida.stageEsperado === estado.stage
      ? saida.proximoStage
      : estado.stage

  const silencio =
    falasBot.length === 0 ? explicarSilencio(botEntrada, saida) : null

  return {
    estado: {
      ...estado,
      falas: [...estado.falas, falaCliente, ...falasBot],
      stage,
      servicoEscolhido: saida.servico ?? estado.servicoEscolhido,
      silencio,
    },
    novasFalas: [falaCliente, ...falasBot],
    silencio,
    saida,
  }
}

/**
 * Por que o bot não respondeu. Espelho da ordem de avaliação de `decidirBot` —
 * ver DECISÃO 2 no cabeçalho. Só rotula; não decide nada.
 */
function explicarSilencio(entrada: BotEntrada, saida: BotSaida): Silencio | null {
  if (saida.acao === 'giveup') {
    return {
      motivo: 'entregue_ao_humano',
      texto:
        'O bot já reenviou o menu uma vez e não insiste de novo: a conversa foi entregue ao atendente humano, que vê tudo no CRM. Insistir uma terceira vez só irritaria o cliente.',
    }
  }

  if (!entrada.config.ativo) {
    return {
      motivo: 'bot_desligado',
      texto: 'O bot está desligado na configuração — nem o primeiro contato é saudado.',
    }
  }

  if (montarMenu(entrada.config, entrada.opcoes).menu === null) {
    return {
      motivo: 'sem_opcoes',
      texto:
        'Não há nenhuma opção de menu ativa, então não existe menu a enviar. O erro fica registrado para o dono do pet shop arrumar a configuração.',
    }
  }

  if (entrada.clienteExiste && entrada.stage !== 'awaiting_choice') {
    return {
      motivo: 'fluxo_encerrado',
      texto:
        'O fluxo do bot já terminou nesta conversa. Daqui para frente quem responde é o atendente, pelo CRM — o bot não se mete no meio de um atendimento humano.',
    }
  }

  if (entrada.respostasNaUltimaHora >= BOT_TETO_RESPOSTAS_POR_HORA) {
    return {
      motivo: 'teto',
      texto: `O bot já respondeu ${BOT_TETO_RESPOSTAS_POR_HORA} vezes nesta hora e para por aí. Esse teto existe porque um bot do outro lado da conversa não se cansa: no sistema de referência, dois bots trocaram 182 mensagens em 7 minutos, todas pagas. A mensagem continua gravada e o atendente a vê normalmente.`,
    }
  }

  if (
    entrada.segundosDesdeUltimaFala !== undefined &&
    entrada.segundosDesdeUltimaFala < BOT_JANELA_LEITURA_SEGUNDOS
  ) {
    return {
      motivo: 'janela',
      texto: `A mensagem chegou menos de ${BOT_JANELA_LEITURA_SEGUNDOS} segundos depois da fala do bot, ou seja, foi escrita antes de o menu aparecer na tela. O menu já está lá; reenviar só atropelaria a leitura.`,
    }
  }

  return null
}
