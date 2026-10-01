// Testes da colheita. Sem rede, sem browser, sem Jev.
//
//   node teste-colheita.js
//
// As falas aqui imitam o que o ASR do Chrome entrega de verdade: digito e
// extenso misturados, pontuacao faltando, numero ditado em grupo.

const C = require("./lib/colheita.js");

let falhas = 0;
function checa(nome, ok, extra) {
  console.log((ok ? "  ok    " : "  FALHA ") + nome);
  if (!ok) { falhas++; if (extra !== undefined) console.log("        " + JSON.stringify(extra)); }
}

// ---------- telefone ----------
console.log("\ntelefone: formatos que aparecem");

const tel = (t) => C.acharTelefones(t).map(x => x.formatado);

checa("celular com DDD e mascara", tel("é (34) 99912-3456")[0] === "(34) 99912-3456");
checa("celular colado", tel("anota ai 34999123456")[0] === "(34) 99912-3456");
checa("celular sem DDD", tel("é 99912-3456")[0] === "99912-3456");
checa("fixo com DDD", tel("o fixo é (34) 3255-1516")[0] === "(34) 3255-1516");
checa("separado por ponto", tel("34.99912.3456")[0] === "(34) 99912-3456");
checa("com espacos como o cara dita", tel("34 9 9912 3456")[0] === "(34) 99912-3456");

console.log("\ntelefone: o ASR escrevendo por extenso");

checa("tudo por extenso",
  tel("meu whats é nove nove nove um dois tres quatro cinco seis")[0] === "99912-3456",
  tel("meu whats é nove nove nove um dois tres quatro cinco seis"));
checa("meia vale seis", C.digitalizar("meia").trim() === "6");
checa("misto de digito e extenso",
  tel("é 34 nove nove nove um dois tres quatro cinco seis")[0] === "(34) 99912-3456");

console.log("\ntelefone: o que NAO pode virar telefone");

checa("preco nao e telefone", tel("fica em 400 reais").length === 0, tel("fica em 400 reais"));
checa("horario nao e telefone", tel("ele chega as 14h").length === 0);
checa("celular invalido e recusado (11 digitos sem o 9)",
  C.telefoneValido("3412345678") === false || C.telefoneValido("34123456789") === false);
checa("nao duplica o mesmo numero",
  C.acharTelefones("é 34999123456, anota: 34999123456").length === 1);

// ---------- nomes ----------
console.log("\nnome: quem atendeu se identifica");

const nome = (t, q) => C.acharNomes(t, q || "cliente").map(x => x.papel + ":" + x.nome);

checa("meu nome é", nome("pois não, meu nome é Cristiane")[0] === "atendente:Cristiane");
checa("aqui é a", nome("aqui é a Débora, pois não")[0] === "atendente:Débora");
checa("pega nome composto", nome("meu nome é Ana Paula")[0] === "atendente:Ana Paula");

console.log("\nnome: apontando o dono");

checa("falar com",
  nome("você tem que falar com o Vicente").some(x => x === "dono:Vicente"),
  nome("você tem que falar com o Vicente"));
checa("quem decide é",
  nome("quem decide é a Andressa").some(x => x === "dono:Andressa"));
checa("o dono é",
  nome("o dono é o Marcelo").some(x => x === "dono:Marcelo"));

console.log("\nnome: falso positivo, que e o risco real");

checa("'é o site' nao vira nome", nome("é o site de vocês mesmo").length === 0, nome("é o site de vocês mesmo"));
checa("'é com o gerente' nao vira nome", nome("é com o gerente").length === 0, nome("é com o gerente"));
checa("'falar com ele' nao vira nome", nome("tem que falar com ele").length === 0, nome("tem que falar com ele"));
checa("palavra curta demais nao vira nome", C.limparNome("Jo") === null);
checa("nome do VENDEDOR nao e colhido como atendente",
  C.acharNomes("meu nome é Lucas, sou da UFU", "vendedor").length === 0);

// ---------- horario ----------
console.log("\nhorario");

checa("parte do dia", C.acharHorario("ele só vem de manhã").valor.indexOf("manh") === 0);
checa("depois das", C.acharHorario("liga depois das 14h").valor === "14h");
checa("ele chega", (C.acharHorario("ele chega umas 15h") || {}).valor === "15h",
  C.acharHorario("ele chega umas 15h"));
checa("dia da semana", C.acharHorario("ele só vem na segunda").valor === "segunda");
checa("fala sem horario devolve nada", C.acharHorario("pode mandar no whats") === null);

// ---------- acumular a ligacao inteira ----------
console.log("\nligacao inteira");

const LIGACAO = [
  ["vendedor", "Alô, boa tarde! Tudo bem? Aí é a Clínica Bem Estar?"],
  ["cliente", "É sim, pois não? Meu nome é Cristiane"],
  ["vendedor", "Prazer, Cristiane. Meu nome é Lucas, sou aluno da UFU"],
  ["vendedor", "Pra tratar disso é com você mesma ou com outra pessoa?"],
  ["cliente", "Ah, é com o Vicente, mas ele só vem de manhã"],
  ["vendedor", "Entendi. E esse número tem WhatsApp?"],
  ["cliente", "Tem sim, mas o dele é outro, é 34 nove nove nove um dois tres quatro cinco seis"],
];

let col = C.colheitaInicial();
LIGACAO.forEach(([quem, fala]) => { col = C.colher(col, quem, fala); });

const itens = C.paraConfirmar(col);
const campo = (c) => (itens.find(i => i.campo === c) || {}).valor;

checa("colheu quem atendeu", campo("Quem atendeu") === "Cristiane", itens);
checa("colheu o nome do dono", campo("Nome do dono") === "Vicente", itens);
checa("colheu o telefone ditado por extenso", campo("Telefone citado") === "(34) 99912-3456", itens);
checa("colheu o melhor horario", (campo("Melhor horário") || "").indexOf("manh") === 0, itens);
checa("nao colheu o nome do proprio vendedor",
  !itens.some(i => String(i.valor).indexOf("Lucas") > -1), itens);
checa("todo item vem com o trecho que o gerou",
  itens.every(i => i.trecho && i.trecho.length > 0), itens);
checa("nada nasce confirmado",
  col.telefones.concat(col.nomes).every(x => x.confirmado === false));

checa("colher nao muta o estado anterior", C.colheitaInicial().telefones.length === 0);

console.log(falhas ? "\n" + falhas + " FALHA(S)\n" : "\nTUDO OK\n");
process.exit(falhas ? 1 : 0);
