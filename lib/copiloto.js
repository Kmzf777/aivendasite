// Junta as quatro pecas num copiloto so: a regra de objecao que ja existia,
// a maquina de etapas, a colheita e a selecao de dicas.
//
// Funcoes puras. Quem chama guarda o estado e faz as chamadas de rede; aqui
// nao ha fetch, nao ha DOM e nao ha relogio. E por isso que da para testar a
// ligacao inteira sem microfone e sem Jev.
//
// ==================================================================
// DUAS CHAMADAS, NAO SEIS
// ==================================================================
// As perguntas querem janelas de contexto diferentes, entao vao em duas
// chamadas que disparam em PARALELO. A latencia e a maior das duas, nao a soma.
//
//   turno do CLIENTE  -> janela curta, a ultima fala dele
//                        tem_objecao, objecao, terminou_de_falar, sentimento
//   turno do VENDEDOR -> janela larga, o que ele acabou de fazer
//                        acao, etapa
//
// O que o vendedor JA FEZ nao se pergunta: fica em flag no estado do fluxo.

const { aplicarRegra, montarPerguntas } = require("./decisao.js");
const F = require("./fluxo.js");
const C = require("./colheita.js");
const D = require("./dicas.js");

// ------------------------------------------------------------------
// Sentimento
// ------------------------------------------------------------------
// Vale pouco e vale alguma coisa, e e honesto dizer qual: o ASR joga fora a
// prosodia, entao isto so pega sinal EXPLICITO ("to sem tempo"), nunca tom.
// Por isso o nudge dele e o ultimo da fila de precedencia.

const SENTIMENTOS = {
  apressado: {
    comoSoa: "The customer signals in words that he has no time right now: he is busy, in the middle of something, asks you to be quick or to call later.",
    dica: "Vá direto ao ponto"
  },
  fechado: {
    comoSoa: "The customer signals in words that he does not want this conversation: he is dismissive, says he is not interested, or answers in one word to end it.",
    dica: "Peça o WhatsApp e saia"
  },
  interessado: {
    comoSoa: "The customer asks a question about the offer, about price, about how it works, or asks you to send something. He is leaning in.",
    dica: "Pare de explicar e peça"
  },
  neutro: {
    comoSoa: "The customer is simply answering or listening, with no sign of hurry, rejection or interest."
    // sem dica de proposito: o normal da conversa nao merece ocupar a tela
  }
};

function perguntaDeSentimento() {
  const criteria = {};
  Object.keys(SENTIMENTOS).forEach(k => { criteria[k] = SENTIMENTOS[k].comoSoa; });
  return {
    type: "choice",
    instructions: "How is the customer reacting in this last utterance?",
    criteria
  };
}

// As perguntas do turno do cliente: as que ja existiam mais o sentimento.
// montarPerguntas vem de decisao.js e NAO e tocado aqui — ele e gemeo do
// app/lib e tem teste de paridade.
function perguntasDoCliente(objecoes) {
  return Object.assign({}, montarPerguntas(objecoes), { sentimento: perguntaDeSentimento() });
}

// As perguntas do turno do vendedor. Lista de etapa so daqui para a frente,
// porque etapa que ja passou nao pode ser escolhida e lista menor erra menos.
function perguntasDoVendedor(fluxo, co) {
  return {
    acao: {
      type: "choice",
      instructions: "What did the SELLER just do in this utterance?",
      criteria: F.criteriosDeAcao(fluxo)
    },
    etapa: {
      type: "choice",
      instructions: "Which stage of the call is this conversation in now?",
      criteria: F.criteriosDeEtapa(fluxo, co.etapa)
    }
  };
}

// ------------------------------------------------------------------
// Estado
// ------------------------------------------------------------------

const LIMIAR = {
  acao: 0.6,    // abaixo disso nao marca a acao como feita
  etapa: 0.7    // pular etapa e mais caro que ficar: exige mais certeza
};

function copilotoInicial(fluxo) {
  return {
    fluxoId: fluxo.id,
    etapa: F.estadoInicial(fluxo),
    colheita: C.colheitaInicial(),
    dicas: [],
    ultimaMostrada: null
  };
}

// O que a LIGACAO ja conseguiu, lido da colheita. Diferente das acoes, que sao
// o que o VENDEDOR fez. E com isto que uma etapa de plano B se descarta: nao
// adianta cobrar "peça para ela encaminhar" de quem ja anotou o celular do dono.
function conquistas(co) {
  const c = co.colheita || {};
  const nomes = c.nomes || [];
  return {
    telefone_citado: (c.telefones || []).length > 0,
    nome_do_dono: nomes.some(n => n.papel === "dono"),
    nome_de_quem_atendeu: nomes.some(n => n.papel === "atendente"),
    horario_do_dono: !!c.horario
  };
}

