# Copiloto de Call de Vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local page that listens to both sides of a Google Meet sales call, sends each client utterance to TypeSafe's Jev decision model, and shows a big "Quebrar objeção: <name>" card with the seller's own pre-written argument.

**Architecture:** Three files, no build step and no dependencies. `server.js` (Node core modules only) serves the page and proxies `POST /jev` to `https://api.typesafe.ai/v1/systemone`, injecting the API key from `.env` so the key never reaches the browser. `index.html` holds the whole UI plus a pure decision layer. `teste.js` exercises the same decision layer from the command line against 20 canned utterances.

The decision logic is deliberately split into pure functions (`montarPerguntas`, `aplicarRegra`, `calcularCusto`) that take plain objects and return plain objects. They know nothing about the DOM or about `fetch`. That is what makes `teste.js` able to test the real rule instead of a copy of it, and it is the whole reason tuning Jev later is a one-line change.

**Tech Stack:** Node.js (core modules `http`, `fs`, `path`, `https` only), vanilla browser JS, Web Speech API (`SpeechRecognition` + `start(audioTrack)`, Chrome 139+), Screen Capture API (`getDisplayMedia`), `localStorage`, TypeSafe Jev `jev-1.13.0`.

**Spec:** `aivenda/docs/superpowers/specs/2026-09-30-copiloto-call-vendas-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `aivenda/.gitignore` | Keep `.env` out of git. |
| `aivenda/.env.example` | Show the one required variable. |
| `aivenda/lib/decisao.js` | **Pure decision layer.** Builds the Jev request body, applies the display rule, computes cost. No DOM, no network. Dual-loadable: works as a `<script>` in the browser and via `require()` in Node. |
| `aivenda/lib/objecoes-exemplo.js` | The 7 seed objections. Dual-loadable, same pattern. Separated because it is data the seller replaces, not logic. |
| `aivenda/server.js` | Static file server + `POST /jev` proxy + `.env` parser. |
| `aivenda/index.html` | UI only: tabs, phase bar, two transcript columns, the card, the catalog editor, footer. Calls into `decisao.js`. |
| `aivenda/audio.js` | The listening layer: `audioTrack` support detection, the two `SpeechRecognition` instances, auto-restart, the 700ms partial debounce. Separated from `index.html` because it is the trickiest code in the project and needs to be readable on its own. |
| `aivenda/teste.js` | CLI harness: 20 utterances through the real `decisao.js` + real API. |
| `aivenda/README.md` | Three steps to run. |

Why `decisao.js` is dual-loadable rather than two copies: `teste.js` must exercise the same threshold rule the page uses. If the rule were inlined in `index.html`, `teste.js` would test a duplicate and the two would drift the first time a threshold is tuned — which is exactly the thing we were told is coming.

The dual-load idiom used in both `lib/` files:

```js
if (typeof module !== "undefined" && module.exports) { module.exports = { /* ... */ }; }
```

In the browser the file just defines globals; `typeof module` is `undefined` and the line is skipped.

---

## Task 1: Scaffold, .gitignore, and the seed objections

**Files:**
- Create: `aivenda/.gitignore`
- Create: `aivenda/.env.example`
- Create: `aivenda/lib/objecoes-exemplo.js`
- Create: `aivenda/teste-objecoes.js` (temporary check, deleted in Task 2)

- [ ] **Step 1: Create `aivenda/.gitignore`**

```
.env
node_modules/
```

- [ ] **Step 2: Create `aivenda/.env.example`**

```
# Chave da API da TypeSafe (https://typesafe.ai) — usada só no servidor, nunca no browser.
TYPESAFE_API_KEY=
```

- [ ] **Step 3: Create `aivenda/lib/objecoes-exemplo.js`**

`id` is the key sent to Jev as a `criteria` key, so it must be a stable slug. `comoSoa` becomes the `criteria` *value* — it is the description Jev matches against, so it should describe how the objection sounds, not name it. `argumento` is what the seller reads off the card.

```js
// As 7 objeções de exemplo para quem vende agente de IA para pequena empresa.
// O vendedor edita tudo isso na aba "Minhas objeções" — isto é só o ponto de partida.
//
// id        -> chave enviada ao Jev (slug estável, não mude depois de usar)
// nome      -> título do card
// comoSoa   -> descrição que o Jev usa para casar a fala do cliente
// argumento -> o que você fala. É seu. O Jev nunca escreve isto.

const OBJECOES_EXEMPLO = [
  {
    id: "ta_caro",
    nome: "Tá caro",
    comoSoa: "O cliente reclama do preço, diz que está caro, fora do orçamento, que não cabe agora ou pede desconto.",
    argumento: "Entendo. Deixa eu te fazer uma conta rápida: quantos atendimentos por dia você perde hoje porque ninguém respondeu no WhatsApp? Se for só 2, e seu ticket médio é R$ 150, são R$ 9 mil por mês passando pela porta. O agente custa menos que uma tarde disso. Não é gasto, é a conta que você já está pagando sem ver."
  },
  {
    id: "funciona_pra_mim",
    nome: "Será que funciona pra mim",
    comoSoa: "O cliente duvida que sirva para o negócio dele especificamente, diz que o ramo dele é diferente, que o cliente dele é especial ou pergunta se funciona no caso dele.",
    argumento: "É justo duvidar. Por isso não vou te pedir para acreditar: vamos ligar no seu WhatsApp, com as suas perguntas reais, e você conversa com ele como se fosse seu cliente. Se ele errar, você vê errar. Em 15 minutos você para de adivinhar e passa a saber."
  },
  {
    id: "nao_e_o_momento",
    nome: "Não é o momento",
    comoSoa: "O cliente diz que agora não é uma boa hora, que está em outra prioridade, que quer deixar para o mês que vem, depois das festas ou mais para frente.",
    argumento: "Faz sentido, você tem umas dez coisas na frente. Só que a implantação é de um dia e quem trabalha depois é ele, não você. Se esperar três meses, são três meses de atendimento perdido para economizar um dia de trabalho. O momento ruim é o que te faz adiar; esse aqui é o que te devolve tempo."
  },
  {
    id: "falar_com_socio",
    nome: "Preciso falar com meu sócio",
    comoSoa: "O cliente diz que precisa consultar o sócio, a esposa, o marido, o pai, a diretoria ou alguém antes de decidir.",
    argumento: "Claro, decisão de dois é decisão de dois. Me ajuda a te ajudar: o que o seu sócio vai perguntar primeiro, o preço ou se funciona? Porque eu te mando pronto o argumento dessa pergunta específica. E se fizer sentido, colocamos os três numa call de 15 minutos — assim você não precisa vender minha solução no meu lugar."
  },
  {
    id: "ja_tentei",
    nome: "Já tentei e não deu certo",
    comoSoa: "O cliente conta que já usou algo parecido, um chatbot, uma automação ou outra ferramenta, e não funcionou, deu problema ou foi abandonado.",
    argumento: "Então você já sabe o que é ruim, isso me ajuda. Me conta: ele respondia por menu, tipo digite 1, digite 2? É aí que morre — o cliente não é uma URA. Este entende a frase, e quando não sabe, ele te chama em vez de inventar. O que te queimou antes foi um robô de menu, não um agente."
  },
  {
    id: "vou_pensar",
    nome: "Vou pensar",
    comoSoa: "O cliente diz que vai pensar, avaliar com calma, analisar e depois retornar, ou pede para você mandar uma proposta e ele responde.",
    argumento: "Pode pensar, é dinheiro seu. Só não quero te deixar pensando na dúvida errada. Se fosse de graça, você colocaria amanhã? Se sim, o que te trava é o preço e a gente resolve. Se não, é porque não acredita que funciona — e isso eu resolvo te mostrando, não te esperando."
  },
  {
    id: "nao_confio",
    nome: "Não confio",
    comoSoa: "O cliente desconfia da empresa, do vendedor ou da tecnologia, diz que tem medo de golpe, que nunca ouviu falar, que não conhece ou que não quer IA falando com o cliente dele.",
    argumento: "Desconfiar de quem liga oferecendo IA é o certo a fazer, eu faria igual. Então não pede confiança: começa pequeno. Ele atende só fora do horário na primeira semana, e você lê tudo que ele falou. Nada de contrato longo. A confiança vem do que você vai ver, não do que eu vou falar."
  }
];

if (typeof module !== "undefined" && module.exports) { module.exports = { OBJECOES_EXEMPLO }; }
```

- [ ] **Step 4: Write the failing test**

Create `aivenda/teste-objecoes.js`:

```js
const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");

const esperados = ["ta_caro", "funciona_pra_mim", "nao_e_o_momento", "falar_com_socio", "ja_tentei", "vou_pensar", "nao_confio"];
let falhas = 0;

function checa(nome, condicao) {
  console.log((condicao ? "  ok   " : "  FALHA") + " " + nome);
  if (!condicao) falhas++;
}

checa("tem 7 objeções", OBJECOES_EXEMPLO.length === 7);
checa("ids corretos e na ordem", JSON.stringify(OBJECOES_EXEMPLO.map(o => o.id)) === JSON.stringify(esperados));
checa("ids são únicos", new Set(OBJECOES_EXEMPLO.map(o => o.id)).size === 7);
checa("nenhum id é 'nenhuma' (reservado)", !OBJECOES_EXEMPLO.some(o => o.id === "nenhuma"));
checa("todas têm nome, comoSoa e argumento não vazios",
  OBJECOES_EXEMPLO.every(o => o.nome && o.comoSoa && o.argumento));
checa("argumentos têm substância (>120 chars)", OBJECOES_EXEMPLO.every(o => o.argumento.length > 120));

console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 5: Run it and verify it passes**

Run: `cd aivenda && node teste-objecoes.js`
Expected: six `ok` lines then `TUDO OK`, exit 0.

If it fails on `ids corretos e na ordem`, the `id` strings in Step 3 do not match `esperados` — fix Step 3, not the test.

