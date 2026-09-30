# Copiloto de Call de Vendas

Uma extensão que escuta sua call no Google Meet e, quando o cliente objeta, mostra na
hora um card grande com **o argumento que você escreveu**.

O [Jev](https://typesafe.ai) (modelo de decisão da TypeSafe) não escreve nada. Ele só
decide *qual* objeção é, em ~300 ms. O texto é todo seu.

## Rodar em 3 passos

```bash
# 1. sua chave da TypeSafe
cp .env.example .env     # e cole a chave dentro

# 2. sobe o servidor
node server.js

# 3. carrega a extensão
#    chrome://extensions -> Modo do desenvolvedor -> Carregar sem compactação
#    -> selecione a pasta  aivenda/extensao
```

Sem `npm install`: zero dependências.

Agora é só entrar numa call do Meet. O overlay aparece sozinho no canto e as legendas
do Meet são ligadas automaticamente. O painel completo fica em `http://localhost:3000`.

## Por que extensão, e não uma página

A primeira versão tentava transcrever dois canais com a Web Speech API: seu microfone
e o áudio da aba. **Isso é impossível no Chrome.** Medido:

```
   0ms  A start()-ok
   1ms  A start
 208ms  A audiostart
1475ms  B start()-ok
1477ms  A ERROR aborted   <- iniciar B matou A
1480ms  B start
```

O Chrome permite **um** `SpeechRecognition` ativo por vez, no processo inteiro —
inclusive de dentro de um `<iframe>`. As duas trilhas se matavam em loop, e como a
caixa de som devolve a voz do cliente para o microfone, tudo caía na coluna "Você".

A solução é a que Tactiq, Recall.ai e as extensões open source usam: **ler as legendas
do próprio Meet**, que já vêm com o nome de quem falou. A separação de falante deixa de
ser um problema a resolver e passa a ser um dado de entrada.

De quebra: sem microfone, sem compartilhar aba, sem eco, sem pedir permissão nenhuma.

## Como funciona

```
aba do Meet
 │
 ├─ content.js ── liga as legendas, observa o DOM, separa falante
 │                 por data-self-name, injeta o overlay
 │                 │
 │                 └── chrome.runtime.sendMessage ──┐
 │                                                   ▼
 └────────────────────────────── background.js (service worker)
                                  monta state + 4 perguntas
                                  POST localhost:3000/jev   (~300 ms)
                                       │
                    ┌──────────────────┘
                    ▼
            server.js ── proxy do Jev (a chave fica aqui)
                      ── barramento de eventos (SSE)
                      ── catálogo de objeções
                    │
                    └── GET /eventos ──► painel em localhost:3000
```

Uma chamada, quatro perguntas em paralelo: `tem_objecao` (noul), `objecao` (choice
entre as suas), `fase` (choice) e `terminou_de_falar` (noul).

**A chamada sai do service worker, não do content script.** O content script roda em
`https://meet.google.com`, e chamar `http://localhost` de lá é mixed content — o Chrome
bloqueia **em silêncio** e o fetch pendura até dar timeout.

### A regra

```
tem_objecao >= 0.6  E  confiança >= 0.5   ──►  card com o seu argumento
terminou_de_falar < 0.5                   ──►  espera o resto da frase
objeção fora do catálogo                  ──►  alerta neutro
mesma objeção do card anterior            ──►  ignora
```

## Suas objeções

Aba **Minhas objeções** no painel. Três campos:

| Campo | Para quê |
|---|---|
| **Nome** | O título do card. |
| **Como soa** | A descrição que o Jev usa para casar a fala do cliente. Escreva como a objeção soa *na boca do cliente*, não o nome dela. É o campo que mais afeta o acerto. |
| **Argumento** | O que aparece em letra grande para você ler. É seu. |

O catálogo mora em `objecoes.json` no servidor — não no navegador. Assim o overlay e o
painel enxergam a mesma lista, e ela sobrevive a troca de perfil do Chrome.

## Afinar sem call real

```bash
node teste.js           # 20 falas contra o Jev real, com gabarito
node teste-decisao.js   # 36 testes da regra, offline, sem gastar API
node teste-servidor.js  # SSE e catálogo
```

### Medição real (2026-09-30, 20 falas)

| | |
|---|---|
| Gabarito | **18/20** |
| Latência média | **295 ms** |
| Custo das 20 decisões | **US$ 0,000883** |
| Falsos positivos | **0** |

Os 2 erros foram falsos negativos no `tem_objecao`: *"Vou levar pra minha esposa"*
(0,43) e *"Me manda por email que eu analiso depois"* (0,28). Nos dois o classificador
de objeção acertou com confiança 1,00 — quem barrou foi o limiar.

Neste conjunto a separação foi limpa: objeções reais entre **0,43 e 0,98**, falas
neutras entre **0,02 e 0,14**, nada no meio. O `limiarObjecao` de 0,6 está acima da
lacuna, trocando essas duas recusas suaves por margem contra falso positivo. Baixar
para ~0,35 daria 20/20 aqui. Decisão sua.

## Ajustes

Tudo num só bloco `CONFIG` no topo de `lib/decisao.js`:

| | padrão | o que faz |
|---|---|---|
| `limiarObjecao` | `0.6` | quão certo o Jev precisa estar de que houve objeção |
| `limiarConfianca` | `0.5` | quão certo precisa estar de *qual* objeção |
| `limiarTerminou` | `0.5` | abaixo disso a frase está cortada e ele espera |
| `historicoFalas` | `8` | quantas falas vão de contexto |
| `usdPorMilhaoInput` | `0.042` | tarifa para o custo do rodapé |

Depois de mudar: `cp lib/decisao.js extensao/lib/` e recarregue a extensão.

As perguntas vão para o Jev **em inglês** (é onde ele acerta mais) e a conversa vai
**em português**. Isso é de propósito.

## Quando quebrar

As legendas do Meet são lidas por `jsname`, que o Google muda sem avisar. Há três
camadas de fallback, mas se parar de capturar:

1. Na aba do Meet, DevTools → Console:  `diagnostico()`
2. Se `camada` não for `"jsname"`, os seletores mudaram.
3. Ligue o CC, inspecione o texto da legenda no DevTools, suba na árvore e anote os
   novos `jsname`. Atualize `SEL` no topo de `extensao/content.js`.

`diagnostico()` também mostra `meuNome` (a separação vendedor/cliente depende dele),
`linhasVistas` e se achou o botão CC.

Para ver as legendas chegando ao vivo, ponha `DEBUG = true` no topo do `content.js`.

## Custo

`usdPorMilhaoInput` é **US$ 0,042 por 1M tokens de entrada** (saída gratuita). Essa
tarifa **não está na documentação oficial da TypeSafe** — vem de duas fontes de
terceiros que concordam. Por isso o rodapé diz "custo estimado".

Medido: **US$ 0,000044 por decisão**. Uma call de uma hora custa centavos.

## A chave

Fica só no `.env`, que está no `.gitignore`. Nem o navegador nem a extensão a veem: a
extensão chama `POST /jev` e o `server.js` injeta a chave. O servidor também recusa
servir o `.env` por HTTP.

Não exponha esta porta para a internet — não há autenticação nenhuma, é para
`localhost`.

## Arquivos

| | |
|---|---|
| `server.js` | proxy do Jev + SSE + catálogo. Node puro. |
| `index.html` | o painel. Só exibe, não decide. |
| `lib/decisao.js` | `CONFIG` + a regra, em funções puras |
| `lib/objecoes-exemplo.js` | as 7 objeções de exemplo |
| `extensao/content.js` | lê as legendas do Meet, separa falante, injeta o overlay |
| `extensao/background.js` | service worker: chama o Jev e distribui |
| `extensao/opcoes.html` | estado da conexão e atalho para o painel |
| `teste*.js` | as três suítes |

O `lib/` é duplicado em `extensao/lib/` porque uma extensão MV3 não pode carregar
script de fora do próprio pacote. A fonte de verdade é o `lib/` da raiz.
