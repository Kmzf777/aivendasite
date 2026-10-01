// PORTADO de ../lib/dicas.js — mesma logica, so o formato de modulo muda.
// A versao CommonJS da raiz continua servindo os testes offline; se mexer
// numa, mexa na outra (teste-paridade.js compara as duas).

// Escolhe o que aparece na tela. Funcao pura, sem DOM e sem rede.
//
// ==================================================================
// A REGRA DE OURO: a dica nao e para ler em voz alta
// ==================================================================
// O vendedor le, raciocina e fala com as palavras dele. Por isso:
//   - no maximo 6 palavras
//   - comeca por verbo no imperativo
//   - NUNCA entre aspas: aspas convidam a leitura em voz alta, e iniciante le
//   - sem ponto final: ponto final pede leitura, nao acao
//
// Tres fontes competem pelo mesmo espaco (lacuna, objecao, sentimento) e vao
// colidir na mesma frase. Sem precedencia a tela vira ruido no pior momento.

const CONFIG_DICAS = {
  teto: 3,            // teto duro. Na pratica uma ou duas e o normal.
  maxPalavras: 6,
  // Quantas rodadas uma dica fica em tela mesmo se a fonte parar de pedir.
  // Dica que aparece e some e pior que dica nenhuma: o olho ja foi la.
  sustentar: 2
};

const PRIORIDADE = { stop: 0, objecao: 1, lacuna: 2, sentimento: 3 };

function palavras(t) {
  return String(t || "").trim().split(/\s+/).filter(Boolean).length;
}

// Guarda contra o erro mais provavel de quem escreve o catalogo depois.
function dicaValida(texto) {
  const t = String(texto || "").trim();
  if (!t) return "vazia";
  if (palavras(t) > CONFIG_DICAS.maxPalavras) return "mais de " + CONFIG_DICAS.maxPalavras + " palavras";
  if (/^["'“”']/.test(t)) return "comeca com aspas: o vendedor vai ler em voz alta";
  if (/[.!]$/.test(t)) return "termina em ponto: pede leitura, nao acao";
  return null;
}

// ------------------------------------------------------------------
// Montagem
// ------------------------------------------------------------------
// entrada:
//   stop        {id, texto} | null   o cliente mandou parar
//   objecao     {id, texto} | null   card do banco
//   lacunas     [{id, dica}]         o que a etapa exige e nao foi feito
//   sentimento  {id, texto} | null   nudge de comportamento
//   anteriores  [...]                o que estava em tela na rodada passada
//   vezDoVendedor  bool              se e a vez dele de falar
//
// `vezDoVendedor` existe porque mostrar "voce esqueceu de se apresentar"
// enquanto o CLIENTE ainda esta falando e ruido: nao ha nada a fazer com a
// dica naquele instante. Objecao e stop reagem ao cliente e passam sempre.

function montarDicas(entrada) {
  const e = entrada || {};
  const anteriores = e.anteriores || [];
  const candidatos = [];

  const por = (id) => anteriores.find(a => a.id === id);

  if (e.stop) {
    candidatos.push({ id: e.stop.id, tipo: "stop", texto: e.stop.texto });
  } else {
    if (e.objecao) candidatos.push({ id: e.objecao.id, tipo: "objecao", texto: e.objecao.texto });

    if (e.vezDoVendedor) {
      (e.lacunas || []).forEach(l => {
        candidatos.push({ id: l.id, tipo: "lacuna", texto: l.dica });
      });
    }
    if (e.sentimento) {
      candidatos.push({ id: e.sentimento.id, tipo: "sentimento", texto: e.sentimento.texto });
    }
  }

  // Dica que ainda esta no prazo de sustentacao e nao foi recolocada: segura.
  // Pulada quando ha stop, porque stop limpa a tela.
  if (!e.stop) {
    anteriores.forEach(a => {
      const vivo = (a.rodadas || 0) + 1 < CONFIG_DICAS.sustentar;
      if (vivo && !candidatos.some(c => c.id === a.id)) {
        candidatos.push({ id: a.id, tipo: a.tipo, texto: a.texto, herdada: true });
      }
    });
  }

  const vistos = {};
  const saida = candidatos
    .filter(c => {
      if (vistos[c.id] || dicaValida(c.texto)) return false;
      vistos[c.id] = 1;
      return true;
    })
    .sort((a, b) => {
      const d = PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo];
      if (d !== 0) return d;
      // Empate: quem ja estava em tela fica onde estava. Reordenar pisca.
      const ia = por(a.id) ? anteriores.indexOf(por(a.id)) : 99;
      const ib = por(b.id) ? anteriores.indexOf(por(b.id)) : 99;
      return ia - ib;
    })
    .slice(0, CONFIG_DICAS.teto);

  return saida.map(c => {
    const antes = por(c.id);
    return {
      id: c.id, tipo: c.tipo, texto: c.texto,
      rodadas: antes ? (antes.rodadas || 0) + 1 : 0,
      nova: !antes
    };
  });
}

// Roda sobre o catalogo inteiro antes de subir, nao durante a ligacao.
function validarCatalogoDeDicas(fluxo) {
  const erros = [];
  (fluxo.acoes || []).forEach(a => {
    const m = dicaValida(a.dica);
    if (m) erros.push("acao " + a.id + ": dica " + m + " -> " + JSON.stringify(a.dica));
  });
  return erros;
}

export { CONFIG_DICAS, PRIORIDADE, montarDicas, dicaValida, validarCatalogoDeDicas, palavras };