- [ ] **Step 6: Commit**

```bash
git add aivenda/.gitignore aivenda/.env.example aivenda/lib/objecoes-exemplo.js aivenda/teste-objecoes.js
git commit -m "feat(aivenda): scaffold + 7 objeções de exemplo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The pure decision layer

This is the heart of the project. Three pure functions, fully tested offline, no network.

**Files:**
- Create: `aivenda/lib/decisao.js`
- Create: `aivenda/teste-decisao.js`
- Delete: `aivenda/teste-objecoes.js` (its checks move into `teste-decisao.js`)

- [ ] **Step 1: Write the failing test**

Create `aivenda/teste-decisao.js`. Note the shapes: a `noul` answer has **only** `noul`; a `choice` answer has `choice` + `confidence` + `probabilities`. Tests must use those exact shapes or they prove nothing.

```js
const { CONFIG, montarPerguntas, montarState, aplicarRegra, calcularCusto } = require("./lib/decisao.js");
const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");

let falhas = 0;
function checa(nome, condicao, extra) {
  console.log((condicao ? "  ok   " : "  FALHA") + " " + nome + (condicao || extra === undefined ? "" : "  -> " + JSON.stringify(extra)));
  if (!condicao) falhas++;
}

// ---------- montarPerguntas ----------
console.log("\nmontarPerguntas");
const perguntas = montarPerguntas(OBJECOES_EXEMPLO);

checa("tem as 4 perguntas", JSON.stringify(Object.keys(perguntas).sort()) ===
  JSON.stringify(["fase", "objecao", "tem_objecao", "terminou_de_falar"]));
checa("tem_objecao é noul", perguntas.tem_objecao.type === "noul");
checa("terminou_de_falar é noul", perguntas.terminou_de_falar.type === "noul");
checa("objecao é choice", perguntas.objecao.type === "choice");
checa("fase é choice", perguntas.fase.type === "choice");
checa("instructions em inglês", /customer/i.test(perguntas.tem_objecao.instructions));
checa("criteria da objecao tem as 7 + nenhuma", Object.keys(perguntas.objecao.criteria).length === 8);
checa("criteria da objecao inclui nenhuma", "nenhuma" in perguntas.objecao.criteria);
checa("criteria usa o comoSoa do catálogo",
  perguntas.objecao.criteria.ta_caro === OBJECOES_EXEMPLO[0].comoSoa);
checa("fase tem as 5 etapas", JSON.stringify(Object.keys(perguntas.fase.criteria).sort()) ===
  JSON.stringify(["abertura", "apresentacao", "diagnostico_dor", "fechamento", "objecao"]));
checa("catálogo vazio ainda gera choice válido (só nenhuma)",
  Object.keys(montarPerguntas([]).objecao.criteria).length === 1);

// ---------- montarState ----------
console.log("\nmontarState");
const falas = [];
for (let i = 1; i <= 12; i++) falas.push({ quem: i % 2 ? "vendedor" : "cliente", fala: "fala " + i });
const state = montarState(falas, "e nao funcionou");

checa("corta para historicoFalas", state.conversa.length === CONFIG.historicoFalas);
checa("mantém as ÚLTIMAS falas", state.conversa[state.conversa.length - 1].fala === "fala 12");
checa("guarda a última fala do cliente", state.ultima_fala_do_cliente === "e nao funcionou");

// ---------- aplicarRegra ----------
console.log("\naplicarRegra");
const noul = v => ({ type: "noul", noul: v });
const choice = (c, conf) => ({ type: "choice", choice: c, confidence: conf, probabilities: { [c]: conf } });

function resposta(objNoul, objChoice, objConf, terminou, faseConf) {
  return { answers: {
    tem_objecao: noul(objNoul),
    objecao: choice(objChoice, objConf),
    terminou_de_falar: noul(terminou),
    fase: choice("objecao", faseConf === undefined ? 0.9 : faseConf)
  } };
}

const r1 = aplicarRegra(resposta(0.96, "ja_tentei", 1.0, 0.86), OBJECOES_EXEMPLO, null);
checa("card quando passa tudo", r1.acao === "card", r1);
checa("card traz o argumento do catálogo", r1.objecao.argumento === OBJECOES_EXEMPLO[4].argumento);
checa("card traz o nome", r1.objecao.nome === "Já tentei e não deu certo");
checa("card traz a confiança", r1.confianca === 1.0);

checa("frase cortada espera (mesmo com objeção clara)",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.20), OBJECOES_EXEMPLO, null).acao === "esperar");