function lerEscolha(resposta, chave) {
  const a = (resposta && resposta.answers && resposta.answers[chave]) || null;
  if (!a) return { escolha: null, confianca: 0 };
  return { escolha: a.choice || null, confianca: typeof a.confidence === "number" ? a.confidence : 0 };
}

// ------------------------------------------------------------------
// Turno do cliente
// ------------------------------------------------------------------

function turnoDoCliente(fluxo, co, respostaJev, texto, objecoes) {
  const d = aplicarRegra(respostaJev, objecoes, co.ultimaMostrada);
  const s = lerEscolha(respostaJev, "sentimento");

  const ehStop = d.acao === "card" && d.objecao && d.objecao.tipo === "stop";

  const sent = (s.escolha && SENTIMENTOS[s.escolha] && SENTIMENTOS[s.escolha].dica)
    ? { id: "sent_" + s.escolha, texto: SENTIMENTOS[s.escolha].dica }
    : null;

  const dicas = D.montarDicas({
    stop: ehStop ? { id: d.escolha, texto: d.objecao.headline || d.objecao.nome } : null,
    objecao: (!ehStop && d.acao === "card" && d.objecao)
      ? { id: d.escolha, texto: d.objecao.headline || d.objecao.nome } : null,
    sentimento: sent,
    lacunas: [],                 // lacuna e assunto do turno do vendedor
    vezDoVendedor: false,        // o cliente esta falando: nada de cobrar lacuna agora
    anteriores: co.dicas
  });

  // A colheita entra ANTES de mexer na etapa: e na fala do cliente que o
  // telefone do dono aparece, e e isso que torna a etapa de plano B inutil.
  const comColheita = Object.assign({}, co, { colheita: C.colher(co.colheita, "cliente", texto) });
  const etapa = F.avancarSeCumpriu(fluxo, comColheita.etapa, conquistas(comColheita));

  return {
    co: Object.assign({}, comColheita, {
      etapa: etapa,
      dicas: dicas,
      ultimaMostrada: d.acao === "card" ? d.escolha : co.ultimaMostrada
    }),
    decisao: d,
    sentimento: s.escolha,
    dicas: dicas
  };
}

// ------------------------------------------------------------------
// Turno do vendedor
// ------------------------------------------------------------------
// Aqui mora o que a ideia original pedia: ele fala, o sistema marca o que foi
// feito, e cobra o que faltou. A dica e exigido-menos-feito, nao uma pergunta.

function turnoDoVendedor(fluxo, co, respostaJev, texto) {
  const a = lerEscolha(respostaJev, "acao");
  const e = lerEscolha(respostaJev, "etapa");

  const comColheita = Object.assign({}, co, { colheita: C.colher(co.colheita, "vendedor", texto) });
  const ganhos = conquistas(comColheita);
  let etapa = comColheita.etapa;

  if (a.escolha && a.escolha !== "nenhuma" && a.confianca >= LIMIAR.acao) {
    etapa = F.registrar(fluxo, etapa, a.escolha);
  }
  etapa = F.avancarSeCumpriu(fluxo, etapa, ganhos);

  // O Jev so PROPOE etapa, e sugerirEtapa ja recusa qualquer coisa para tras.
  if (e.escolha && e.confianca >= LIMIAR.etapa) {
    etapa = F.sugerirEtapa(fluxo, etapa, e.escolha);
  }

  const dicas = D.montarDicas({
    lacunas: F.lacunas(fluxo, etapa),
    vezDoVendedor: true,
    anteriores: co.dicas
  });

  return {
    co: Object.assign({}, comColheita, { etapa: etapa, dicas: dicas }),
    acao: a.escolha,
    dicas: dicas
  };
}

// ------------------------------------------------------------------
// Fim da ligacao
// ------------------------------------------------------------------
// Nada daqui vai para a ficha do lead sozinho: isto e a tela de confirmacao.

function fimDaLigacao(fluxo, co) {
  return {
    fluxo: fluxo.id,
    resumo: F.resumo(fluxo, co.etapa),
    confirmar: C.paraConfirmar(co.colheita),
    naoFez: F.lacunas(fluxo, co.etapa).map(x => ({ id: x.id, dica: x.dica }))
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SENTIMENTOS, LIMIAR,
    perguntasDoCliente, perguntasDoVendedor, perguntaDeSentimento,
    copilotoInicial, turnoDoCliente, turnoDoVendedor, fimDaLigacao
  };
}
