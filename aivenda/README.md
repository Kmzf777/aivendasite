# Copiloto de Call de Vendas

Uma página local que escuta sua call no Google Meet e, quando o cliente objeta,
mostra na hora um card grande com **o argumento que você escreveu**.

O [Jev](https://typesafe.ai) (modelo de decisão da TypeSafe) não escreve nada. Ele só
decide *qual* objeção é, em ~300 ms. O texto é todo seu.

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

### Medição real (2026-09-30, 20 falas)

| | |
|---|---|
| Gabarito | **18/20** |
| Latência média | **295 ms** |
| Custo das 20 decisões | **US$ 0,000883** |
| Falsos positivos | **0** |

Os 2 erros foram falsos negativos no `tem_objecao`: *"Vou levar pra minha esposa"*
(0,43) e *"Me manda por email que eu analiso depois"* (0,28). Nos dois casos o
classificador de objeção acertou com confiança 1,00 — quem barrou foi o limiar.

Neste conjunto a separação foi limpa: objeções reais entre **0,43 e 0,98**, falas
neutras entre **0,02 e 0,14**, nada no meio. O `limiarObjecao` de 0,6 está acima da
lacuna, então ele troca essas duas recusas suaves por uma margem larga contra falso
positivo. Baixar para ~0,35 teria dado 20/20 aqui. Decisão sua.

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
                                                                    ▼    ~300 ms
   tem_objecao >= 0.6  E  confiança >= 0.5   ──────────────►  CARD com seu argumento
   terminou_de_falar < 0.5                   ──────────────►  espera o resto da frase
   objeção fora do catálogo                  ──────────────►  alerta neutro
   mesma objeção do card anterior            ──────────────►  ignora
```

Uma chamada, quatro perguntas em paralelo: `tem_objecao` (noul), `objecao` (choice
entre as suas), `fase` (choice) e `terminou_de_falar` (noul).

Numa pausa curta ele já pergunta com o texto parcial; se chegar fala mais nova, a
resposta da chamada antiga é descartada por número de sequência.

### A API

`POST https://api.typesafe.ai/v1/systemone`, modelo fixado em `jev-1.13.0`. Não é o
endpoint de chat e não é o OpenRouter — o slug `typesafe/jev-1.13` é formato OpenRouter
e não funciona aqui.

Um `noul` devolve só `noul` (probabilidade 0..1, sem campo `confidence`). Um `choice`
devolve `choice` + `confidence` + `probabilities`.

## Custo

`usdPorMilhaoInput` é **US$ 0,042 por 1M tokens de entrada** (saída gratuita). Essa
tarifa **não está na documentação oficial da TypeSafe** — vem de duas fontes de
terceiros que concordam. Por isso o rodapé diz "custo estimado".

Na prática: US$ 0,000044 por decisão medido. Uma call de uma hora custa centavos.

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