checa("tem_objecao abaixo de 0.6 -> nada",
  aplicarRegra(resposta(0.50, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "nada");

checa("exatamente 0.6 passa (limiar inclusivo)",
  aplicarRegra(resposta(0.60, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "card");
checa("exatamente 0.5 de confiança passa (limiar inclusivo)",
  aplicarRegra(resposta(0.9, "ta_caro", 0.50, 0.9), OBJECOES_EXEMPLO, null).acao === "card");

checa("objeção com confiança baixa -> alerta neutro",
  aplicarRegra(resposta(0.90, "ta_caro", 0.30, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");
checa("escolheu 'nenhuma' com objeção alta -> alerta neutro",
  aplicarRegra(resposta(0.90, "nenhuma", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");
checa("id fora do catálogo -> alerta neutro (não quebra)",
  aplicarRegra(resposta(0.90, "id_fantasma", 0.99, 0.9), OBJECOES_EXEMPLO, null).acao === "alerta");

checa("não repete a mesma objeção seguida",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9), OBJECOES_EXEMPLO, "ta_caro").acao === "repetida");
checa("objeção diferente da anterior passa",
  aplicarRegra(resposta(0.96, "vou_pensar", 0.99, 0.9), OBJECOES_EXEMPLO, "ta_caro").acao === "card");

checa("fase sai quando confiança >= 0.5",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9, 0.80), OBJECOES_EXEMPLO, null).fase === "objecao");
checa("fase é null quando confiança < 0.5",
  aplicarRegra(resposta(0.96, "ta_caro", 0.99, 0.9, 0.20), OBJECOES_EXEMPLO, null).fase === null);

checa("resposta sem answers não quebra",
  aplicarRegra({}, OBJECOES_EXEMPLO, null).acao === "nada");

// ---------- calcularCusto ----------
console.log("\ncalcularCusto");
checa("1M tokens de entrada = a tarifa", calcularCusto({ input_tokens: 1000000, output_tokens: 999 }) === CONFIG.usdPorMilhaoInput);
checa("676 tokens", Math.abs(calcularCusto({ input_tokens: 676, output_tokens: 150 }) - 676 / 1e6 * CONFIG.usdPorMilhaoInput) < 1e-12);
checa("saída é gratuita", calcularCusto({ input_tokens: 0, output_tokens: 500000 }) === 0);
checa("usage ausente = 0", calcularCusto(undefined) === 0);

// ---------- catálogo de exemplo ----------
console.log("\nobjecoes-exemplo");
checa("tem 7 objeções", OBJECOES_EXEMPLO.length === 7);
checa("ids únicos", new Set(OBJECOES_EXEMPLO.map(o => o.id)).size === 7);
checa("nenhum id é 'nenhuma' (reservado)", !OBJECOES_EXEMPLO.some(o => o.id === "nenhuma"));
checa("todas têm nome, comoSoa e argumento", OBJECOES_EXEMPLO.every(o => o.nome && o.comoSoa && o.argumento));

console.log(falhas === 0 ? "\nTUDO OK" : "\n" + falhas + " FALHA(S)");
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd aivenda && node teste-decisao.js`
Expected: FAIL — `Error: Cannot find module './lib/decisao.js'`

- [ ] **Step 3: Write `aivenda/lib/decisao.js`**

```js
// Camada de decisão — funções puras, sem DOM e sem rede.
// Roda no browser (via <script>) e no Node (via require), de propósito:
// o teste.js tem que exercitar ESTA regra, não uma cópia dela.

// ============================================================
// CONFIG — todos os botões de ajuste do Jev num só lugar.
// Afinar o Jev depois é mudar um número aqui. Nada mais.
// ============================================================
const CONFIG = {
  // Fixado, não "jev-latest": num sistema de decisão calibrado a
  // calibragem não deve mudar sozinha embaixo da aplicação.
  modelo: "jev-1.13.0",

  limiarObjecao: 0.6,   // noul de tem_objecao para considerar que há objeção
  limiarConfianca: 0.5, // confidence da choice para mostrar o card com argumento
  limiarTerminou: 0.5,  // abaixo disso a frase está cortada: espera o resto
  limiarFase: 0.5,      // confidence mínima para mover a barra de fase

  pausaParcialMs: 700,  // silêncio que dispara a chamada com texto parcial
  historicoFalas: 8,    // quantas falas vão no state

  // US$ por 1M tokens de entrada. Saída é gratuita.
  // ATENÇÃO: não encontrado na doc oficial da TypeSafe — vem de duas fontes
  // de terceiros que concordam. Por isso a tela diz "custo estimado".
  usdPorMilhaoInput: 0.042,

  // As perguntas vão em inglês: é onde o Jev acerta mais.
  // O state vai em português, porque é a conversa real.
  instrucoes: {
    tem_objecao: "Is the customer raising an objection, concern or pushing back on the offer in their last utterance?",
    objecao: "Which of these objections best matches the customer's last utterance?",
    fase: "Which phase is this sales call currently in?",
    terminou_de_falar: "Is the customer's last utterance a complete thought, or was it cut off mid-sentence?"
  }
};

const FASES = {
  abertura: "Small talk, introductions, building rapport. The offer has not been presented yet.",
  diagnostico_dor: "The seller is asking questions to uncover the customer's problems, needs or current situation.",
  apresentacao: "The seller is explaining the product, how it works, or its benefits.",
  objecao: "The customer is pushing back, raising concerns or hesitating, and the seller is addressing it.",
  fechamento: "Talking about next steps, price agreement, contract, signing or scheduling implementation."
};

const NOMES_FASE = {
  abertura: "Abertura",
  diagnostico_dor: "Diagnóstico de dor",
  apresentacao: "Apresentação",
  objecao: "Objeção",
  fechamento: "Fechamento"
};

// Monta as 4 perguntas. `objecoes` é o catálogo do vendedor.
function montarPerguntas(objecoes) {
  const criteriaObjecao = {};
  (objecoes || []).forEach(o => { criteriaObjecao[o.id] = o.comoSoa; });
  // "nenhuma" é a saída de escape: sem ela o Jev é forçado a escolher uma
  // objeção mesmo quando o cliente não objetou nada.
  criteriaObjecao.nenhuma = "The customer is not raising any of these objections.";

  return {
    tem_objecao: {
      type: "noul",
      instructions: CONFIG.instrucoes.tem_objecao,
      criteria: {
        true: "The customer expresses a concern, a hesitation, a doubt or a blocker.",
        false: "The customer is not objecting. They are answering, agreeing, asking a neutral question or making small talk."
      }
    },
    objecao: {
      type: "choice",
      instructions: CONFIG.instrucoes.objecao,
      criteria: criteriaObjecao
    },
    fase: {
      type: "choice",
      instructions: CONFIG.instrucoes.fase,
      criteria: FASES
    },
    terminou_de_falar: {
      type: "noul",
      instructions: CONFIG.instrucoes.terminou_de_falar,
      criteria: {
        true: "The utterance is a complete thought and the customer seems done speaking.",
        false: "The utterance is cut off mid-sentence and the customer is clearly still speaking."
      }
    }
  };
}

// O state vai em português: é a conversa real.
function montarState(falas, ultimaFalaDoCliente) {
  const lista = falas || [];
  return {
    conversa: lista.slice(-CONFIG.historicoFalas),
    ultima_fala_do_cliente: ultimaFalaDoCliente
  };
}

// A regra. Devolve uma das ações:
//   "card"      -> mostra o card grande com o argumento
//   "alerta"    -> objeção detectada mas fora do catálogo (card neutro, sem argumento)
//   "esperar"   -> frase cortada, espera o resto
//   "repetida"  -> mesma objeção do card anterior, ignora
//   "nada"      -> não há objeção
//
// `ultimaMostrada` é o id da última objeção que gerou card (ou null).
function aplicarRegra(respostaJev, objecoes, ultimaMostrada) {
  const a = (respostaJev && respostaJev.answers) || {};

  const temObjecao = a.tem_objecao ? a.tem_objecao.noul : 0;
  const terminou = a.terminou_de_falar ? a.terminou_de_falar.noul : 1;
  const escolha = a.objecao ? a.objecao.choice : "nenhuma";
  const confianca = a.objecao ? a.objecao.confidence : 0;

  // A fase é independente da objeção: atualiza a barra mesmo quando não há card.
  const fase = a.fase && a.fase.confidence >= CONFIG.limiarFase ? a.fase.choice : null;

  const base = { fase, temObjecao, confianca, escolha };

  if (temObjecao < CONFIG.limiarObjecao) return Object.assign({ acao: "nada" }, base);

  // Há objeção. Se a frase está cortada, o texto ainda vai mudar: espera.
  // Essa checagem vem DEPOIS de tem_objecao para que a barra de fase e o
  // "nada" não fiquem presos atrás de uma frase incompleta.
  if (terminou < CONFIG.limiarTerminou) return Object.assign({ acao: "esperar" }, base);

  const doCatalogo = (objecoes || []).find(o => o.id === escolha);

  if (escolha === "nenhuma" || confianca < CONFIG.limiarConfianca || !doCatalogo) {
    return Object.assign({ acao: "alerta" }, base);
  }

  if (escolha === ultimaMostrada) return Object.assign({ acao: "repetida" }, base);

  return Object.assign({ acao: "card", objecao: doCatalogo }, base);
}

// A API não devolve custo, só tokens. Saída é gratuita.
function calcularCusto(usage) {
  if (!usage || !usage.input_tokens) return 0;
  return usage.input_tokens / 1e6 * CONFIG.usdPorMilhaoInput;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG, FASES, NOMES_FASE, montarPerguntas, montarState, aplicarRegra, calcularCusto };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aivenda && node teste-decisao.js`
Expected: every line `ok`, then `TUDO OK`, exit 0.

- [ ] **Step 5: Delete the superseded test**

Its four checks were folded into `teste-decisao.js`.

```bash
rm aivenda/teste-objecoes.js
```

- [ ] **Step 6: Commit**

```bash
git add aivenda/lib/decisao.js aivenda/teste-decisao.js
git rm --cached aivenda/teste-objecoes.js
git commit -m "feat(aivenda): camada de decisão pura + testes

Regra, montagem das perguntas e cálculo de custo como funções puras,
para que teste.js exercite a regra real e não uma cópia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The server and the /jev proxy

**Files:**
- Create: `aivenda/server.js`
- Create: `aivenda/.env` (local only, never committed)

- [ ] **Step 1: Write `aivenda/server.js`**

```js
// Servidor local. Node puro, zero dependências.
//   - serve os arquivos estáticos da pasta
//   - POST /jev  -> repassa para a TypeSafe injetando a chave
// A chave fica só aqui. O browser nunca a vê.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORTA = process.env.PORT || 3000;
const RAIZ = __dirname;

// ---------- .env ----------
function carregarEnv() {
  const arquivo = path.join(RAIZ, ".env");
  if (!fs.existsSync(arquivo)) return {};
  const env = {};
  fs.readFileSync(arquivo, "utf8").split("\n").forEach(linha => {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) return;
    const i = limpa.indexOf("=");
    if (i < 1) return;
    // Aspas são opcionais no .env; tira se estiverem lá.
    env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  });
  return env;
}

const env = carregarEnv();
const CHAVE = env.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY;

if (!CHAVE) {
  console.error("\n  Falta a TYPESAFE_API_KEY.\n");
  console.error("  1. cp .env.example .env");
  console.error("  2. cole sua chave no .env");
  console.error("  3. node server.js\n");
  process.exit(1);
}

// ---------- proxy ----------
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function proxyJev(req, res) {
  let corpo = "";
  req.on("data", c => {
    corpo += c;
    // Jev aceita ~32k tokens; 1MB de JSON é erro nosso, não uso legítimo.
    if (corpo.length > 1e6) { req.destroy(); }
  });
  req.on("end", () => {
    const opcoes = {
      hostname: "api.typesafe.ai",
      path: "/v1/systemone",
      method: "POST",
      headers: {
        "Authorization": "Bearer " + CHAVE,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(corpo)
      }
    };
    const upstream = https.request(opcoes, r => {
      let resp = "";
      r.on("data", c => { resp += c; });
      r.on("end", () => {
        if (r.statusCode !== 200) console.error("Jev " + r.statusCode + ": " + resp.slice(0, 300));
        res.writeHead(r.statusCode, { "Content-Type": "application/json; charset=utf-8" });
        res.end(resp);
      });
    });
    upstream.on("error", e => {
      console.error("Erro de rede ao chamar o Jev: " + e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "falha ao falar com a TypeSafe: " + e.message }));
    });
    upstream.end(corpo);
  });
}

// ---------- estáticos ----------
function servirArquivo(req, res) {
  const urlLimpa = decodeURIComponent(req.url.split("?")[0]);
  const relativo = urlLimpa === "/" ? "index.html" : urlLimpa.replace(/^\/+/, "");
  const destino = path.join(RAIZ, relativo);

  // Impede ../ sair da pasta do projeto.
  if (!destino.startsWith(RAIZ)) { res.writeHead(403); return res.end("403"); }
  // .env está na raiz servida: nunca entregar, por mais que peçam.
  if (path.basename(destino) === ".env") { res.writeHead(403); return res.end("403"); }

  fs.readFile(destino, (erro, dados) => {
    if (erro) { res.writeHead(404); return res.end("404 " + relativo); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(destino)] || "application/octet-stream" });
    res.end(dados);
  });
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/jev") return proxyJev(req, res);
  if (req.method === "GET") return servirArquivo(req, res);
  res.writeHead(405); res.end("405");
}).listen(PORTA, () => {
  console.log("\n  Copiloto de Call rodando:  http://localhost:" + PORTA + "\n");
  console.log("  Use o Chrome 139 ou mais novo. Fone de ouvido é recomendado.\n");
});
```

- [ ] **Step 2: Create the local `.env`**

`.gitignore` from Task 1 already excludes it.

```bash
cd aivenda
cp .env.example .env
# cole a chave da TypeSafe dentro do .env (NUNCA escreva a chave neste plano)
```

- [ ] **Step 3: Verify the key is not tracked by git**

Run: `git check-ignore -v aivenda/.env`
Expected: prints the `.gitignore` rule that matches, e.g. `aivenda/.gitignore:1:.env	aivenda/.env`.
If it prints nothing, the file is NOT ignored — stop and fix `.gitignore` before any commit.

- [ ] **Step 4: Verify the server refuses to start without a key**

Run: `cd aivenda && mv .env .env.bak && node server.js; mv .env.bak .env`
Expected: `Falta a TYPESAFE_API_KEY.` and exit 1, not a stack trace.

- [ ] **Step 5: Start the server and verify the proxy end to end**

Run in background: `cd aivenda && node server.js`

Then:

```bash
curl -s -X POST http://localhost:3000/jev -H "Content-Type: application/json" -d '{"model":"jev-1.13.0","state":"Esse valor ta fora do meu orcamento.","questions":{"tem_objecao":{"type":"noul","instructions":"Is the customer objecting?","criteria":{"true":"Yes","false":"No"}}}}'
```

Expected: `{"model":"jev-1.13.0","answers":{"tem_objecao":{"type":"noul","noul":0.9...}},"usage":{...}}` with a `noul` above 0.9.

- [ ] **Step 6: Verify the .env is not reachable over HTTP**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/.env`
Expected: `403`

- [ ] **Step 7: Commit**

```bash
git add aivenda/server.js
git commit -m "feat(aivenda): servidor local e proxy /jev

Node puro, zero deps. A chave fica no servidor; o browser só conhece
POST /jev. .env bloqueado por HTTP e fora do git.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The CLI harness (teste.js)

Built before the UI on purpose: it validates the questions against the real model, so the UI is built on a decision layer already known to work.

**Files:**
- Create: `aivenda/teste.js`

- [ ] **Step 1: Write `aivenda/teste.js`**

```js
// Manda 20 falas de cliente para o Jev e imprime a decisão, a latência e o custo.
// Usa a MESMA regra que a página (lib/decisao.js). Serve para afinar os
// thresholds sem precisar de call real.
//
//   node teste.js
//
// Precisa da TYPESAFE_API_KEY no .env. Não precisa do servidor rodando.

const fs = require("fs");
const path = require("path");
const https = require("https");
const { CONFIG, montarPerguntas, montarState, aplicarRegra, calcularCusto } = require("./lib/decisao.js");
const { OBJECOES_EXEMPLO } = require("./lib/objecoes-exemplo.js");

function carregarChave() {
  const arquivo = path.join(__dirname, ".env");
  if (fs.existsSync(arquivo)) {
    const m = fs.readFileSync(arquivo, "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.TYPESAFE_API_KEY;
}

const CHAVE = carregarChave();
if (!CHAVE) { console.error("Falta a TYPESAFE_API_KEY no .env"); process.exit(1); }

// 20 falas: as 7 objeções, falas sem objeção nenhuma, e uma frase cortada.
// `espera` é o que DEVERIA sair — é o gabarito para afinar os thresholds.
const FALAS = [
  { fala: "Poxa, gostei da ideia mas esse valor ta bem fora do meu orcamento agora.", espera: "ta_caro" },
  { fala: "Quanto custa isso? Porque olha, dinheiro aqui ta curto.", espera: "ta_caro" },
  { fala: "Consegue fazer um precinho melhor? Assim fica pesado pra mim.", espera: "ta_caro" },
  { fala: "Sera que isso funciona pro meu tipo de negocio? Minha clientela e bem diferente.", espera: "funciona_pra_mim" },
  { fala: "Eu vendo pra construtora, nao sei se um robo desses da conta do meu cliente.", espera: "funciona_pra_mim" },
  { fala: "Agora nao e um bom momento, estamos no meio de uma mudanca aqui.", espera: "nao_e_o_momento" },
  { fala: "Deixa pra janeiro? Dezembro aqui e uma loucura.", espera: "nao_e_o_momento" },
  { fala: "Preciso conversar com meu socio antes de fechar qualquer coisa.", espera: "falar_com_socio" },
  { fala: "Vou levar pra minha esposa, ela cuida da parte financeira.", espera: "falar_com_socio" },
  { fala: "Ja tentei um chatbot ano passado e foi um desastre, so irritou cliente.", espera: "ja_tentei" },
  { fala: "Olha, contratei uma empresa dessas e nao deu em nada, perdi dinheiro.", espera: "ja_tentei" },
  { fala: "Deixa eu pensar com calma e te retorno.", espera: "vou_pensar" },
  { fala: "Me manda por email que eu analiso depois.", espera: "vou_pensar" },
  { fala: "Nunca ouvi falar da sua empresa, como eu sei que nao e golpe?", espera: "nao_confio" },
  { fala: "Nao quero uma IA falando com meu cliente, tenho medo do que ela vai dizer.", espera: "nao_confio" },
  { fala: "Bom dia! Tudo bem por aqui, e voce?", espera: null },
  { fala: "Hoje a gente atende tudo pelo WhatsApp mesmo, sou eu e mais duas meninas.", espera: null },
  { fala: "Entendi. E ele responde em quanto tempo?", espera: null },
  { fala: "Faz sentido. Como que funciona a instalacao?", espera: null },
  { fala: "Olha, eu achei interessante mas o problema e que", espera: "CORTADA" }
];

const PERGUNTAS = montarPerguntas(OBJECOES_EXEMPLO);

function chamarJev(state) {
  const corpo = JSON.stringify({ model: CONFIG.modelo, state, questions: PERGUNTAS });
  const inicio = Date.now();
  return new Promise((ok, erro) => {
    const r = https.request({
      hostname: "api.typesafe.ai", path: "/v1/systemone", method: "POST",
      headers: { "Authorization": "Bearer " + CHAVE, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) }
    }, resp => {
      let txt = "";
      resp.on("data", c => { txt += c; });
      resp.on("end", () => {
        if (resp.statusCode !== 200) return erro(new Error("HTTP " + resp.statusCode + ": " + txt.slice(0, 200)));
        try { ok({ json: JSON.parse(txt), ms: Date.now() - inicio }); }
        catch (e) { erro(new Error("resposta não é JSON: " + txt.slice(0, 200))); }
      });
    });
    r.on("error", erro);
    r.end(corpo);
  });
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); }

(async () => {
  console.log("\n  " + FALAS.length + " falas -> " + CONFIG.modelo);
  console.log("  regra: tem_objecao >= " + CONFIG.limiarObjecao + "  e  confianca >= " + CONFIG.limiarConfianca + "\n");
  console.log("  " + pad("FALA", 46) + pad("OBJ", 6) + pad("ESCOLHA", 18) + pad("CONF", 6) + pad("FIM", 6) + pad("ACAO", 10) + pad("MS", 6) + "GABARITO");
  console.log("  " + "-".repeat(112));

  let somaMs = 0, custoTotal = 0, acertos = 0, avaliadas = 0;

  for (const caso of FALAS) {
    let linha;
    try {
      const { json, ms } = await chamarJev(montarState([{ quem: "cliente", fala: caso.fala }], caso.fala));
      const d = aplicarRegra(json, OBJECOES_EXEMPLO, null);
      const custo = calcularCusto(json.usage);
      somaMs += ms; custoTotal += custo;

      // Gabarito: null espera "nada", "CORTADA" espera "esperar", resto espera aquele id.
      const esperado = caso.espera === null ? "nada" : caso.espera === "CORTADA" ? "esperar" : caso.espera;
      const obtido = caso.espera === null ? d.acao : caso.espera === "CORTADA" ? d.acao : (d.acao === "card" ? d.escolha : d.acao);
      const bateu = esperado === obtido;
      avaliadas++; if (bateu) acertos++;

      linha = pad(caso.fala, 46) + pad(d.temObjecao.toFixed(2), 6) + pad(d.escolha, 18) +
        pad(d.confianca.toFixed(2), 6) + pad((json.answers.terminou_de_falar.noul).toFixed(2), 6) +
        pad(d.acao, 10) + pad(ms, 6) + (bateu ? "ok" : "esperava " + esperado);
    } catch (e) {
      linha = pad(caso.fala, 46) + "ERRO: " + e.message;
    }
    console.log("  " + linha);
  }

  console.log("  " + "-".repeat(112));
  console.log("\n  decisoes:        " + FALAS.length);
  console.log("  latencia media:  " + Math.round(somaMs / FALAS.length) + " ms");
  console.log("  custo total:     US$ " + custoTotal.toFixed(6) + "  (estimado, US$ " + CONFIG.usdPorMilhaoInput + "/1M entrada)");
  console.log("  bateu o gabarito: " + acertos + "/" + avaliadas + "\n");
})();
```

- [ ] **Step 2: Run it**

Run: `cd aivenda && node teste.js`

Expected: a 20-row table, every row with an `MS` value in the 200–900 range, a `latencia media` line, a `custo total` well under US$ 0.01, and `bateu o gabarito: N/20`.

- [ ] **Step 3: Read the gabarito column and record the result**

This is the tuning signal, not a pass/fail gate. Expect most rows `ok`. If a row misses:
- an objection row landing on `alerta` means that objection's `comoSoa` is too vague — the fix is the `comoSoa` text in `lib/objecoes-exemplo.js`, not the threshold.
- a neutral row (`espera: null`) landing on `card` is a false positive, the worst failure mode for this product — raise `CONFIG.limiarObjecao`.
- the `CORTADA` row landing on anything but `esperar` means `terminou_de_falar` came back high on a clearly truncated sentence; note the actual `FIM` value.

Do not change thresholds to chase a perfect score here — the user explicitly deferred Jev tuning. Just report the numbers.

- [ ] **Step 4: Commit**

```bash
git add aivenda/teste.js
git commit -m "feat(aivenda): teste.js com 20 falas e gabarito

Exercita a regra real contra o modelo real e imprime decisao, latencia
e custo por fala.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The listening layer (audio.js)

The trickiest file. Two recognizers, the silent-fallback detection, auto-restart, and the 700ms debounce with sequence-number cancellation.

**Files:**
- Create: `aivenda/audio.js`

- [ ] **Step 1: Write `aivenda/audio.js`**

```js
// Camada de áudio: duas trilhas de reconhecimento ao vivo em pt-BR.
//   A = seu microfone (você)      -> só exibe
//   B = áudio da aba do Meet      -> só ESTA dispara decisão
//
// Por que só B dispara: se o áudio do cliente vazar da sua caixa de som
// para o seu microfone, no pior caso a coluna "Você" fica suja. Nunca
// dispara um card falso. (Mesmo assim: use fone.)

const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;

// ------------------------------------------------------------------
// Detecção obrigatória: start(audioTrack) existe a partir do Chrome 139.
// Onde não existe, o argumento é IGNORADO EM SILÊNCIO e a instância passa
// a ouvir o microfone — a coluna "Cliente" viraria um espelho secreto da
// coluna "Você" e o vendedor não perceberia.
//
// O truque: uma track morta (readyState === "ended") é inválida. Quem
// suporta o parâmetro valida e lança InvalidStateError. Quem não suporta
// ignora o argumento e começa a ouvir o microfone — aí abortamos.
// ------------------------------------------------------------------
function suportaAudioTrack() {
  if (!Reconhecimento) return false;
  let ctx, r;
  try {
    ctx = new AudioContext();
    const destino = ctx.createMediaStreamDestination();
    const track = destino.stream.getAudioTracks()[0];
    track.stop(); // readyState -> "ended"

    r = new Reconhecimento();
    try {
      r.start(track);
      // Não lançou: o argumento foi ignorado. Para o que acabou de começar.
      try { r.abort(); } catch (e) {}
      return false;
    } catch (e) {
      return e && e.name === "InvalidStateError";
    }
  } catch (e) {
    return false;
  } finally {
    if (ctx) ctx.close().catch(() => {});
  }
}

// Uma trilha de reconhecimento que se reergue sozinha.
//
// O Chrome encerra a sessão depois de silêncio, e a spec manda abortar
// quando a página perde foco — e você vai estar olhando o Meet, não esta
// página. Então reiniciamos em onend e onerror, sempre.
function criarTrilha({ nome, track, onParcial, onFinal, onEstado }) {
  const r = new Reconhecimento();
  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;

  let ligada = false;
  let reiniciando = null;

  r.onresult = ev => {
    let parcial = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const texto = ev.results[i][0].transcript.trim();
      if (!texto) continue;
      if (ev.results[i].isFinal) onFinal(texto);
      else parcial += texto + " ";
    }
    if (parcial.trim()) onParcial(parcial.trim());
  };

  r.onerror = ev => {
    // not-allowed / service-not-allowed = o usuário negou o microfone.
    // Reiniciar aí só geraria um loop de prompts negados.
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      ligada = false;
      onEstado("negado", ev.error);
      return;
    }
    // "no-speech" e "aborted" são rotina; onend cuida do restart.
    onEstado("erro", ev.error);
  };

  r.onend = () => {
    if (!ligada) { onEstado("parada"); return; }
    // Pequeno atraso: start() imediato depois de onend às vezes lança
    // InvalidStateError porque a sessão anterior ainda está fechando.
    clearTimeout(reiniciando);
    reiniciando = setTimeout(() => {
      if (!ligada) return;
      try { track ? r.start(track) : r.start(); onEstado("ouvindo"); }
      catch (e) { onEstado("erro", e.name); reiniciando = setTimeout(() => r.onend(), 500); }
    }, 250);
  };

  return {
    nome,
    comecar() {
      ligada = true;
      try { track ? r.start(track) : r.start(); onEstado("ouvindo"); }
      catch (e) { onEstado("erro", e.name); }
    },
    parar() {
      ligada = false;
      clearTimeout(reiniciando);
      try { r.abort(); } catch (e) {}
      onEstado("parada");
    }
  };
}

// Junta as falas finais do cliente e dispara depois de uma pausa curta.
//
// Cada disparo leva um `seq` crescente. Quem chama descarta a resposta se
// `seq` não for mais o atual — é isso que garante que fala mais nova vence
// fala mais velha, independente da ordem em que a rede responder.
function criarDisparador({ pausaMs, onDisparo }) {
  let acumulado = "";
  let parcialAtual = "";
  let timer = null;
  let seq = 0;

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const texto = (acumulado + " " + parcialAtual).trim();
      if (texto) onDisparo(texto, ++seq);
    }, pausaMs);
  }

  return {
    seqAtual: () => seq,
    parcial(texto) { parcialAtual = texto; agendar(); },
    final(texto) {
      acumulado = (acumulado + " " + texto).trim();
      parcialAtual = "";
      agendar();
    },
    // Chamado quando a decisão saiu: a frase acabou, começa uma nova.
    limpar() { acumulado = ""; parcialAtual = ""; clearTimeout(timer); },
    zerar() { acumulado = ""; parcialAtual = ""; clearTimeout(timer); seq = 0; }
  };
}

// Pede a aba do Meet e devolve a track de áudio dela.
async function pegarAudioDaAba() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const audio = stream.getAudioTracks()[0];
  if (!audio) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error("Você compartilhou a aba mas não marcou 'Compartilhar áudio da aba'. Tente de novo e marque a caixinha.");
  }
  // O vídeo não é usado para nada; só a Screen Capture API exige pedir.
  stream.getVideoTracks().forEach(t => t.stop());
  return { track: audio, stream };
}
```

- [ ] **Step 2: Commit**

There is nothing to run yet — this file is wired up in Task 6, which is where it gets verified in the browser.

```bash
git add aivenda/audio.js
git commit -m "feat(aivenda): camada de audio com duas trilhas

