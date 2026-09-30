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
