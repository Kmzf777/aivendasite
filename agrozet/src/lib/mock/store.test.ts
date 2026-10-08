// Testes do store em memoria do modo mockup.
//
// Sem acentos nos nomes dos testes, como no resto da suite deste projeto.

import { describe, it, expect, beforeEach } from 'vitest'
import { CONVERSAS_DEMO, BOT_CONFIG_DEMO, BOT_OPCOES_DEMO } from '@/lib/mock/dados'
import {
  lerConversas,
  lerMensagens,
  lerClientes,
  lerCliente,
  lerPets,
  lerTodosPets,
  lerOpcoesBot,
  lerConfigBot,
  enviarTexto,
  salvarCliente,
  reiniciar,
  subscribe,
  versao,
} from './store'

const PHONE_PENDENTE = '5534999910001'
const TOTAL_MENSAGENS_SEMEADAS = CONVERSAS_DEMO.reduce((n, c) => n + c.mensagens.length, 0)

beforeEach(() => {
  reiniciar()
})

describe('leitura inicial', () => {
  it('lista uma conversa por telefone semeado', () => {
    const lista = lerConversas()
    expect(lista).toHaveLength(CONVERSAS_DEMO.length)
    expect(new Set(lista.map((c) => c.phone))).toEqual(new Set(CONVERSAS_DEMO.map((c) => c.phone)))
  })

  it('ordena pendentes primeiro, como montarLista', () => {
    const lista = lerConversas()
    const primeiroRespondido = lista.findIndex((c) => !c.pendente)
    const ultimoPendente = lista.map((c) => c.pendente).lastIndexOf(true)
    if (primeiroRespondido !== -1) expect(ultimoPendente).toBeLessThan(primeiroRespondido)
  })

  it('traz nome e ultimo_servico do cadastro derivado', () => {
    const item = lerConversas().find((c) => c.phone === PHONE_PENDENTE)
    expect(item?.nome).toBe('Juliana Prado')
    expect(item?.ultimoServico).toBe('banho_tosa')
  })

  it('mantem o cliente anonimo com nome null', () => {
    const anonimo = CONVERSAS_DEMO.find((c) => c.nome === null)!
    expect(lerCliente(anonimo.phone)?.nome).toBeNull()
  })

  it('devolve as mensagens da conversa em ordem cronologica', () => {
    const msgs = lerMensagens(PHONE_PENDENTE)
    expect(msgs).toHaveLength(CONVERSAS_DEMO[0].mensagens.length)
    const datas = msgs.map((m) => m.created_at)
    expect(datas.slice().sort()).toEqual(datas)
  })

  it('lerMensagens(null) devolve vazio', () => {
    expect(lerMensagens(null)).toEqual([])
  })

  it('lerMensagens de telefone desconhecido devolve vazio', () => {
    expect(lerMensagens('5534000000000')).toEqual([])
  })

  it('deriva um cliente por conversa, com datas de contato', () => {
    const clientes = lerClientes()
    expect(clientes).toHaveLength(CONVERSAS_DEMO.length)
    for (const c of clientes) {
      expect(c.primeiro_contato_at <= c.ultima_interacao_at).toBe(true)
      expect(c.observacoes).toBeNull()
    }
  })

  it('lerCliente(null) devolve null', () => {
    expect(lerCliente(null)).toBeNull()
  })

  it('deriva pets com id estavel', () => {
    const pets = lerPets(PHONE_PENDENTE)
    expect(pets.map((p) => p.nome)).toEqual(['Thor'])
    expect(pets[0].id).toBe(lerPets(PHONE_PENDENTE)[0].id)
    expect(pets[0].cliente_phone).toBe(PHONE_PENDENTE)
  })

  it('lerPets(null) devolve vazio', () => {
    expect(lerPets(null)).toEqual([])
  })

  it('lerTodosPets soma os pets de todas as conversas', () => {
    const total = CONVERSAS_DEMO.reduce((n, c) => n + c.pets.length, 0)
    expect(lerTodosPets()).toHaveLength(total)
    expect(new Set(lerTodosPets().map((p) => p.id)).size).toBe(total)
  })

  it('devolve as opcoes e a config do bot semeadas', () => {
    expect(lerOpcoesBot().map((o) => o.botao_id)).toEqual(BOT_OPCOES_DEMO.map((o) => o.botao_id))
    expect(lerOpcoesBot().map((o) => o.ordem)).toEqual(BOT_OPCOES_DEMO.map((o) => o.ordem))
    expect(lerConfigBot()).toEqual(BOT_CONFIG_DEMO)
  })
})