Detecta se start(audioTrack) e realmente suportado (o argumento e
ignorado em silencio no Chrome < 139), reinicia a sessao sozinha e
dispara com texto parcial depois de 700ms de pausa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The page

**Files:**
- Create: `aivenda/index.html`

- [ ] **Step 1: Write `aivenda/index.html`**

High contrast, large type, calm motion — the screen gets recorded. The card is the only loud thing on the page.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copiloto de Call</title>
<style>
  :root {
    --bg: #0b0d10; --painel: #14181d; --linha: #232a32;
    --txt: #e8edf2; --fraco: #8b97a5; --fraquinho: #5b6673;
    --destaque: #4da3ff; --ok: #35d07f; --alerta: #ffb340; --erro: #ff5f56;
    --card: #1b2229;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--txt);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    height: 100vh; display: flex; flex-direction: column; overflow: hidden;
  }

  /* ---------- topo ---------- */
  header { border-bottom: 1px solid var(--linha); padding: 12px 20px; display: flex; align-items: center; gap: 24px; flex-shrink: 0; }
  .marca { font-weight: 650; letter-spacing: -.01em; font-size: 15px; }
  .marca span { color: var(--fraquinho); font-weight: 400; }
  nav { display: flex; gap: 4px; margin-left: auto; }
  nav button {
    background: none; border: 1px solid transparent; color: var(--fraco);
    padding: 6px 14px; border-radius: 7px; cursor: pointer; font: inherit; font-size: 14px;
  }
  nav button:hover { color: var(--txt); }
  nav button.ativa { background: var(--painel); border-color: var(--linha); color: var(--txt); }

  /* ---------- barra de fase ---------- */
  .fases { display: flex; gap: 8px; padding: 14px 20px; border-bottom: 1px solid var(--linha); flex-shrink: 0; }
  .fase {
    flex: 1; text-align: center; padding: 9px 6px; border-radius: 8px;
    background: var(--painel); border: 1px solid var(--linha);
    color: var(--fraquinho); font-size: 12.5px; font-weight: 500;
    transition: background .25s, color .25s, border-color .25s;
  }
  .fase.ativa { background: #10243a; border-color: var(--destaque); color: var(--destaque); }

  /* ---------- corpo ---------- */
  main { flex: 1; display: grid; grid-template-columns: 250px 1fr 250px; gap: 1px; background: var(--linha); overflow: hidden; }
  .coluna { background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
  .coluna h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: var(--fraquinho);
    padding: 12px 16px 8px; display: flex; align-items: center; gap: 7px; font-weight: 600;
  }
  .luz { width: 7px; height: 7px; border-radius: 50%; background: var(--fraquinho); flex-shrink: 0; }
  .luz.viva { background: var(--ok); box-shadow: 0 0 7px var(--ok); }
  .luz.ruim { background: var(--erro); }
  .falas { flex: 1; overflow-y: auto; padding: 0 16px 16px; font-size: 13.5px; }
  .falas p { margin-bottom: 9px; color: var(--fraco); }
  .falas p.nova { color: var(--txt); }
  .falas p.parcial { color: var(--fraquinho); font-style: italic; }

  /* ---------- centro ---------- */
  .centro { background: var(--bg); display: flex; flex-direction: column; padding: 22px; overflow: hidden; }
  .vazio { margin: auto; text-align: center; color: var(--fraquinho); max-width: 340px; }
  .vazio .grande { font-size: 15px; color: var(--fraco); margin-bottom: 10px; }

  #btComecar {
    display: block; margin: auto; background: var(--destaque); color: #04121f;
    border: 0; border-radius: 12px; padding: 20px 44px;
    font: inherit; font-size: 19px; font-weight: 650; cursor: pointer;
    transition: transform .12s, background .2s;
  }
  #btComecar:hover { transform: translateY(-1px); }
  #btComecar.ativo { background: var(--painel); color: var(--erro); border: 1px solid var(--erro); }

  #card {
    background: var(--card); border: 1px solid var(--linha); border-left: 4px solid var(--destaque);
    border-radius: 12px; padding: 26px 30px; margin: auto 0;
    animation: entra .22s ease-out;
  }
  #card.neutro { border-left-color: var(--alerta); }
  @keyframes entra { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  .card-topo { font-size: 11.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--destaque); font-weight: 650; margin-bottom: 8px; }
  #card.neutro .card-topo { color: var(--alerta); }
  .card-nome { font-size: 31px; font-weight: 680; letter-spacing: -.02em; line-height: 1.15; margin-bottom: 18px; }
  .card-arg { font-size: 19px; line-height: 1.6; color: #f2f6fa; }
  .card-fala { font-size: 16px; color: var(--fraco); font-style: italic; }
  .card-pe { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--linha); display: flex; gap: 22px; font-size: 12px; color: var(--fraquinho); }
  .card-pe b { color: var(--fraco); font-weight: 600; }

  #historico { flex-shrink: 0; padding-top: 16px; }
  #historico h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; color: var(--fraquinho); margin-bottom: 8px; font-weight: 600; }
  #historico ol { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  #historico li { font-size: 12px; color: var(--fraco); background: var(--painel); border: 1px solid var(--linha); border-radius: 20px; padding: 3px 11px; }

  /* ---------- rodapé ---------- */
  footer { border-top: 1px solid var(--linha); padding: 9px 20px; display: flex; gap: 26px; font-size: 12px; color: var(--fraquinho); flex-shrink: 0; }
  footer b { color: var(--fraco); font-weight: 600; }
  footer .dir { margin-left: auto; }

  #aviso { display: none; background: #2a1416; border-bottom: 1px solid var(--erro); color: #ffc9c5; padding: 11px 20px; font-size: 13.5px; flex-shrink: 0; }
  #aviso.ver { display: block; }

  /* ---------- aba objeções ---------- */
  #abaObjecoes { flex: 1; overflow-y: auto; padding: 26px; display: none; }
  #abaObjecoes.ver { display: block; }
  .ajuda { color: var(--fraco); font-size: 13.5px; max-width: 620px; margin-bottom: 22px; }
  .obj { background: var(--painel); border: 1px solid var(--linha); border-radius: 10px; padding: 16px 18px; margin-bottom: 11px; max-width: 820px; }
  .obj-topo { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .obj-topo strong { font-size: 16px; }
  .obj-topo .id { font-size: 11px; color: var(--fraquinho); font-family: ui-monospace, monospace; }
  .obj-topo .acoes { margin-left: auto; display: flex; gap: 6px; }
  .obj label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--fraquinho); margin: 11px 0 5px; font-weight: 600; }
  .obj p { font-size: 13.5px; color: var(--fraco); }
  input, textarea {
    width: 100%; background: var(--bg); border: 1px solid var(--linha); border-radius: 7px;
    color: var(--txt); padding: 9px 11px; font: inherit; font-size: 13.5px; resize: vertical;
  }
  input:focus, textarea:focus { outline: none; border-color: var(--destaque); }
  .bt { background: var(--painel); border: 1px solid var(--linha); color: var(--fraco); border-radius: 7px; padding: 6px 13px; font: inherit; font-size: 13px; cursor: pointer; }
  .bt:hover { color: var(--txt); border-color: var(--fraquinho); }
  .bt.forte { background: var(--destaque); border-color: var(--destaque); color: #04121f; font-weight: 600; }
  .bt.perigo:hover { color: var(--erro); border-color: var(--erro); }
  .barra-acoes { display: flex; gap: 8px; margin: 18px 0 26px; }
</style>
</head>
<body>

<header>
  <div class="marca">Copiloto de Call <span>· Jev</span></div>
  <nav>
    <button id="navCall" class="ativa">Call</button>
    <button id="navObj">Minhas objeções</button>
  </nav>
</header>

<div id="aviso"></div>

<div id="abaCall" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
  <div class="fases" id="fases"></div>

  <main>
    <section class="coluna">
      <h2><i class="luz" id="luzVoce"></i> Você</h2>
      <div class="falas" id="falasVoce"></div>
    </section>

    <section class="centro">
      <div id="palco">
        <button id="btComecar">Começar a ouvir</button>
      </div>
      <div id="historico" hidden><h3>Objeções nesta call</h3><ol id="listaHist"></ol></div>
    </section>

    <section class="coluna">
      <h2><i class="luz" id="luzCliente"></i> Cliente</h2>
      <div class="falas" id="falasCliente"></div>
    </section>
  </main>

  <footer>
    <span>latência média <b id="mLat">—</b></span>
    <span>decisões <b id="mDec">0</b></span>
    <span>custo estimado <b id="mCusto">US$ 0,000000</b></span>
    <span class="dir" id="mModelo"></span>
  </footer>
</div>

<div id="abaObjecoes">
  <p class="ajuda">
    O Jev só decide <em>qual</em> objeção o cliente levantou. O argumento é seu — é o que
    aparece no card, em letra grande, para você ler durante a call.
    <strong>Como soa</strong> é a descrição que o Jev usa para casar a fala do cliente:
    escreva como a objeção soa na boca do cliente, não o nome dela.
  </p>
  <div class="barra-acoes">
    <button class="bt forte" id="btNova">+ Nova objeção</button>
    <button class="bt" id="btRestaurar">Restaurar as 7 de exemplo</button>
  </div>
  <div id="listaObj"></div>
</div>

<script src="lib/decisao.js"></script>
<script src="lib/objecoes-exemplo.js"></script>
<script src="audio.js"></script>
<script>
// ==================================================================
// Estado
// ==================================================================
const CHAVE_LS = "aivenda.objecoes.v1";

let objecoes = carregarObjecoes();
let falas = [];              // histórico para o state do Jev
let ultimaMostrada = null;   // não repetir o mesmo card seguido
let trilhaVoce = null, trilhaCliente = null, disparador = null, streamAba = null;
let ouvindo = false;
let latencias = [], decisoes = 0, custoTotal = 0;

const $ = id => document.getElementById(id);

// ==================================================================
// Catálogo (localStorage)
// ==================================================================
function carregarObjecoes() {
  try {
    const salvo = localStorage.getItem(CHAVE_LS);
    if (salvo) {
      const lista = JSON.parse(salvo);
      if (Array.isArray(lista)) return lista;
    }
  } catch (e) { /* localStorage bloqueado ou JSON corrompido: cai no exemplo */ }
  return JSON.parse(JSON.stringify(OBJECOES_EXEMPLO));
}

function salvarObjecoes() {
  try { localStorage.setItem(CHAVE_LS, JSON.stringify(objecoes)); }
  catch (e) { mostrarAviso("Não consegui salvar no navegador. Suas edições valem só nesta aba."); }
}

function idDe(nome) {
  const base = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "objecao";
  if (base === "nenhuma") return "objecao_nenhuma"; // "nenhuma" é reservado pelo Jev
  let id = base, n = 2;
  while (objecoes.some(o => o.id === id)) id = base + "_" + n++;
  return id;
}

// ==================================================================
// Aba Minhas objeções
// ==================================================================
function desenharObjecoes() {
  const alvo = $("listaObj");
  alvo.innerHTML = "";
  if (!objecoes.length) {
    alvo.innerHTML = '<p class="ajuda">Nenhuma objeção cadastrada. Sem catálogo, o card nunca aparece.</p>';
    return;
  }
  objecoes.forEach((o, i) => {
    const div = document.createElement("div");
    div.className = "obj";
    div.innerHTML =
      '<div class="obj-topo"><strong></strong><span class="id"></span>' +
      '<span class="acoes"><button class="bt" data-editar="' + i + '">Editar</button>' +
      '<button class="bt perigo" data-remover="' + i + '">Remover</button></span></div>' +
      '<label>Como soa</label><p class="soa"></p>' +
      '<label>Seu argumento</label><p class="arg"></p>';
    div.querySelector("strong").textContent = o.nome;
    div.querySelector(".id").textContent = o.id;
    div.querySelector(".soa").textContent = o.comoSoa;
    div.querySelector(".arg").textContent = o.argumento;
    alvo.appendChild(div);
  });
}

function formulario(indice) {
  const nova = indice === -1;
  const o = nova ? { nome: "", comoSoa: "", argumento: "" } : objecoes[indice];
  const div = document.createElement("div");
  div.className = "obj";
  div.innerHTML =
    '<label>Nome (título do card)</label><input class="f-nome">' +
    '<label>Como soa (o Jev usa isto para casar a fala do cliente)</label><textarea class="f-soa" rows="2"></textarea>' +
    '<label>Seu argumento (o que você vai falar)</label><textarea class="f-arg" rows="5"></textarea>' +
    '<div class="barra-acoes"><button class="bt forte f-salvar">Salvar</button><button class="bt f-cancelar">Cancelar</button></div>';
  div.querySelector(".f-nome").value = o.nome;
  div.querySelector(".f-soa").value = o.comoSoa;
  div.querySelector(".f-arg").value = o.argumento;

  div.querySelector(".f-salvar").onclick = () => {
    const nome = div.querySelector(".f-nome").value.trim();
    const comoSoa = div.querySelector(".f-soa").value.trim();
    const argumento = div.querySelector(".f-arg").value.trim();
    if (!nome || !comoSoa || !argumento) {
      mostrarAviso("Preencha nome, como soa e argumento — os três são usados.");
      return;
    }
    if (nova) objecoes.push({ id: idDe(nome), nome, comoSoa, argumento });
    else Object.assign(objecoes[indice], { nome, comoSoa, argumento }); // id não muda: é a chave do Jev
    salvarObjecoes();
    desenharObjecoes();
  };
  div.querySelector(".f-cancelar").onclick = desenharObjecoes;

  const alvo = $("listaObj");
  if (nova) alvo.prepend(div);
  else alvo.replaceChild(div, alvo.children[indice]);
  div.querySelector(".f-nome").focus();
}

$("listaObj").addEventListener("click", ev => {
  const editar = ev.target.getAttribute("data-editar");
  const remover = ev.target.getAttribute("data-remover");
  if (editar !== null) formulario(+editar);
  if (remover !== null) { objecoes.splice(+remover, 1); salvarObjecoes(); desenharObjecoes(); }
});
$("btNova").onclick = () => formulario(-1);
$("btRestaurar").onclick = () => {
  objecoes = JSON.parse(JSON.stringify(OBJECOES_EXEMPLO));
  salvarObjecoes(); desenharObjecoes();
};

// ==================================================================
// Abas
// ==================================================================
function trocarAba(qual) {
  const call = qual === "call";
  $("abaCall").style.display = call ? "flex" : "none";
  $("abaObjecoes").classList.toggle("ver", !call);
  $("navCall").classList.toggle("ativa", call);
  $("navObj").classList.toggle("ativa", !call);
}
$("navCall").onclick = () => trocarAba("call");
$("navObj").onclick = () => trocarAba("obj");

// ==================================================================
// Fases
// ==================================================================
function desenharFases(ativa) {
  $("fases").innerHTML = "";
  Object.keys(FASES).forEach(id => {
    const d = document.createElement("div");
    d.className = "fase" + (id === ativa ? " ativa" : "");
    d.textContent = NOMES_FASE[id];
    $("fases").appendChild(d);
  });
}

// ==================================================================
// Transcrição
// ==================================================================
function escreverFala(coluna, texto, parcial) {
  const alvo = $(coluna === "voce" ? "falasVoce" : "falasCliente");
  let p = alvo.querySelector("p.parcial");
  if (parcial) {
    if (!p) { p = document.createElement("p"); p.className = "parcial"; alvo.appendChild(p); }
    p.textContent = texto;
  } else {
    if (p) p.remove();
    const nova = document.createElement("p");
    nova.className = "nova";
    nova.textContent = texto;
    alvo.appendChild(nova);
    // Só a última fala fica em destaque.
    alvo.querySelectorAll("p.nova").forEach((el, i, todos) => { if (i < todos.length - 1) el.classList.remove("nova"); });
  }
  alvo.scrollTop = alvo.scrollHeight;
}

function luz(qual, estado) {
  const el = $(qual === "voce" ? "luzVoce" : "luzCliente");
  el.className = "luz" + (estado === "ouvindo" ? " viva" : estado === "negado" ? " ruim" : "");
}

function mostrarAviso(msg) {
  $("aviso").textContent = msg;
  $("aviso").classList.add("ver");
}
function limparAviso() { $("aviso").classList.remove("ver"); }

// ==================================================================
// Decisão
// ==================================================================
async function decidir(textoCliente, seq) {
  const corpo = {
    model: CONFIG.modelo,
    state: montarState(falas, textoCliente),
    questions: montarPerguntas(objecoes)
  };

  const inicio = performance.now();
  let json;
  try {
    const resp = await fetch("/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
    json = await resp.json();
    if (!resp.ok) { mostrarAviso("O Jev respondeu " + resp.status + ": " + (json.error || "erro")); return; }
  } catch (e) {
    mostrarAviso("Não consegui falar com o servidor: " + e.message);
    return;
  }
  const ms = Math.round(performance.now() - inicio);

  // Chegou fala mais nova enquanto esta chamada estava no ar: descarta.
  // É o número de sequência que garante a ordem, não a ordem das respostas.
  if (seq < disparador.seqAtual()) return;

  limparAviso();
  latencias.push(ms);
  decisoes++;
  custoTotal += calcularCusto(json.usage);
  atualizarRodape();

  const d = aplicarRegra(json, objecoes, ultimaMostrada);
  if (d.fase) desenharFases(d.fase);

  if (d.acao === "card") {
    ultimaMostrada = d.escolha;
    disparador.limpar();
    mostrarCard(d, ms);
    somarHistorico(d.objecao.nome);
  } else if (d.acao === "alerta") {
    disparador.limpar();
    mostrarAlerta(textoCliente, d, ms);
  } else if (d.acao === "nada" || d.acao === "repetida") {
    // Frase resolvida, sem card. Começa a próxima do zero.
    disparador.limpar();
  }
  // "esperar": não limpa — o resto da frase ainda vem.
}

function mostrarCard(d, ms) {
  $("palco").innerHTML =
    '<div id="card"><div class="card-topo">Quebrar objeção</div>' +
    '<div class="card-nome"></div><div class="card-arg"></div>' +
    '<div class="card-pe"><span>confiança <b></b></span><span>decisão em <b></b></span></div></div>';
  $("palco").querySelector(".card-nome").textContent = d.objecao.nome;
  $("palco").querySelector(".card-arg").textContent = d.objecao.argumento;
  const pes = $("palco").querySelectorAll(".card-pe b");
  pes[0].textContent = Math.round(d.confianca * 100) + "%";
  pes[1].textContent = ms + " ms";
}

function mostrarAlerta(textoCliente, d, ms) {
  $("palco").innerHTML =
    '<div id="card" class="neutro"><div class="card-topo">Objeção detectada · não catalogada</div>' +
    '<div class="card-nome">Sem argumento pronto</div><div class="card-fala"></div>' +
    '<div class="card-pe"><span>objeção <b></b></span><span>decisão em <b></b></span>' +
    '<span>cadastre em Minhas objeções</span></div></div>';
  $("palco").querySelector(".card-fala").textContent = '"' + textoCliente + '"';
  const pes = $("palco").querySelectorAll(".card-pe b");
  pes[0].textContent = Math.round(d.temObjecao * 100) + "%";
  pes[1].textContent = ms + " ms";
}

function somarHistorico(nome) {
  $("historico").hidden = false;
  const li = document.createElement("li");
  li.textContent = nome;
  $("listaHist").appendChild(li);
}

function atualizarRodape() {
  $("mDec").textContent = decisoes;
  if (latencias.length) {
    $("mLat").textContent = Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) + " ms";
  }
  $("mCusto").textContent = "US$ " + custoTotal.toFixed(6).replace(".", ",");
}

// ==================================================================
// Começar / parar
// ==================================================================
async function comecar() {
  limparAviso();

  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    mostrarAviso("Este navegador não tem a Web Speech API. Use o Chrome 139 ou mais novo.");
    return;
  }
  if (!objecoes.length) {
    mostrarAviso("Cadastre pelo menos uma objeção na aba 'Minhas objeções' antes de começar.");
    return;
  }
  // Sem esta checagem, a coluna "Cliente" viraria um espelho secreto do
  // seu microfone e você não perceberia. Melhor não começar.
  if (!suportaAudioTrack()) {
    mostrarAviso("Este Chrome não suporta ouvir a aba separada do microfone (precisa do Chrome 139+). Sem isso as duas colunas ouviriam o seu microfone, então não vou começar.");
    return;
  }

  let audio;
  try {
    audio = await pegarAudioDaAba();
  } catch (e) {
    mostrarAviso(e.name === "NotAllowedError" ? "Você cancelou o compartilhamento da aba." : e.message);
    return;
  }
  streamAba = audio.stream;

  disparador = criarDisparador({
    pausaMs: CONFIG.pausaParcialMs,
    onDisparo: (texto, seq) => decidir(texto, seq)
  });

  trilhaVoce = criarTrilha({
    nome: "voce", track: null,
    onParcial: t => escreverFala("voce", t, true),
    onFinal: t => { escreverFala("voce", t, false); falas.push({ quem: "vendedor", fala: t }); },
    onEstado: (estado, extra) => {
      luz("voce", estado);
      if (estado === "negado") mostrarAviso("Permissão de microfone negada. A coluna 'Você' não vai transcrever.");
    }
  });

  trilhaCliente = criarTrilha({
    nome: "cliente", track: audio.track,
    onParcial: t => { escreverFala("cliente", t, true); disparador.parcial(t); },
    onFinal: t => {
      escreverFala("cliente", t, false);
      falas.push({ quem: "cliente", fala: t });
      disparador.final(t);
    },
    onEstado: estado => luz("cliente", estado)
  });

  // A aba pode ser fechada ou o compartilhamento cortado pelo botão do Chrome.
  audio.track.onended = () => { if (ouvindo) { mostrarAviso("O compartilhamento da aba terminou."); parar(); } };

  trilhaVoce.comecar();
  trilhaCliente.comecar();
  ouvindo = true;

  $("btComecar").textContent = "Parar";
  $("btComecar").classList.add("ativo");
  $("palco").innerHTML = '';
  $("palco").appendChild($("btComecar"));
  const vazio = document.createElement("div");
  vazio.className = "vazio";
  vazio.innerHTML = '<div class="grande">Ouvindo as duas trilhas.</div>O card aparece aqui quando o cliente objetar.';
  $("palco").appendChild(vazio);
}

