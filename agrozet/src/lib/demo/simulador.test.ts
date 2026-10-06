import { describe, it, expect } from 'vitest'
import { BOT_TETO_RESPOSTAS_POR_HORA, BOT_JANELA_LEITURA_SEGUNDOS } from '@/lib/bot'
import { BOT_CONFIG_DEMO, BOT_OPCOES_DEMO } from './dados'
import {
  estadoInicial,
  reiniciar,
  tocarBotao,
  digitarTexto,
  menuAtual,
  derivarContadores,
  type EstadoSimulador,
  type Fala,
} from './simulador'

// Relógio do teste: um instante fixo e um passo maior que a janela de leitura,
// para que cada turno seja um turno "lido" e as guardas só apareçam quando o
// teste QUER que apareçam.
const T0 = Date.UTC(2026, 9, 5, 12, 0, 0)
const PASSO = (BOT_JANELA_LEITURA_SEGUNDOS + 2) * 1000
const t = (n: number) => T0 + n * PASSO

function falaBot(emMs: number, comMenu = false): Fala {
  return {
    id: `x${emMs}`,
    quem: 'bot',
    texto: 'fala antiga do bot',
    emMs,
    ...(comMenu
      ? { menu: { formato: 'button' as const, corpo: 'c', rodape: null, botoes: [] } }
      : {}),
  }
}

describe('primeiro contato', () => {
  it('responde com saudação + menu de 3 botões e entra em awaiting_choice', () => {
    const p = digitarTexto(estadoInicial(), 'oi', t(1))

    expect(p.saida.acao).toBe('start')
    expect(p.silencio).toBeNull()
    // A fala do cliente e a do bot, nessa ordem.
    expect(p.novasFalas.map((f) => f.quem)).toEqual(['cliente', 'bot'])

    const doBot = p.novasFalas[1]
    expect(doBot.texto).toBe(BOT_CONFIG_DEMO.saudacao)
    expect(doBot.menu?.formato).toBe('button')
    if (doBot.menu?.formato !== 'button') throw new Error('esperava button')
    expect(doBot.menu.botoes.map((b) => b.titulo)).toEqual([
      'Banho e Tosa',
      'Rações e Produtos',
      'Falar com atendente',
    ])

    expect(p.estado.stage).toBe('awaiting_choice')
    expect(menuAtual(p.estado)).toEqual(doBot.menu)
  })

  it('o menu também chega quando o primeiro contato é um toque de botão às cegas', () => {
    // Não acontece no WhatsApp real, mas a UI não deve poder quebrar o motor.
    const p = tocarBotao(estadoInicial(), 'banho_tosa', t(1))
    expect(p.saida.acao).toBe('start')
  })
})

describe('escolha no menu', () => {
  const comMenu = digitarTexto(estadoInicial(), 'oi', t(1)).estado

  it('toque em opção válida devolve a resposta da opção + o fecho e fecha o fluxo', () => {
    const p = tocarBotao(comMenu, 'banho_tosa', t(2))

    expect(p.saida.acao).toBe('capture_choice')
    expect(p.saida.servico).toBe('banho_tosa')
    expect(p.silencio).toBeNull()

    const doBot = p.novasFalas[1]
    expect(doBot.texto).toBe(`${BOT_OPCOES_DEMO[0].resposta}\n\n${BOT_CONFIG_DEMO.fecho}`)
    expect(doBot.menu).toBeUndefined()

    // A fala do cliente é gravada com o TÍTULO do botão, como o webhook grava.
    expect(p.novasFalas[0].texto).toBe('Banho e Tosa')

    expect(p.estado.stage).toBe('done')
    expect(p.estado.servicoEscolhido).toBe('banho_tosa')
    // Fluxo fechado: os botões do menu antigo não são mais tocáveis.
    expect(menuAtual(p.estado)).toBeNull()
  })

  it('a escolha é respondida mesmo dentro da janela de leitura', () => {
    // Contrato de `decidirBot`: quem apertou o botão merece resposta. As guardas
    // calam a REPERGUNTA, não a escolha legítima.
    const p = tocarBotao(comMenu, 'racoes', t(1) + 1000)
    expect(p.saida.acao).toBe('capture_choice')
  })

  it('toque depois do fluxo encerrado não produz resposta, e o silêncio é explicado', () => {
    const depois = tocarBotao(comMenu, 'banho_tosa', t(2)).estado
    const p = tocarBotao(depois, 'racoes', t(3))

    expect(p.saida.acao).toBe('none')
    expect(p.novasFalas.map((f) => f.quem)).toEqual(['cliente'])
    expect(p.silencio?.motivo).toBe('fluxo_encerrado')
    expect(p.silencio?.texto).toBeTruthy()
  })
})

describe('quem ignora o menu e digita', () => {
  const comMenu = digitarTexto(estadoInicial(), 'oi', t(1)).estado

  it('a primeira vez reenvia o menu e mantém awaiting_choice', () => {
    const p = digitarTexto(comMenu, 'quanto custa a vacina v10?', t(2))

    expect(p.saida.acao).toBe('remenu')
    expect(p.novasFalas[1].menu?.formato).toBe('button')
    expect(p.estado.stage).toBe('awaiting_choice')
    expect(p.silencio).toBeNull()
  })

  it('a segunda vez entrega ao humano em silêncio (giveup)', () => {
    const umRemenu = digitarTexto(comMenu, 'quanto custa?', t(2)).estado
    const p = digitarTexto(umRemenu, 'é v10 pro meu cachorro', t(3))

    expect(p.saida.acao).toBe('giveup')
    expect(p.novasFalas.map((f) => f.quem)).toEqual(['cliente'])
    expect(p.silencio?.motivo).toBe('entregue_ao_humano')
    expect(p.estado.stage).toBe('done')
  })
})