describe('versao', () => {
  // O ERRO QUE ESTE TESTE EXISTE PARA PEGAR: se `versao()` devolvesse um valor
  // novo a cada chamada (Date.now(), um objeto, um array), o
  // useSyncExternalStore que a usa como getSnapshot entraria em loop infinito
  // de render.
  it('e estavel entre chamadas sem escrita', () => {
    const v = versao()
    expect(versao()).toBe(v)
    lerConversas()
    lerMensagens(PHONE_PENDENTE)
    lerClientes()
    lerPets(PHONE_PENDENTE)
    lerOpcoesBot()
    lerConfigBot()
    expect(versao()).toBe(v)
  })

  it('e um numero finito (serve de getSnapshot e getServerSnapshot)', () => {
    expect(Number.isFinite(versao())).toBe(true)
  })

  it('muda a cada escrita', () => {
    const v0 = versao()
    enviarTexto(PHONE_PENDENTE, 'oi')
    const v1 = versao()
    expect(v1).not.toBe(v0)
    salvarCliente(PHONE_PENDENTE, { nome: 'Juliana P.' })
    expect(versao()).not.toBe(v1)
  })
})

describe('enviarTexto', () => {
  it('acrescenta uma mensagem outbound de texto e devolve ela', () => {
    const antes = lerMensagens(PHONE_PENDENTE).length
    const m = enviarTexto(PHONE_PENDENTE, 'posso sim, sabado 9h')
    expect(m.direction).toBe('outbound')
    expect(m.message_type).toBe('text')
    expect(m.delivery_status).toBe('sent')
    expect(m.content).toBe('posso sim, sabado 9h')
    expect(m.phone).toBe(PHONE_PENDENTE)
    expect(Number.isNaN(Date.parse(m.created_at))).toBe(false)
    const depois = lerMensagens(PHONE_PENDENTE)
    expect(depois).toHaveLength(antes + 1)
    expect(depois[depois.length - 1].message_id).toBe(m.message_id)
  })

  it('gera message_id unico', () => {
    const a = enviarTexto(PHONE_PENDENTE, 'um')
    const b = enviarTexto(PHONE_PENDENTE, 'dois')
    expect(a.message_id).not.toBe(b.message_id)
    expect(a.id).not.toBe(b.id)
  })

  it('tira a conversa da fila de pendentes', () => {
    expect(lerConversas().find((c) => c.phone === PHONE_PENDENTE)?.pendente).toBe(true)
    enviarTexto(PHONE_PENDENTE, 'respondendo')
    const item = lerConversas().find((c) => c.phone === PHONE_PENDENTE)
    expect(item?.pendente).toBe(false)
    expect(item?.ultimaMensagem).toBe('respondendo')
    expect(lerConversas()[0].phone).not.toBe(PHONE_PENDENTE)
  })

  it('atualiza ultima_interacao_at do cliente', () => {
    const antes = lerCliente(PHONE_PENDENTE)!.ultima_interacao_at
    const m = enviarTexto(PHONE_PENDENTE, 'oi')
    expect(lerCliente(PHONE_PENDENTE)!.ultima_interacao_at).toBe(m.created_at)
    expect(lerCliente(PHONE_PENDENTE)!.ultima_interacao_at >= antes).toBe(true)
  })

  it('abre conversa nova para telefone desconhecido', () => {
    enviarTexto('5534999919999', 'oi')
    expect(lerConversas()).toHaveLength(CONVERSAS_DEMO.length + 1)
    expect(lerCliente('5534999919999')).not.toBeNull()
  })
})

describe('salvarCliente', () => {
  it('persiste nome e observacoes', () => {
    salvarCliente(PHONE_PENDENTE, { nome: 'Ju Prado', observacoes: 'Thor tem medo de secador' })
    const c = lerCliente(PHONE_PENDENTE)!
    expect(c.nome).toBe('Ju Prado')
    expect(c.observacoes).toBe('Thor tem medo de secador')
  })

  it('reflete o nome novo na lista de conversas', () => {
    salvarCliente(PHONE_PENDENTE, { nome: 'Ju Prado' })
    expect(lerConversas().find((c) => c.phone === PHONE_PENDENTE)?.nome).toBe('Ju Prado')
  })

  it('nao mexe no campo omitido', () => {
    salvarCliente(PHONE_PENDENTE, { observacoes: 'alergica a racao de peixe' })
    expect(lerCliente(PHONE_PENDENTE)!.nome).toBe('Juliana Prado')
  })

  it('aceita limpar o nome com null', () => {
    salvarCliente(PHONE_PENDENTE, { nome: null })
    expect(lerCliente(PHONE_PENDENTE)!.nome).toBeNull()
  })

  it('notifica os inscritos', () => {
    let n = 0
    const parar = subscribe(() => {
      n += 1
    })
    salvarCliente(PHONE_PENDENTE, { nome: 'Ju' })
    expect(n).toBe(1)
    parar()
  })
})