function parar() {
  ouvindo = false;
  if (trilhaVoce) trilhaVoce.parar();
  if (trilhaCliente) trilhaCliente.parar();
  if (disparador) disparador.zerar();
  if (streamAba) { streamAba.getTracks().forEach(t => t.stop()); streamAba = null; }
  luz("voce", "parada"); luz("cliente", "parada");
  $("btComecar").textContent = "Começar a ouvir";
  $("btComecar").classList.remove("ativo");
}

$("btComecar").onclick = () => { ouvindo ? parar() : comecar(); };

// ==================================================================
// Início
// ==================================================================
desenharFases(null);
desenharObjecoes();
atualizarRodape();
$("mModelo").textContent = CONFIG.modelo;
</script>
</body>
</html>
```

- [ ] **Step 2: Start the server**

Run in background: `cd aivenda && node server.js`

- [ ] **Step 3: Verify every file the page needs is served**

```bash
for f in / lib/decisao.js lib/objecoes-exemplo.js audio.js; do
  printf "%-28s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$f)"
done
```

Expected: `200` on all four. A `404` on `lib/decisao.js` means the `path.join` in `servirArquivo` is mangling the subfolder — fix the server, not the HTML.

- [ ] **Step 4: Open the page and check it renders with no console errors**

Open `http://localhost:3000` in Chrome. Verify:
- The 5-step phase bar renders with names in Portuguese, none lit.
- The big blue "Começar a ouvir" button is centered.
- Footer shows `latência média —`, `decisões 0`, `custo estimado US$ 0,000000`, and `jev-1.13.0` on the right.
- The "Minhas objeções" tab lists all 7 with their `id`, "Como soa" and "Seu argumento".
- DevTools console is clean — in particular no `FASES is not defined` (that would mean `lib/decisao.js` did not expose it as a global).

