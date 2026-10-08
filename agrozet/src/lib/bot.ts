// O bot de botão do Pet Shop Agrozet — o coração do produto.
//
// REGRA DESTE ARQUIVO: ZERO I/O. Nada de Supabase, `fetch`, `process.env` ou
// qualquer import de `next`. Só função pura: entra um snapshot do estado
// (`BotEntrada`), sai uma decisão (`BotSaida`). Quem faz I/O é o webhook, que
// monta a entrada, chama `decidirBot` e executa a decisão. É isso que permite
// cobrir cada caminho com teste unitário sem mock de rede nem de banco.

import { MAX_REPLY_BUTTONS, MAX_ITENS_LISTA } from './botLimites'
import type { BotStage, BotMenu } from './botTypes'

// Reexportados por conveniência de quem consome só `bot.ts`. A DEFINIÇÃO mora
// em `botTypes.ts` e ninguém a redefine aqui.
export type { BotStage, BotMenu }

export type BotOpcao = { botao_id: string; titulo: string; resposta: string; ordem: number; ativo: boolean }
export type BotConfig = { ativo: boolean; saudacao: string; rodape: string | null; fecho: string }
export type BotAcao = 'start' | 'capture_choice' | 'remenu' | 'giveup' | 'none'

export type BotEntrada = {
  clienteExiste: boolean
  stage: BotStage | null
  config: BotConfig
  opcoes: BotOpcao[]
  /** id do botão/item quando a mensagem é interactive; null para texto ou mídia. */
  botaoId: string | null
  /** Quantas mensagens interactive outbound saíram para este telefone na última hora. */
  menusEnviadosNaUltimaHora: number
  /** Quantas respostas do bot saíram para este telefone na última hora. */
  respostasNaUltimaHora: number
  /** Segundos entre a última fala do bot e esta mensagem; undefined se o bot nunca falou. */
  segundosDesdeUltimaFala?: number
}

export type BotSaida = {
  acao: BotAcao
  texto?: string          // texto simples (capture_choice). Exclusivo com `menu`.
  menu?: BotMenu          // menu interativo (start, remenu). Exclusivo com `texto`.
  proximoStage?: BotStage // novo bot_stage a gravar. Ausente = não mexe.
  stageEsperado?: BotStage | null  // bot_stage exigido no UPDATE condicional.
  servico?: string        // botao_id escolhido, só em capture_choice.
  erro?: string           // erro operacional a registrar. Não impede a ação.
}

/**
 * Teto de respostas automáticas por hora para o MESMO telefone.
 *
 * POR QUE existe (parece paranoia até você conhecer a história): no sistema de
 * referência, o número do petshop recebeu mensagem de OUTRO número que também
 * era um bot. O bot de lá respondia cada mensagem automática com o próprio
 * menu; o nosso respondia o menu de lá com o nosso menu. Os dois trocaram 182
 * mensagens em 7 minutos, cada uma delas uma mensagem paga e um ponto na
 * reputação de qualidade do número na Meta. Nenhum humano estava olhando.
 *
 * O teto é a única coisa que termina esse laço: um bot do outro lado não se
 * cansa e não tem como ser convencido a parar. Acima do teto ficamos mudos e o
 * laço morre em no máximo 6 mensagens em vez de 182.
 */
export const BOT_TETO_RESPOSTAS_POR_HORA = 6

/**
 * Janela de leitura: segundos que assumimos que um humano precisa para ao menos
 * VER o menu que acabou de chegar.
 *
 * POR QUE existe: nos dados do sistema de referência, nenhuma resposta válida
 * (nome real de pet, escolha coerente) chegou em menos de 10 segundos depois do
 * menu — ninguém lê três opções e decide nesse tempo. Em contrapartida, 14 das
 * 17 capturas erradas chegaram dentro dessa janela: eram mensagens que o
 * cliente já estava DIGITANDO quando o menu caiu na tela, ou o segundo/terceiro
 * balão de uma frase quebrada em três. Tratá-las como "resposta inválida" e
 * reenviar o menu é o pior dos mundos: empurra o menu de novo para alguém que
 * ainda não leu o primeiro, e é o que alimenta o laço acima.
 *
 * Então: dentro da janela, ficamos calados. O menu já está na tela dele.
 */
export const BOT_JANELA_LEITURA_SEGUNDOS = 10

/** Rótulo do botão que abre a lista, quando o menu passa de 3 opções. */
const ROTULO_LISTA = 'Ver serviços'

function opcoesAtivasOrdenadas(opcoes: BotOpcao[]): BotOpcao[] {
  // `ordem` é a fonte de verdade — a posição no array vem do banco e não há
  // garantia de ordenação estável vindo de lá.
  return opcoes.filter((o) => o.ativo).sort((a, b) => a.ordem - b.ordem)
}

/**
 * Monta o menu a ser enviado à Meta a partir da config e das opções ativas.
 *
 * Escolhe o formato pela CONTAGEM de opções ativas: até 3 cabem em reply
 * buttons; de 4 em diante tem de ser list message, porque a Cloud API recusa o
 * 4º reply button — e uma requisição recusada é um cliente sem resposta.
 *
 * `erro` é informativo: descreve um problema operacional (truncamento, nenhuma
 * opção ativa) para o chamador registrar. Quando o menu vem `null`, não há o
 * que enviar.
 */