describe('guardas', () => {
  // Histórico fabricado: o caminho público fecha o fluxo em 2 menus (giveup),
  // então o teto só é alcançável montando o histórico na mão. É o mesmo
  // histórico que o webhook real leria do banco.
  const comTeto: EstadoSimulador = {
    ...estadoInicial(),
    stage: 'awaiting_choice',
    falas: Array.from({ length: BOT_TETO_RESPOSTAS_POR_HORA }, (_, i) =>
      falaBot(T0 - (i + 1) * 60_000)
    ),
  }

  it('o teto por hora cala o bot', () => {
    const p = digitarTexto(comTeto, 'oi?', T0)
    expect(p.saida.acao).toBe('none')
    expect(p.silencio?.motivo).toBe('teto')
  })

  it('falas do bot com mais de uma hora não contam para o teto', () => {
    const antigo: EstadoSimulador = {
      ...comTeto,
      falas: comTeto.falas.map((f) => ({ ...f, emMs: T0 - 2 * 3_600_000 })),
    }
    const p = digitarTexto(antigo, 'oi?', T0)
    expect(p.saida.acao).toBe('remenu')
  })

  it('a janela de leitura cala o bot', () => {
    const comMenu = digitarTexto(estadoInicial(), 'oi', T0).estado
    const p = digitarTexto(comMenu, 'segundo balão da mesma frase', T0 + 3_000)

    expect(p.saida.acao).toBe('none')
    expect(p.silencio?.motivo).toBe('janela')
    expect(p.novasFalas.map((f) => f.quem)).toEqual(['cliente'])
  })

  it('passada a janela, o mesmo texto reenvia o menu', () => {
    const comMenu = digitarTexto(estadoInicial(), 'oi', T0).estado
    const p = digitarTexto(comMenu, 'segundo balão da mesma frase', T0 + 11_000)
    expect(p.saida.acao).toBe('remenu')
  })

  it('bot desligado fica mudo e diz por quê', () => {
    const desligado = estadoInicial({ config: { ...BOT_CONFIG_DEMO, ativo: false } })
    const p = digitarTexto(desligado, 'oi', T0)
    expect(p.saida.acao).toBe('none')
    expect(p.silencio?.motivo).toBe('bot_desligado')
  })

  it('sem opção ativa o bot fica mudo e diz por quê', () => {
    const vazio = estadoInicial({ opcoes: [] })
    const p = digitarTexto(vazio, 'oi', T0)
    expect(p.saida.acao).toBe('none')
    expect(p.silencio?.motivo).toBe('sem_opcoes')
  })
})

describe('derivarContadores', () => {
  it('menus são as falas interativas do bot; respostas, todas as falas do bot', () => {
    const falas: Fala[] = [
      { id: 'a', quem: 'cliente', texto: 'oi', emMs: T0 - 300_000 },
      falaBot(T0 - 290_000, true),
      falaBot(T0 - 200_000),
      falaBot(T0 - 2 * 3_600_000, true),
    ]
    const c = derivarContadores(falas, T0)
    expect(c.respostasNaUltimaHora).toBe(2)
    expect(c.menusEnviadosNaUltimaHora).toBe(1)
    expect(c.segundosDesdeUltimaFala).toBe(200)
  })

  it('sem fala do bot, segundosDesdeUltimaFala é undefined (não zero)', () => {
    const c = derivarContadores([], T0)
    expect(c.segundosDesdeUltimaFala).toBeUndefined()
    expect(c.respostasNaUltimaHora).toBe(0)
  })
})

describe('reset', () => {
  it('volta ao começo, preservando config e opções', () => {
    const usado = tocarBotao(
      digitarTexto(estadoInicial(), 'oi', t(1)).estado,
      'banho_tosa',
      t(2)
    ).estado

    const novo = reiniciar(usado)
    expect(novo.falas).toEqual([])
    expect(novo.stage).toBeNull()
    expect(novo.servicoEscolhido).toBeNull()
    expect(novo.silencio).toBeNull()
    expect(novo.config).toBe(usado.config)
    expect(novo.opcoes).toBe(usado.opcoes)
    expect(menuAtual(novo)).toBeNull()

    // E a conversa recomeça de verdade: saudação de novo.
    expect(digitarTexto(novo, 'oi', t(3)).saida.acao).toBe('start')
  })
})

describe('imutabilidade', () => {
  it('um passo não muta o estado anterior', () => {
    const inicial = estadoInicial()
    const antes = JSON.stringify(inicial)
    digitarTexto(inicial, 'oi', t(1))
    expect(JSON.stringify(inicial)).toBe(antes)
  })

  it('os ids das falas são únicos ao longo da conversa', () => {
    let e = estadoInicial()
    e = digitarTexto(e, 'oi', t(1)).estado
    e = digitarTexto(e, 'quanto custa', t(2)).estado
    e = tocarBotao(e, 'racoes', t(3)).estado
    const ids = e.falas.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