- [ ] **Step 5: Verify the catalog editor round-trips**

In the "Minhas objeções" tab: click **Editar** on "Tá caro", change the argument, **Salvar**, reload the page. The edit must survive (it is in `localStorage`). Then **Restaurar as 7 de exemplo** and confirm it comes back.

- [ ] **Step 6: Verify the decision path with a real objection**

This needs a real second audio source. Open a second Chrome tab playing any Portuguese speech (a YouTube video works), click "Começar a ouvir", pick that tab and **check "Compartilhar áudio da aba"**.

Expected: the Cliente light turns green, transcription fills the right column, and footer `decisões` starts climbing with latency in the 300–900ms range.

To force a card deterministically, use a clip where someone says something like *"ah, mas isso deve ser muito caro"*. Expected: the card appears with "Tá caro" and your argument.

If nothing appears in the Cliente column: you did not check the share-audio box. Stop and start again.

- [ ] **Step 7: Commit**

```bash
git add aivenda/index.html
git commit -m "feat(aivenda): a pagina do copiloto

Barra de fase, duas colunas de transcricao, card grande com o argumento,
historico, rodape com latencia/decisoes/custo e aba de objecoes em
localStorage.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: README

**Files:**
- Create: `aivenda/README.md`

- [ ] **Step 1: Write `aivenda/README.md`**

````markdown
# Copiloto de Call de Vendas

Uma página local que escuta sua call no Google Meet e, quando o cliente objeta,
mostra na hora um card grande com **o argumento que você escreveu**.

O [Jev](https://typesafe.ai) (modelo de decisão da TypeSafe) não escreve nada. Ele só
decide *qual* objeção é, em ~350 ms. O texto é todo seu.

## Rodar em 3 passos

```bash
# 1. sua chave da TypeSafe
cp .env.example .env     # e cole a chave dentro

