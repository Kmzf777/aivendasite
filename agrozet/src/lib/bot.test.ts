import { describe, it, expect } from 'vitest'
import {
  montarMenu,
  decidirBot,
  BOT_TETO_RESPOSTAS_POR_HORA,
  BOT_JANELA_LEITURA_SEGUNDOS,
} from './bot'
import type { BotConfig, BotOpcao, BotEntrada } from './bot'

const config: BotConfig = {
  ativo: true,
  saudacao: 'Olá! Em que podemos ajudar?',
  rodape: 'Pet Shop Agrozet',
  fecho: 'Já chamamos um atendente.',
}

const opcao = (n: number, ativo = true): BotOpcao => ({
  botao_id: `op${n}`, titulo: `Opcao ${n}`, resposta: `Resposta ${n}`, ordem: n, ativo,
})

describe('montarMenu', () => {
  it('usa reply buttons com 3 opcoes', () => {
    const { menu, erro } = montarMenu(config, [opcao(1), opcao(2), opcao(3)])
    expect(erro).toBeUndefined()
    expect(menu).toEqual({
      formato: 'button',
      corpo: config.saudacao,
      rodape: 'Pet Shop Agrozet',
      botoes: [
        { id: 'op1', titulo: 'Opcao 1' },
        { id: 'op2', titulo: 'Opcao 2' },
        { id: 'op3', titulo: 'Opcao 3' },
      ],
    })
  })

  it('usa reply buttons com 1 opcao', () => {
    expect(montarMenu(config, [opcao(1)]).menu?.formato).toBe('button')
  })

  // A Meta RECUSA 4 reply buttons. Sem este degrau o cliente ficaria sem
  // resposta nenhuma quando um admin cadastrasse a 4a opcao pela tela.
  it('vira lista com 4 opcoes', () => {
    const { menu } = montarMenu(config, [opcao(1), opcao(2), opcao(3), opcao(4)])
    expect(menu?.formato).toBe('list')
    if (menu?.formato !== 'list') throw new Error('esperava list')
    expect(menu.itens).toHaveLength(4)
    expect(menu.rotulo).toBe('Ver serviços')
  })

  it('ignora opcoes inativas na contagem de formato', () => {
    const opcoes = [opcao(1), opcao(2), opcao(3), opcao(4, false)]
    const { menu } = montarMenu(config, opcoes)
    expect(menu?.formato).toBe('button')
    if (menu?.formato !== 'button') throw new Error('esperava button')
    expect(menu.botoes.map((b) => b.id)).toEqual(['op1', 'op2', 'op3'])
  })

  it('ordena por ordem, nao pela posicao no array', () => {
    const { menu } = montarMenu(config, [opcao(3), opcao(1), opcao(2)])
    if (menu?.formato !== 'button') throw new Error('esperava button')
    expect(menu.botoes.map((b) => b.id)).toEqual(['op1', 'op2', 'op3'])
  })

  it('trunca em 10 itens e reporta erro', () => {
    const opcoes = Array.from({ length: 12 }, (_, i) => opcao(i + 1))
    const { menu, erro } = montarMenu(config, opcoes)
    if (menu?.formato !== 'list') throw new Error('esperava list')
    expect(menu.itens).toHaveLength(10)
    expect(menu.itens.map((i) => i.id)).toEqual(
      ['op1','op2','op3','op4','op5','op6','op7','op8','op9','op10']
    )
    expect(erro).toContain('10')
  })

  it('sem opcao ativa devolve menu nulo e erro', () => {
    const { menu, erro } = montarMenu(config, [opcao(1, false)])
    expect(menu).toBeNull()
    expect(erro).toBeTruthy()
  })

  it('preserva rodape nulo', () => {
    const { menu } = montarMenu({ ...config, rodape: null }, [opcao(1)])
    expect(menu?.rodape).toBeNull()
  })
})

const base: BotEntrada = {
  clienteExiste: true,
  stage: 'awaiting_choice',
  config: { ativo: true, saudacao: 'Olá!', rodape: null, fecho: 'Já chamamos alguém.' },
  opcoes: [
    { botao_id: 'banho_tosa', titulo: 'Banho e Tosa', resposta: 'Fazemos banho e tosa.', ordem: 1, ativo: true },
    { botao_id: 'racoes', titulo: 'Rações', resposta: 'Temos rações.', ordem: 2, ativo: true },
  ],
  botaoId: null,
  menusEnviadosNaUltimaHora: 1,
  respostasNaUltimaHora: 1,
  segundosDesdeUltimaFala: 120,
}

