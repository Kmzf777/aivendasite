# Copiloto de Call de Vendas

Escuta uma conversa de vendas e, quando o cliente levanta uma objeção, mostra na hora um card
grande com **o argumento que você escreveu**.

O [Jev](https://typesafe.ai) (modelo de decisão da TypeSafe) **não escreve nada**. Ele só decide
*qual* objeção é, em ~300 ms. O texto do argumento é seu.

Roda local: Node puro, sem nenhuma dependência npm, mais HTML/JS vanilla.

## Rodar em 3 passos

```bash
cp .env.example .env     # 1. cole a chave da TypeSafe dentro
node server.js           # 2. sobe o servidor
                         # 3. abra http://localhost:3000
```

Sem `npm install`. O servidor serve o painel, faz o proxy da chave, guarda o catálogo de objeções
e reparte os eventos por SSE.

## Três ouvidos, um cérebro

Há três formas de escutar a conversa. Todas alimentam a **mesma** camada de decisão
(`lib/decisao.js`) e o **mesmo** painel. Escolher um ouvido é escolher como o falante é
identificado — nada além disso muda.

| Ouvido | Para que serve | Como identifica quem falou | Custo/hardware |
|---|---|---|---|
| Extensão + legendas do Meet | reunião agendada no Google Meet | o Meet já entrega o nome de quem falou | nenhum |
| `coldcall.html` push-to-talk | cold call, viva-voz, presencial, qualquer fonte | você declara com a tecla ESPAÇO | nenhum |
| `coldcall.html` duas entradas | cold call com o celular ligado por cabo | mede a energia de cada canal | ~R$ 60 (placa USB) |

### 1. Extensão do Chrome, lendo as legendas do Meet

Para reunião agendada. A extensão (`extensao/`) lê as legendas do próprio Google Meet direto do
DOM — elas já vêm com o nome de quem falou, então a separação de falante deixa de ser problema e
passa a ser dado de entrada. Sem microfone, sem compartilhar aba, sem eco.

Para ligar: `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → selecione
a pasta `aivenda/extensao`. O servidor precisa estar rodando. O overlay aparece sozinho na aba do
Meet e as legendas são ligadas automaticamente.

> **Ainda não foi testada numa call real.** O caminho foi verificado peça por peça, mas nunca
> rodou de ponta a ponta com uma reunião de verdade.

Se parar de capturar, as legendas são lidas por `jsname`, que o Google muda sem avisar. Na aba do
Meet, DevTools → Console: `diagnostico()`. Se `camada` não for `"jsname"`, os seletores mudaram —
ligue o CC, inspecione o texto da legenda, suba na árvore e atualize `SEL` no topo de
`extensao/content.js`. O `diagnostico()` também mostra `meuNome` (a separação vendedor/cliente
depende dele), `linhasVistas` e se achou o botão CC. Para ver as legendas chegando ao vivo, ponha
`DEBUG = true` no topo do `content.js`.

### 2. `coldcall.html`, modo push-to-talk

Para cold call, viva-voz, presencial, qualquer fonte de áudio. Uma entrada de áudio só: você
**segura ESPAÇO** enquanto fala, e solto é o cliente. O rótulo não é inferido, é declarado. Zero
hardware, zero custo.

Para ligar: abra `http://localhost:3000/coldcall.html`, escolha o microfone, clique em "Começar a
ouvir". O modo push-to-talk já vem selecionado.

Duas coisas que o modo exige:

- **A janela precisa estar em foco** para receber a tecla. Perder o foco com a tecla presa
  deixaria tudo rotulado como você, então o `blur` solta a tecla.
- **Disciplina.** Esquecer de segurar rotula sua fala como se fosse do cliente.

### 3. `coldcall.html`, modo duas entradas

Microfone e cabo do celular em **dispositivos separados** — em geral uma placa de som USB com
entrada de linha, saída de fone do celular para a entrada da placa. Como os dois canais estão
fisicamente isolados, saber quem falou é medição e não estimativa: compara-se o nível *relativo*
entre os canais, o que aguenta vazamento (a voz do cliente que escapa para o seu microfone chega
muito mais fraca no canal dele).

Para ligar: abra `http://localhost:3000/coldcall.html`, clique em "Duas entradas", escolha os dois
dispositivos (precisam ser diferentes) e use "Testar níveis" antes de começar — falando você, só a
barra azul deve subir; falando o cliente, só a laranja. Escute pelo fone do celular, não pela caixa
do notebook: som na caixa volta para o microfone e suja a coluna "Você".

O `calibrar.html` mede, antes da primeira call, se o seu equipamento separa as duas vozes só pelo
som. Ele grava 10 segundos de cada voz e mostra o espectro médio das duas e a separação quadro a
quadro.

## O que ainda não foi verificado

Vale ler antes de confiar em qualquer número daqui:

- **A extensão do Meet nunca rodou numa call real.**
- **Nenhuma voz humana passou pelo `coldcall.html` de ponta a ponta.** As medições de acerto foram
  feitas com texto limpo, digitado, sem reconhecimento de fala no caminho. Em viva-voz o ASR vai
  cortar e fundir falas, e isso ainda não foi exercitado.
- A camada de decisão e a de atribuição de falante têm teste offline e passam. Isso mede a regra,
  não a call.

## Por que o desenho é esse

Quatro fatos medidos explicam quase todas as escolhas do projeto.

**O Chrome só permite UM `SpeechRecognition` ativo por vez, no processo inteiro.** Iniciar o
segundo aborta o primeiro em ~2 ms — inclusive de dentro de um `<iframe>` mesmo-origem:

```
   0ms  A start()-ok
   1ms  A start
 208ms  A audiostart
1475ms  B start()-ok
1477ms  A ERROR aborted   <- iniciar B matou A
1480ms  B start
```

Foi isso que matou a primeira arquitetura, que tentava transcrever duas trilhas simultâneas (seu
microfone e o áudio da aba). As duas se matavam em loop. Por isso hoje o áudio é misturado num
stream só, com **um** reconhecedor, e o falante é rotulado por outro sinal: a tecla ou a energia
dos canais.

**O reconhecedor não liga e desliga com a tecla.** De `start` a `audiostart` levam ~208 ms;
reiniciar a cada toque comeria o início de cada frase. Ele roda contínuo e a tecla só rotula, pela
janela de tempo em que a frase aconteceu.

**A chamada ao Jev sai do service worker, não do content script.** O content script roda em
`https://meet.google.com`, e chamar `http://localhost` de lá é mixed content: o Chrome bloqueia
**em silêncio** e o fetch pendura até dar timeout.

**O áudio é pedido cru** — `echoCancellation`, `noiseSuppression` e `autoGainControl` desligados.
O AGC normalizaria os níveis e destruiria a comparação de energia entre canais, que é o que
sustenta o modo de duas entradas.

## A regra de decisão

Uma chamada ao Jev, quatro perguntas em paralelo: `tem_objecao` (noul), `objecao` (choice entre as
suas), `fase` (choice) e `terminou_de_falar` (noul). As perguntas vão em **inglês** (é onde o Jev
acerta mais) e a conversa vai em **português**. Isso é de propósito.

A regra é uma função pura em `lib/decisao.js`, avaliada nesta ordem:

```
terminou_de_falar < 0.5                     ->  espera o resto da frase
tem_objecao >= 0.6  E  confiança >= 0.5     ->  card com o seu argumento
confiança >= 0.95, sozinha                  ->  card com o seu argumento
objeção detectada, fora do catálogo         ->  alerta neutro
mesma objeção do card anterior              ->  ignora
```

A **frase cortada é checada primeiro**, tenha ou não objeção aparente: o texto ainda vai mudar, e
decidir agora é decidir sobre um pedaço. A barra de fase continua atualizando nesse caso.

A **segunda porta** (confiança de 0,95 sozinha) existe para quando o cliente não está objetando e
sim *respondendo* — "é o Vicente", "uso mais o Instagram". Ali o `tem_objecao` fica baixo de
propósito, e é correto que fique: não é objeção, é resposta. Só a confiança da escolha sustenta o
card. O corte é apertado porque a margem é pequena: "pode mandar no WhatsApp" casa com `vou_pensar`
a 0,90 e **não pode** disparar — é sinal de compra, e mostrar um card de "vou pensar" ali faria o
vendedor tratar um sim como hesitação. O histórico dessa mudança está em `medicao/RESULTADOS.md` e
em `contrato/patches/0001-portao-por-uniao.md`.

## O ajuste

Tudo num bloco `CONFIG` no topo de `lib/decisao.js`. Afinar o Jev é mudar um número ali.

| | padrão | o que faz |
|---|---|---|
| `modelo` | `jev-1.13.0` | versão fixada, não `jev-latest` |
| `limiarObjecao` | `0.6` | quão certo o Jev precisa estar de que houve objeção |
| `limiarConfianca` | `0.5` | quão certo precisa estar de *qual* objeção |
| `limiarConfiancaSozinha` | `0.95` | confiança que dispensa o `tem_objecao` |
| `limiarTerminou` | `0.5` | abaixo disso a frase está cortada e ele espera |
| `limiarFase` | `0.5` | confiança mínima para mover a barra de fase |
| `historicoFalas` | `8` | quantas falas vão de contexto |
| `usdPorMilhaoInput` | `0.042` | tarifa usada no custo estimado do rodapé |

O modelo é **fixado em `jev-1.13.0`**, não `jev-latest`: num sistema de decisão calibrado, a
calibragem não deve mudar sozinha embaixo da aplicação.

Depois de mudar: `cp lib/decisao.js extensao/lib/` e recarregue a extensão. O `lib/` é duplicado em
`extensao/lib/` porque uma extensão MV3 não pode carregar script de fora do próprio pacote. A fonte
de verdade é o `lib/` da raiz.

## As suítes de teste

```bash
node teste-decisao.js    # a regra, offline, sem gastar API
node teste-atribuir.js   # quem falou (tecla e energia), offline
node teste-servidor.js   # SSE e catálogo (precisa do server.js rodando)
node teste.js            # 20 falas contra o Jev real, com gabarito
```

As três primeiras não tocam a rede. A `teste.js` gasta API, e é a única que mede o Jev de verdade.

### Medição do `teste.js` (2026-09-30, 20 falas)

| | |
|---|---|
| Gabarito | **20/20** |
| Falsos positivos | **0** |
| Latência média | **295 ms** (uma reexecução hoje deu 305 ms) |
| Custo das 20 decisões | **US$ 0,000883** |

No navegador, ponta a ponta, a latência observada foi de **338 a 515 ms**.

Com o portão antigo — só `tem_objecao >= 0.6` **e** confiança `>= 0.5`, sem a segunda porta — o
mesmo conjunto dava **18/20**. Os dois erros eram falsos negativos no `tem_objecao`: *"Vou levar
pra minha esposa"* (0,41) e *"Me manda por email que eu analiso depois"* (0,28). Nos dois o
classificador de objeção acertou com confiança **1,00** — quem barrava era o limiar. Com a segunda
porta, as duas passam.

A distribuição do `tem_objecao` neste conjunto: 13 das 15 objeções ficaram entre **0,66 e 0,98**,
as quatro falas neutras entre **0,02 e 0,14**, e as duas exceções acima (0,41 e 0,28) caíram no vão
entre os dois grupos. Foi justamente esse vão que motivou a segunda porta, em vez de baixar o
`limiarObjecao` e perder a margem contra falso positivo.

Há uma medição maior e mais recente em `medicao/RESULTADOS.md`: 44 falas, 20 delas transcritas de
ligações reais gravadas, contra um catálogo de 16 objeções. Ela usa outro conjunto e outro método;
não é comparável linha a linha com a tabela acima.

## O catálogo de objeções

Mora em `objecoes.json` **no servidor**, não no navegador. Assim a extensão e o painel enxergam a
mesma lista, e ela sobrevive a troca de perfil do Chrome. Edite na aba **Minhas objeções** do
painel. Na primeira execução o arquivo é semeado com as 7 objeções de `lib/objecoes-exemplo.js`.

Três campos:

| Campo | Para quê |
|---|---|
| **Nome** | O título do card. |
| **Como soa** | A descrição que o Jev usa para casar a fala do cliente. Escreva como a objeção soa *na boca do cliente*, não o nome dela. É o campo que mais afeta o acerto. |
| **Argumento** | O que aparece em letra grande para você ler. É seu. |

A camada de decisão usa só o `id` e o `comoSoa` para montar a pergunta; o `nome` e o `argumento`
são o que vai para a tela. Campos extras que existam no arquivo são preservados na edição e
ignorados pela decisão.

## Custo

A API **não devolve custo**, só tokens. O custo é calculado no cliente, a **US$ 0,042 por 1M
tokens de entrada** (saída gratuita). Essa tarifa **não está na documentação oficial da TypeSafe** —
vem de duas fontes de terceiros que concordam. Por isso a tela diz "custo estimado".

Medido: **US$ 0,000044 por decisão**.

## A chave

Fica só no `.env`, que está no `.gitignore`. Nem o navegador nem a extensão a veem: tudo passa por
`POST /jev` e o `server.js` injeta a chave. O servidor recusa servir o `.env` por HTTP, mesmo que
peçam.

Não exponha esta porta para a internet — **não há autenticação nenhuma**. É para `localhost`.

## Arquivos

| | |
|---|---|
| `server.js` | proxy do Jev, barramento SSE, catálogo, estáticos. Node puro. |
| `index.html` | o painel: transcrição, card, fase, catálogo. Só exibe, não decide. |
| `coldcall.html` | cold call: push-to-talk e duas entradas, com card próprio. |
| `calibrar.html` | mede se o seu equipamento separa as duas vozes só pelo som. |
| `lib/decisao.js` | `CONFIG`, as 4 perguntas e a regra, em funções puras. |
| `lib/atribuir.js` | quem falou: por tecla (`quemFalouPorTecla`) e por energia (`quemFalou`). |
| `lib/objecoes-exemplo.js` | as 7 objeções que semeiam o `objecoes.json`. |
| `objecoes.json` | o catálogo em uso. Gerado no primeiro boot, fora do git. |
| `extensao/content.js` | lê as legendas do Meet, separa falante, injeta o overlay. |
| `extensao/background.js` | service worker: chama o Jev e distribui a decisão. |
| `extensao/opcoes.html` | estado da conexão e atalho para o painel. |
| `extensao/lib/` | cópia de `lib/decisao.js` e `lib/objecoes-exemplo.js` (MV3 não empacota de fora). |
| `teste*.js` | as quatro suítes. |
| `medicao/` | scripts e resultados das medições contra o Jev. |
| `decisoes/`, `contrato/`, `docs/`, `pesquisa/` | decisões travadas, patches, especificações, pesquisa. |

Os bancos de conteúdo `fases.json`, `nudges.json` e `fallback.json` estão na pasta mas **ainda não
são lidos por nenhum código** — são material escrito, não comportamento ligado.

## Endpoints do servidor

| | |
|---|---|
| `POST /jev` | repassa para a TypeSafe injetando a chave |
| `POST /evento` | publica uma fala ou decisão no barramento |
| `GET /eventos` | SSE: o painel escuta aqui |
| `GET /objecoes` | o catálogo |
| `PUT /objecoes` | grava o catálogo e avisa todo mundo por SSE |