# 2. sobe
node server.js

# 3. abre
# http://localhost:3000
```

Sem `npm install`: zero dependências.

## Na hora da call

1. Clique em **Começar a ouvir**.
2. Escolha a **aba do Google Meet** e **marque "Compartilhar áudio da aba"**.
   Sem essa caixinha marcada, a coluna "Cliente" fica vazia.
3. Deixe esta página numa janela do lado do Meet.

**Use fone de ouvido.** Sem fone, sua caixa de som devolve a voz do cliente para o seu
microfone e a coluna "Você" fica suja. (Não gera card falso — só o canal do cliente
dispara decisão — mas polui a transcrição.)

**Precisa do Chrome 139 ou mais novo.** Antes disso o Chrome não sabe ouvir a aba
separada do microfone, e a página se recusa a começar em vez de rodar mentindo que as
duas colunas são canais diferentes.

## Suas objeções

Aba **Minhas objeções**. Três campos:

| Campo | Para quê |
|---|---|
| **Nome** | O título do card. |
| **Como soa** | A descrição que o Jev usa para casar a fala do cliente. Escreva como a objeção soa *na boca do cliente*, não o nome dela. É o campo que mais afeta o acerto. |
| **Argumento** | O que aparece em letra grande para você ler. É seu. |

Fica salvo no navegador (`localStorage`). Vem com 7 exemplos para quem vende agente de
IA para pequena empresa.

## Afinar sem call real

```bash
node teste.js
```

Manda 20 falas de cliente para o Jev e imprime, por fala: `tem_objecao`, a objeção
escolhida, a confiança, a ação e a latência. A última coluna compara com um gabarito.

- Objeção caindo em `alerta` → o **"Como soa"** dela está vago. Melhore o texto.
- Fala neutra gerando `card` → falso positivo, o pior caso. Aumente `limiarObjecao`.

Os testes da regra rodam offline, sem gastar API:

```bash
node teste-decisao.js
```

## Ajustes

Tudo num só bloco `CONFIG` no topo de `lib/decisao.js`:

| | padrão | o que faz |
|---|---|---|
| `limiarObjecao` | `0.6` | quão certo o Jev precisa estar de que houve objeção |
| `limiarConfianca` | `0.5` | quão certo precisa estar de *qual* objeção |
| `limiarTerminou` | `0.5` | abaixo disso a frase está cortada e ele espera o resto |
| `pausaParcialMs` | `700` | silêncio que já dispara a decisão com texto parcial |
| `historicoFalas` | `8` | quantas falas vão de contexto |
| `usdPorMilhaoInput` | `0.042` | tarifa para o custo do rodapé |

As perguntas vão para o Jev **em inglês** (é onde ele acerta mais) e a conversa vai
**em português**. Isso é de propósito.

## Como funciona

```
áudio da aba ──► SpeechRecognition B (pt-BR) ──► frase do cliente ─┐
                                                                    ├─► POST /jev