describe('decidirBot', () => {
  it('contato novo recebe saudacao com menu', () => {
    const s = decidirBot({ ...base, clienteExiste: false, stage: null, menusEnviadosNaUltimaHora: 0, respostasNaUltimaHora: 0, segundosDesdeUltimaFala: undefined })
    expect(s.acao).toBe('start')
    expect(s.menu?.formato).toBe('button')
    expect(s.proximoStage).toBe('awaiting_choice')
    expect(s.stageEsperado).toBeNull()
    expect(s.texto).toBeUndefined()
  })

  it('escolha valida grava o servico e responde com a resposta da opcao', () => {
    const s = decidirBot({ ...base, botaoId: 'racoes' })
    expect(s.acao).toBe('capture_choice')
    expect(s.servico).toBe('racoes')
    expect(s.texto).toBe('Temos rações.\n\nJá chamamos alguém.')
    expect(s.proximoStage).toBe('done')
    expect(s.stageEsperado).toBe('awaiting_choice')
    expect(s.menu).toBeUndefined()
  })

  it('botao desconhecido reenvia o menu', () => {
    const s = decidirBot({ ...base, botaoId: 'nao_existe' })
    expect(s.acao).toBe('remenu')
    expect(s.menu).toBeTruthy()
    expect(s.proximoStage).toBeUndefined()
  })

  it('opcao inativa nao pode ser escolhida', () => {
    const opcoes = base.opcoes.map((o) => o.botao_id === 'racoes' ? { ...o, ativo: false } : o)
    expect(decidirBot({ ...base, opcoes, botaoId: 'racoes' }).acao).toBe('remenu')
  })

  it('texto livre na primeira vez reenvia o menu', () => {
    const s = decidirBot({ ...base, menusEnviadosNaUltimaHora: 1 })
    expect(s.acao).toBe('remenu')
  })

  it('texto livre na segunda vez desiste e passa pro humano', () => {
    const s = decidirBot({ ...base, menusEnviadosNaUltimaHora: 2 })
    expect(s.acao).toBe('giveup')
    expect(s.proximoStage).toBe('done')
    expect(s.texto).toBeUndefined()
    expect(s.menu).toBeUndefined()
  })

  it('contato existente fora do fluxo nao recebe nada', () => {
    expect(decidirBot({ ...base, stage: 'done' }).acao).toBe('none')
    expect(decidirBot({ ...base, stage: null }).acao).toBe('none')
  })

  it('bot desligado nao responde nem para contato novo', () => {
    const s = decidirBot({ ...base, clienteExiste: false, stage: null, config: { ...base.config, ativo: false } })
    expect(s.acao).toBe('none')
  })

  it('sem opcao ativa nao responde e reporta erro', () => {
    const opcoes = base.opcoes.map((o) => ({ ...o, ativo: false }))
    const s = decidirBot({ ...base, clienteExiste: false, stage: null, opcoes })
    expect(s.acao).toBe('none')
    expect(s.erro).toBeTruthy()
  })

  // Teto por hora: no sistema de referencia um bot alheio respondeu cada mensagem
  // automatica com o proprio menu; os dois trocaram 182 mensagens em 7 minutos.
  it('acima do teto de respostas por hora o bot fica mudo', () => {
    const s = decidirBot({ ...base, respostasNaUltimaHora: BOT_TETO_RESPOSTAS_POR_HORA })
    expect(s.acao).toBe('none')
  })

  it('no teto menos um o bot ainda responde', () => {
    const s = decidirBot({ ...base, respostasNaUltimaHora: BOT_TETO_RESPOSTAS_POR_HORA - 1 })
    expect(s.acao).toBe('remenu')
  })

  // O teto nao pode calar uma escolha legitima: o cliente apertou o botao, ele
  // merece resposta. So silencia o caminho de repergunta.
  it('o teto nao bloqueia uma escolha valida', () => {
    const s = decidirBot({ ...base, respostasNaUltimaHora: 99, botaoId: 'racoes' })
    expect(s.acao).toBe('capture_choice')
  })

  // Janela de leitura: resposta que chega em menos de 10s foi escrita antes de o
  // cliente ler o menu. O menu ja esta na tela.
  it('resposta invalida dentro da janela de leitura nao gera remenu', () => {
    const s = decidirBot({ ...base, segundosDesdeUltimaFala: BOT_JANELA_LEITURA_SEGUNDOS - 1 })
    expect(s.acao).toBe('none')
  })

  it('resposta invalida depois da janela gera remenu', () => {
    const s = decidirBot({ ...base, segundosDesdeUltimaFala: BOT_JANELA_LEITURA_SEGUNDOS })
    expect(s.acao).toBe('remenu')
  })

  it('a janela nao bloqueia escolha valida de botao', () => {
    const s = decidirBot({ ...base, segundosDesdeUltimaFala: 1, botaoId: 'racoes' })
    expect(s.acao).toBe('capture_choice')
  })

  it('contato novo sem fala anterior do bot nao cai na janela', () => {
    const s = decidirBot({ ...base, clienteExiste: false, stage: null, segundosDesdeUltimaFala: undefined })
    expect(s.acao).toBe('start')
  })
})