describe('subscribe', () => {
  it('chama o ouvinte em cada escrita', () => {
    let n = 0
    const parar = subscribe(() => {
      n += 1
    })
    enviarTexto(PHONE_PENDENTE, 'a')
    enviarTexto(PHONE_PENDENTE, 'b')
    salvarCliente(PHONE_PENDENTE, { nome: 'x' })
    expect(n).toBe(3)
    parar()
  })

  it('o unsubscribe devolvido realmente para de notificar', () => {
    let n = 0
    const parar = subscribe(() => {
      n += 1
    })
    enviarTexto(PHONE_PENDENTE, 'a')
    parar()
    enviarTexto(PHONE_PENDENTE, 'b')
    expect(n).toBe(1)
  })

  it('nao notifica leituras', () => {
    let n = 0
    const parar = subscribe(() => {
      n += 1
    })
    lerConversas()
    lerMensagens(PHONE_PENDENTE)
    lerClientes()
    expect(n).toBe(0)
    parar()
  })

  it('suporta mais de um inscrito', () => {
    let a = 0
    let b = 0
    const pararA = subscribe(() => {
      a += 1
    })
    const pararB = subscribe(() => {
      b += 1
    })
    enviarTexto(PHONE_PENDENTE, 'oi')
    expect([a, b]).toEqual([1, 1])
    pararA()
    pararB()
  })
})

describe('reiniciar', () => {
  it('restaura depois de varias escritas', () => {
    enviarTexto(PHONE_PENDENTE, 'a')
    enviarTexto(PHONE_PENDENTE, 'b')
    enviarTexto('5534999919999', 'conversa nova')
    salvarCliente(PHONE_PENDENTE, { nome: 'outro', observacoes: 'nota' })

    reiniciar()

    expect(lerConversas()).toHaveLength(CONVERSAS_DEMO.length)
    expect(lerMensagens(PHONE_PENDENTE)).toHaveLength(CONVERSAS_DEMO[0].mensagens.length)
    expect(lerCliente(PHONE_PENDENTE)!.nome).toBe('Juliana Prado')
    expect(lerCliente(PHONE_PENDENTE)!.observacoes).toBeNull()
    expect(lerCliente('5534999919999')).toBeNull()
    expect(lerConversas().find((c) => c.phone === PHONE_PENDENTE)?.pendente).toBe(true)
  })

  it('notifica os inscritos', () => {
    let n = 0
    const parar = subscribe(() => {
      n += 1
    })
    reiniciar()
    expect(n).toBe(1)
    parar()
  })
})

describe('isolamento do seed', () => {
  // Se o store guardasse REFERENCIAS aos arrays de dados.ts, um `reiniciar()`
  // nao restauraria nada: ele reaplicaria o estado ja corrompido.
  it('nao muta CONVERSAS_DEMO', () => {
    const antes = CONVERSAS_DEMO.map((c) => ({
      phone: c.phone,
      nome: c.nome,
      n: c.mensagens.length,
      pets: c.pets.length,
    }))

    enviarTexto(PHONE_PENDENTE, 'escrita que nao pode vazar')
    salvarCliente(PHONE_PENDENTE, { nome: 'nome novo' })

    expect(
      CONVERSAS_DEMO.map((c) => ({
        phone: c.phone,
        nome: c.nome,
        n: c.mensagens.length,
        pets: c.pets.length,
      }))
    ).toEqual(antes)
    expect(CONVERSAS_DEMO.reduce((n, c) => n + c.mensagens.length, 0)).toBe(TOTAL_MENSAGENS_SEMEADAS)
  })

  it('nao muta as opcoes nem a config do bot de dados.ts', () => {
    const opcoes = lerOpcoesBot()
    opcoes[0].titulo = 'mexido'
    opcoes.pop()
    expect(BOT_OPCOES_DEMO[0].titulo).toBe('Banho e Tosa')
    expect(BOT_OPCOES_DEMO).toHaveLength(3)

    const config = lerConfigBot()
    config.ativo = false
    expect(BOT_CONFIG_DEMO.ativo).toBe(true)
  })

  it('mutar o array devolvido por uma leitura nao afeta o store', () => {
    const msgs = lerMensagens(PHONE_PENDENTE)
    const n = msgs.length
    msgs.pop()
    expect(lerMensagens(PHONE_PENDENTE)).toHaveLength(n)

    const clientes = lerClientes()
    clientes.length = 0
    expect(lerClientes()).toHaveLength(CONVERSAS_DEMO.length)
  })
})