seu microfone ─► SpeechRecognition A (pt-BR) ──► só exibe           │    4 perguntas
                                                                    ▼    ~350 ms
   tem_objecao >= 0.6  E  confiança >= 0.5   ──────────────►  CARD com seu argumento
   terminou_de_falar < 0.5                   ──────────────►  espera o resto da frase
   objeção fora do catálogo                  ──────────────►  alerta neutro
   mesma objeção do card anterior            ──────────────►  ignora
```

Uma chamada, quatro perguntas em paralelo: `tem_objecao` (noul), `objecao` (choice
entre as suas), `fase` (choice) e `terminou_de_falar` (noul).

Numa pausa curta ele já pergunta com o texto parcial; se chegar fala mais nova, a
resposta da chamada antiga é descartada por número de sequência.

## Custo

`usdPorMilhaoInput` é **US$ 0,042 por 1M tokens de entrada** (saída gratuita). Essa
tarifa **não está na documentação oficial da TypeSafe** — vem de duas fontes de
terceiros que concordam. Por isso o rodapé diz "custo estimado". Na prática, uma call
de uma hora custa centavos.

## A chave

Fica só no `.env`, que está no `.gitignore`. O navegador nunca a vê: a página chama
`POST /jev` e o `server.js` injeta a chave. O servidor também recusa servir o `.env`
por HTTP.

Não exponha esta porta para a internet — não há autenticação nenhuma, é para
`localhost`.

## Arquivos

| | |
|---|---|
| `server.js` | serve a página + proxy `/jev`. Node puro. |
| `index.html` | a página inteira. |
| `audio.js` | as duas trilhas de reconhecimento, detecção de suporte e auto-restart. |
| `lib/decisao.js` | `CONFIG` + a regra, em funções puras. |
| `lib/objecoes-exemplo.js` | as 7 objeções de exemplo. |
| `teste.js` | 20 falas contra o Jev real. |
| `teste-decisao.js` | testes da regra, offline. |
````

- [ ] **Step 2: Verify the 3 steps actually work from a clean state**

Run: `cd aivenda && node teste-decisao.js && node server.js`
Expected: `TUDO OK`, then the server banner with the localhost URL.

- [ ] **Step 3: Commit**

```bash
git add aivenda/README.md
git commit -m "docs(aivenda): README com os 3 passos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Final verification

- [ ] **Step 1: Confirm the key is not in the repo**

```bash
git status --short aivenda/
git log --all -p -- aivenda/.env | head -5
grep -rn "apikey_" aivenda/ --exclude-dir=.git || echo "nenhuma chave em arquivo versionado"
```

Expected: `aivenda/.env` appears in **neither** `git status` nor the log. `grep` must
match **only** `aivenda/.env` — if it matches any other file, remove the key from that
file before doing anything else.

- [ ] **Step 2: Run the offline suite**

Run: `cd aivenda && node teste-decisao.js`
Expected: `TUDO OK`, exit 0.

- [ ] **Step 3: Run the live harness**

Run: `cd aivenda && node teste.js`
Expected: 20 rows, average latency printed, total cost under US$ 0.01, gabarito score reported.

- [ ] **Step 4: Report honestly**

State the real gabarito score from Step 3 (e.g. "17/20, with these 3 misses: ..."), the
measured average latency, and the total cost. Do not round a miss up to a pass. If a
neutral utterance produced a `card`, say so plainly — that is a false positive and the
user needs to know before a real call.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 2 — API contract, pinned model | 2 (`CONFIG.modelo`), 3 (proxy) |
| 3 — files, key never in browser | 1, 3 |
| 4 — dual channel pt-BR | 5, 6 |
| 4.1 — silent-fallback detection | 5 (`suportaAudioTrack`), 6 (blocks start) |
| 4.2 — auto-restart | 5 (`criarTrilha` onend/onerror) |
| 4.3 — echo, only client triggers | 5, 6, 7 (headphones) |
| 5 — state pt-BR, 4 questions in English | 2 (`montarPerguntas`, `montarState`) |
| 6.1–6.6 — every display rule | 2 (`aplicarRegra`), tested in Task 2 Step 1 |
| 7 — phase bar, columns, card, history, footer | 6 |
| 7 — catalog CRUD + 7 seeds + localStorage | 1, 6 |
| 8 — cost as estimate | 2 (`calcularCusto`), 6 (footer label), 7 |
| 9 — CONFIG block | 2 |
| 10 — teste.js, 20 utterances | 4 |
| README 3 steps | 7 |

No gaps.

**Placeholder scan:** none. Every code step carries full code; every run step carries
the command and the expected output.

**Type consistency, checked across tasks:**
- `{ id, nome, comoSoa, argumento }` — identical in Tasks 1, 2, 4, 6.
- `montarPerguntas(objecoes)`, `montarState(falas, ultima)`, `aplicarRegra(resposta, objecoes, ultimaMostrada)`, `calcularCusto(usage)` — same signatures in Tasks 2, 4, 6.
- `aplicarRegra` returns `{ acao, fase, temObjecao, confianca, escolha, objecao? }`. Task 2's test asserts `acao`/`objecao`/`confianca`; Task 6 reads `acao`/`fase`/`escolha`/`temObjecao`/`confianca`/`objecao`. All present.
- `acao` values `card | alerta | esperar | repetida | nada` — same five in Tasks 2, 4, 6.
- `FASES` / `NOMES_FASE` exported in Task 2, used as globals in Task 6.
- `criarTrilha({nome,track,onParcial,onFinal,onEstado})`, `criarDisparador({pausaMs,onDisparo})`, `pegarAudioDaAba()`, `suportaAudioTrack()` — defined in Task 5, called with matching shapes in Task 6.
- `disparador` exposes `parcial/final/limpar/zerar/seqAtual` in Task 5; Task 6 uses exactly those.