export function montarMenu(
  config: BotConfig,
  opcoes: BotOpcao[]
): { menu: BotMenu | null; erro?: string } {
  const ativas = opcoesAtivasOrdenadas(opcoes)

  if (ativas.length === 0) {
    return {
      menu: null,
      erro: 'Nenhuma opção de menu ativa: o bot não tem o que enviar.',
    }
  }

  if (ativas.length <= MAX_REPLY_BUTTONS) {
    return {
      menu: {
        formato: 'button',
        corpo: config.saudacao,
        rodape: config.rodape,
        botoes: ativas.map((o) => ({ id: o.botao_id, titulo: o.titulo })),
      },
    }
  }

  // Acima de MAX_ITENS_LISTA a Meta também recusa, então truncamos em vez de
  // mandar uma requisição que volta 400. O corte é reportado como `erro` para
  // alguém arrumar a configuração; o cliente, pelo menos, recebe um menu.
  const usadas = ativas.slice(0, MAX_ITENS_LISTA)
  const erro =
    ativas.length > MAX_ITENS_LISTA
      ? `O menu tem ${ativas.length} opções ativas e a lista aceita no máximo ${MAX_ITENS_LISTA}: as demais foram cortadas.`
      : undefined

  return {
    menu: {
      formato: 'list',
      corpo: config.saudacao,
      rodape: config.rodape,
      rotulo: ROTULO_LISTA,
      itens: usadas.map((o) => ({ id: o.botao_id, titulo: o.titulo })),
    },
    ...(erro ? { erro } : {}),
  }
}

/**
 * Decide o que o bot faz com uma mensagem recebida.
 *
 * A ORDEM de avaliação abaixo é o contrato — não é estilo. Em particular, a
 * escolha válida de botão é resolvida ANTES das duas guardas, porque quem
 * apertou o botão merece resposta: as guardas existem para calar o caminho de
 * repergunta (`remenu`), não para engolir uma escolha legítima do cliente.
 */
export function decidirBot(entrada: BotEntrada): BotSaida {
  // 1. Bot desligado: nem para contato novo.
  if (!entrada.config.ativo) {
    return { acao: 'none' }
  }

  // 2. Sem menu possível não existe fluxo nenhum — nem saudação, nem remenu.
  const { menu, erro } = montarMenu(entrada.config, entrada.opcoes)
  if (menu === null) {
    return { acao: 'none', erro }
  }

  // 3. Contato novo: saudação + menu. `stageEsperado: null` faz o UPDATE ser
  // condicional ao stage ainda estar vazio, o que torna o start idempotente
  // mesmo se o webhook entregar a mesma mensagem duas vezes.
  if (!entrada.clienteExiste) {
    return {
      acao: 'start',
      menu,
      proximoStage: 'awaiting_choice',
      stageEsperado: null,
      ...(erro ? { erro } : {}),
    }
  }

  // 4. Contato existente fora do fluxo (já escolheu, ou nunca entrou nele):
  // o bot não se mete. A conversa é do atendente humano.
  if (entrada.stage !== 'awaiting_choice') {
    return { acao: 'none' }
  }

  // 5. Escolha válida de uma opção ATIVA. Vem antes das guardas de propósito.
  if (entrada.botaoId !== null) {
    const escolhida = opcoesAtivasOrdenadas(entrada.opcoes).find(
      (o) => o.botao_id === entrada.botaoId
    )
    if (escolhida) {
      return {
        acao: 'capture_choice',
        texto: `${escolhida.resposta}\n\n${entrada.config.fecho}`,
        proximoStage: 'done',
        stageEsperado: 'awaiting_choice',
        servico: escolhida.botao_id,
        ...(erro ? { erro } : {}),
      }
    }
    // Botão desconhecido ou de opção desativada cai no caminho de repergunta
    // abaixo, junto com texto livre — pode ser um menu antigo na tela do
    // cliente, cuja opção o admin já removeu.
  }

  // 6. GUARDA DO TETO. Ver BOT_TETO_RESPOSTAS_POR_HORA: foi um laço
  // robô-a-robô de 182 mensagens em 7 minutos que motivou este if. Só o
  // caminho automático é cortado; a escolha do cliente já saiu no passo 5.
  if (entrada.respostasNaUltimaHora >= BOT_TETO_RESPOSTAS_POR_HORA) {
    return { acao: 'none' }
  }

  // 7. GUARDA DA JANELA DE LEITURA. Ver BOT_JANELA_LEITURA_SEGUNDOS: mensagem
  // que chega em menos de 10 s foi escrita antes de o cliente ler o menu — ele
  // estava digitando quando o menu caiu, ou quebrou a frase em vários balões.
  // O menu já está na tela dele; reenviar só empurra o laço. `undefined`
  // significa que o bot nunca falou, então não há janela a respeitar.
  if (
    entrada.segundosDesdeUltimaFala !== undefined &&
    entrada.segundosDesdeUltimaFala < BOT_JANELA_LEITURA_SEGUNDOS
  ) {
    return { acao: 'none' }
  }

  // 8. Já insistimos duas vezes e o cliente continua fora do menu. Desistimos
  // de automatizar: sem texto, sem menu, só fecha o fluxo do bot e deixa a
  // conversa para o humano. Repetir uma terceira vez só irrita.
  if (entrada.menusEnviadosNaUltimaHora >= 2) {
    return {
      acao: 'giveup',
      proximoStage: 'done',
      stageEsperado: 'awaiting_choice',
    }
  }

  // 9. Primeira insistência: reenvia o menu. Não mexe no stage — continua
  // `awaiting_choice`, esperando a escolha.
  return { acao: 'remenu', menu, ...(erro ? { erro } : {}) }
}
