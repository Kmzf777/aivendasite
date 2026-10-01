// Colhe da conversa o que o vendedor vai precisar depois: telefone, nome de
// quem atendeu, nome do dono, melhor horario. Funcoes puras, sem rede.
//
// ==================================================================
// POR QUE ISTO NAO USA O JEV
// ==================================================================
// O Jev DECIDE entre opcoes fixas. Ele nao escreve, nao extrai, nao devolve
// texto livre. Pedir "anote o numero" e pedir a unica coisa que ele nao faz.
//
// Numero de telefone tem forma. Forma e regex, e regex nao alucina: ou o
// padrao esta ali ou nao esta. Nome e mais fragil, e por isso TUDO AQUI E
// SUGESTAO: nada vai para a ficha do lead sem o vendedor confirmar ao desligar.
//
// A armadilha que isso evita: salvar "o dono e o Vicente" quando a atendente
// disse "o Vicente nao trabalha mais aqui". Lixo na ficha e pior que ficha
// vazia, porque o vendedor confia nela.

// ------------------------------------------------------------------
// Numeros
// ------------------------------------------------------------------
// O ASR do Chrome ora escreve digito, ora escreve por extenso, e o brasileiro
// dita em grupos ("nove nove, nove um dois tres"). Normalizamos os dois.

const EXTENSO = {
  zero: "0", um: "1", uma: "1", dois: "2", duas: "2", tres: "3", "três": "3",
  quatro: "4", cinco: "5", seis: "6", meia: "6", sete: "7", oito: "8", nove: "9"
};

function digitalizar(texto) {
  return String(texto || "").replace(
    /\b(zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|meia|sete|oito|nove)\b/gi,
    (m) => EXTENSO[m.toLowerCase()] || m
  );
}

// Brasil: fixo tem 8 digitos, celular 9 comecando em 9. Com DDD, 10 ou 11.
function telefoneValido(d) {
  if (d.length === 11) return d[2] === "9";
  if (d.length === 10) return d[2] !== "9";
  if (d.length === 9) return d[0] === "9";
  return d.length === 8;
}

function formatar(d) {
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  if (d.length === 9) return d.slice(0, 5) + "-" + d.slice(5);
  if (d.length === 8) return d.slice(0, 4) + "-" + d.slice(4);
  return d;
}

function acharTelefones(texto) {
  const t = digitalizar(texto);
  const achados = [];
  // Sequencias de digitos possivelmente separadas por espaco, traco, ponto ou
  // parenteses. Cola tudo e valida o tamanho depois.
  const re = /(?:\(?\d{2}\)?[\s.-]*)?\d[\d\s.-]{6,15}\d/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const d = m[0].replace(/\D/g, "");
    // Varre do maior para o menor: 11 digitos e celular com DDD.
    for (const n of [11, 10, 9, 8]) {
      if (d.length >= n) {
        const cand = d.slice(0, n);
        if (telefoneValido(cand)) {
          if (!achados.some(a => a.digitos === cand)) {
            achados.push({ digitos: cand, formatado: formatar(cand), trecho: m[0].trim() });
          }
          break;
        }
      }
    }
  }
  return achados;
}

// ------------------------------------------------------------------
// Nomes
// ------------------------------------------------------------------
// Conversa de telefone entrega nome em formula. Pegamos a formula, nao o nome.
// Palavra comum depois de "é o/a" derruba o falso positivo mais obvio
// ("é o site", "é a loja").

const NAO_E_NOME = new Set([
  "site", "loja", "dono", "dona", "gerente", "chefe", "patrao", "patrão", "responsavel",
  "responsável", "ele", "ela", "voce", "você", "eu", "isso", "aqui", "hoje", "amanha",
  "amanhã", "numero", "número", "whatsapp", "telefone", "endereco", "endereço", "preco",
  "preço", "que", "qual", "quem", "mesmo", "so", "só", "um", "uma", "o", "a", "assim",
  "sobre", "para", "pra", "com", "sem", "muito", "bem", "mal", "tudo", "nada", "comigo"
]);

function limparNome(bruto) {
  const n = String(bruto || "").trim().replace(/[.,!?;:]+$/, "");
  if (!n) return null;
  const p = n.split(/\s+/).slice(0, 2);          // nome + sobrenome, no maximo
  if (NAO_E_NOME.has(p[0].toLowerCase())) return null;
  if (p[0].length < 3) return null;
  return p.join(" ");
}

// O artigo vem num grupo PROPRIO, e exigindo espaco depois dele. Sem o espaco,
// "(?:o|a)?" comeria o O de "Oswaldo" e a captura viraria "swaldo".
const ART = "(?:(?:o|a|os|as|pel[oa]|d[oa])\\s+)?";
const NOME = "([A-Za-zÀ-ÿ]{3,}(?:\\s+[A-Za-zÀ-ÿ]{2,})?)";

// A fronteira da ESQUERDA tem o mesmo problema do \b no fim: "\bé com" nunca
// casa, porque o \b do JavaScript tambem trata "é" como nao-palavra. Lookbehind
// resolve sem consumir caractere e sem depender de ASCII.
const INI = "(?<![A-Za-zÀ-ÿ])";

const PADROES_NOME = [
  // quem esta falando se identifica
  { re: new RegExp(INI + "(?:meu nome (?:é|e)|aqui (?:é|e)|quem fala (?:é|e))\\s+" + ART + NOME, "i"),
    papel: "atendente" },
  // apontando outra pessoa como decisora
  { re: new RegExp(INI + "(?:falar com|fala com|procur(?:a|ar)|quem decide (?:é|e)|" +
                   "(?:o|a) dona?o? (?:é|e)|(?:é|e) com)\\s+" + ART + NOME, "i"),
    papel: "dono" },
];

function acharNomes(texto, quem) {
  const achados = [];
  PADROES_NOME.forEach(p => {
    const m = String(texto || "").match(p.re);
    if (!m) return;
    const nome = limparNome(m[1]);
    if (!nome) return;
    // Quem se identifica numa fala do CLIENTE e o atendente. Na fala do
    // vendedor, "meu nome e X" e o proprio vendedor: nao interessa colher.
    if (p.papel === "atendente" && quem !== "cliente") return;
    achados.push({ papel: p.papel, nome: nome, trecho: m[0].trim() });
  });
  return achados;
}

// ------------------------------------------------------------------
// Horario
// ------------------------------------------------------------------
// Depois de uma prospeccao que nao achou o dono, isto e a coisa mais util que
// sobra: quando voltar a ligar.

// ATENCAO ao \b no fim: o \b do JavaScript e ASCII e trata "ã" como caractere
// NAO-palavra. Entao /manh[ãa]\b/ NUNCA casa com "manhã" — o bug que fez esta
// funcao devolver null para "ele so vem de manha". Onde o grupo pode terminar
// em acento, a fronteira vira (?![a-zà-ÿ]), que funciona com acento.
const FIM = "(?![a-zA-ZÀ-ÿ])";
const PERIODO = "(manh[ãa]|tarde|noite)";

const PADROES_HORARIO = [
  new RegExp("\\b(?:de|pela|pela parte da)\\s+" + PERIODO + FIM, "i"),
  /\b(?:depois|a partir|antes)\s+d[ae]s?\s*(\d{1,2}(?:h|:\d{2})?)/i,
  new RegExp("\\b(?:ele|ela)\\s+(?:chega|volta|vem|est[áa])\\s+[^.]{0,22}?" +
             "(\\d{1,2}(?:h|:\\d{2})?|manh[ãa]|tarde|noite)" + FIM, "i"),
  new RegExp("\\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?" + FIM, "i"),
];

function acharHorario(texto) {
  for (const re of PADROES_HORARIO) {
    const m = String(texto || "").match(re);
    if (m) return { valor: m[1], trecho: m[0].trim() };
  }
  return null;
}

// ------------------------------------------------------------------
// Acumular ao longo da ligacao
// ------------------------------------------------------------------
// Estado imutavel, como o do fluxo. Guarda o TRECHO ORIGINAL junto de cada
// achado: na tela de confirmacao o vendedor ve a frase que gerou aquilo e
// decide em dois segundos se faz sentido.

function colheitaInicial() {
  return { telefones: [], nomes: [], horario: null };
}

function colher(estado, quem, texto) {
  let novo = estado;

  acharTelefones(texto).forEach(t => {
    if (novo.telefones.some(x => x.digitos === t.digitos)) return;
    novo = Object.assign({}, novo, {
      telefones: novo.telefones.concat([{ ...t, quem, confirmado: false }])
    });
  });

  acharNomes(texto, quem).forEach(n => {
    if (novo.nomes.some(x => x.nome.toLowerCase() === n.nome.toLowerCase() && x.papel === n.papel)) return;
    novo = Object.assign({}, novo, {
      nomes: novo.nomes.concat([{ ...n, quem, confirmado: false }])
    });
  });

  if (!novo.horario && quem === "cliente") {
    const h = acharHorario(texto);
    if (h) novo = Object.assign({}, novo, { horario: { ...h, confirmado: false } });
  }

  return novo;
}

// O que a tela de fim de ligacao mostra. Nada aqui vai para a ficha sozinho.
function paraConfirmar(colheita) {
  const itens = [];
  (colheita.nomes || []).filter(n => n.papel === "atendente")
    .forEach(n => itens.push({ campo: "Quem atendeu", valor: n.nome, trecho: n.trecho }));
  (colheita.nomes || []).filter(n => n.papel === "dono")
    .forEach(n => itens.push({ campo: "Nome do dono", valor: n.nome, trecho: n.trecho }));
  (colheita.telefones || [])
    .forEach(t => itens.push({ campo: "Telefone citado", valor: t.formatado, trecho: t.trecho }));
  if (colheita.horario) {
    itens.push({ campo: "Melhor horário", valor: colheita.horario.valor, trecho: colheita.horario.trecho });
  }
  return itens;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    digitalizar, telefoneValido, formatar, acharTelefones,
    limparNome, acharNomes, acharHorario,
    colheitaInicial, colher, paraConfirmar
  };
}
