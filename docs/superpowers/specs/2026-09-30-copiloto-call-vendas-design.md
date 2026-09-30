# Copiloto de Call de Vendas — Design (v1 "o básico")

Data: 2026-09-30
Pasta: `aivenda/`

## 1. Objetivo

Uma página local que escuta uma call de vendas no Google Meet e, quando o cliente
solta uma objeção, mostra na hora um card grande **"Quebrar objeção: <nome>"** com o
argumento escrito pelo vendedor.

O Jev **não escreve nada**. Ele só decide *qual* objeção é. Todo o texto de argumento
é do vendedor, guardado no navegador.

Sucesso = numa call real, o card certo aparece em menos de 1 segundo depois da fala do
cliente, sem card falso e sem card repetido.

## 2. Contrato da API (verificado ao vivo em 2026-09-30, 4 chamadas reais)

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json
```

**Não é** o endpoint de chat e **não é** o OpenRouter. O slug `typesafe/jev-1.13` é
formato OpenRouter e não funciona na API direta.

Request:

```json
{ "model": "jev-1.13.0", "state": { }, "questions": { } }
```

Response real medida:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "is_objecting":      { "type": "noul",   "noul": 0.96 },
    "objection":         { "type": "choice", "choice": "tried_before", "confidence": 1.0,
                           "probabilities": { "tried_before": 1.0, "need_partner": 0.0, "none": 0.0 } },
    "phase":             { "type": "choice", "choice": "objection", "confidence": 0.97,
                           "probabilities": { "objection": 0.98, "pain_discovery": 0.01 } },
    "finished_speaking": { "type": "noul",   "noul": 0.86 }
  },
  "usage": { "input_tokens": 676, "output_tokens": 150 }
}
```

Fatos que o código não pode errar:

- **`noul` devolve só `noul`** (uma probabilidade 0..1). **Não tem campo `confidence`.**
- **`choice` devolve `choice` + `confidence` + `probabilities`.**
- `usage` tem só `input_tokens` / `output_tokens`. **Não existe campo de custo** —
  o custo é calculado no cliente.
- Latência medida daqui: **345–382 ms** para o corpo exato de 4 perguntas.
- `state` aceita objeto aninhado. O modelo respeita a semântica de "última fala".
- Modelo fixado em `jev-1.13.0` (não `jev-latest`): num sistema de decisão calibrado,
  a calibragem não deve mudar sozinha embaixo da aplicação.

## 3. Arquivos

| Arquivo | Papel |
|---|---|
| `server.js` | Node puro, **zero dependências**. Serve `index.html` e faz proxy de `POST /jev` para a TypeSafe. Parser de `.env` próprio (~10 linhas). |
| `index.html` | A página inteira: HTML + CSS + JS inline. Duas abas: "Call" e "Minhas objeções". |
| `teste.js` | Manda 20 falas de cliente para o Jev e imprime decisão, latência e custo de cada uma. Roda sem browser. |
| `README.md` | Como rodar em 3 passos. |
| `.env.example` | `TYPESAFE_API_KEY=` vazio. |
| `.gitignore` | `.env` |

A chave **nunca** chega ao navegador. O browser só conhece `POST /jev`.

## 4. Ouvido — duas trilhas simultâneas

Duas instâncias de `SpeechRecognition`, ambas `lang = "pt-BR"`, `continuous = true`,
`interimResults = true`:

- **A — Você:** `recognition.start()` sem argumento, microfone padrão.
- **B — Cliente:** `recognition.start(audioTrack)` onde `audioTrack` vem de
  `getDisplayMedia({ video: true, audio: true })`, o usuário escolhe a aba do Meet e
  marca "compartilhar áudio da aba".

### 4.1 Risco: o argumento `audioTrack` é ignorado em silêncio

`recognition.start(audioTrack)` só existe no Chrome 139+. Onde não existe, o argumento
é **ignorado silenciosamente** e a instância B passa a ouvir o microfone — a coluna
"Cliente" viraria um espelho secreto da coluna "Você", e o vendedor não perceberia.

**Detecção obrigatória antes de começar:** criar uma track, pará-la (`readyState`
passa a `"ended"`) e chamar `start(trackMorta)`.

- Lançou `InvalidStateError` → a implementação valida a track → **suporta** o parâmetro.
- Não lançou → o argumento foi ignorado → **não suporta**. Aborta na hora e mostra um
  aviso vermelho pedindo Chrome 139+, em vez de rodar mentindo.

### 4.2 Risco: a sessão morre

O Chrome encerra a sessão sozinho depois de silêncio, e a spec da Web Speech manda
abortar quando a página perde foco — e o vendedor vai estar olhando o Meet, não o
copiloto. Na prática o Chrome desktop continua reconhecendo em janela de fundo.

**Mitigação:** em `onend` e em `onerror` (exceto `not-allowed`), reiniciar a mesma
trilha automaticamente, com um flag `ouvindo` para não reiniciar depois do Stop
manual. Um indicador por coluna mostra se a trilha está viva.

### 4.3 Eco de caixa de som

**Só o canal Cliente (B) dispara decisão.** O canal do microfone é puramente visual.
Se o áudio do cliente vazar da caixa de som para o microfone, no pior caso a coluna
"Você" fica suja — **nunca** dispara um card falso. README pede fone de ouvido.

## 5. Decisão — uma chamada, quatro perguntas em paralelo

`state` (português, é o contexto da conversa):

```json
{
  "conversa": [ { "quem": "vendedor", "fala": "..." } ],
  "ultima_fala_do_cliente": "..."
}
```

`conversa` = as últimas 8 falas (`CONFIG.historicoFalas`).

`questions` (inglês, é onde o Jev acerta mais):

- `tem_objecao` — **noul** — `"Is the customer raising an objection, concern or pushing back on the offer in their last utterance?"`
- `objecao` — **choice** — `"Which of these objections best matches the customer's last utterance?"` — `criteria` montado a partir do catálogo do vendedor: `{ <id>: <campo "como soa">, "nenhuma": "The customer is not raising any of these objections" }`
- `fase` — **choice** — `"Which phase is this sales call currently in?"` — `criteria`: `abertura`, `diagnostico_dor`, `apresentacao`, `objecao`, `fechamento`
- `terminou_de_falar` — **noul** — `"Is the customer's last utterance a complete thought, or was it cut off mid-sentence?"`

Os `criteria` da objeção vêm em português porque é o campo que o vendedor escreve e
lê. O `instructions` é inglês. Essa mistura é intencional.

## 6. Regras no código

1. Mostra o card se `tem_objecao.noul >= 0.6` **E** `objecao.confidence >= 0.5`
   **E** `objecao.choice !== "nenhuma"`.
2. Se `terminou_de_falar.noul < 0.5`, a frase está cortada: guarda e espera o resto,
   não mostra card.
3. Não repete o mesmo card seguido: se `objecao.choice` é igual à última objeção
   mostrada, ignora.
4. **Pausa curta com texto parcial:** depois de `CONFIG.pausaParcialMs` = 700 ms sem
   novo resultado, dispara a chamada já com o texto parcial. Cada chamada leva um
   `seq` crescente; quando a resposta volta, se `seq < seqAtual` a resposta é
   **descartada** (chegou fala mais nova). O descarte é por número de sequência, que é
   o que garante ordem.
5. `tem_objecao` alto mas fora do catálogo (`nenhuma` ou `confidence < 0.5`):
   **card de alerta neutro** — menor, sem argumento, "Objeção detectada — não
   catalogada" mais a fala do cliente.
6. A `fase` atualiza a barra do topo sempre que `fase.confidence >= 0.5`.

## 7. Tela

Uma página, duas abas.

**Aba Call:**
- Barra de fase no topo: 5 etapas, a atual acesa.
- Botão grande **"Começar a ouvir"** (vira "Parar" quando ativo).
- Duas colunas finas: **Você** e **Cliente**, transcrição ao vivo, parcial em itálico
  esmaecido, auto-scroll.
- Centro: o card. `Quebrar objeção: <nome>`, o argumento em corpo grande e legível de
  longe, a confiança e o tempo da decisão em ms.
- Histórico discreto das objeções anteriores da call.
- Rodapé: latência média, número de decisões, custo acumulado.

Clean e com contraste alto — a tela vai ser gravada. Card entra com transição curta,
nada de animação chamativa.

**Aba Minhas objeções:** adicionar, editar, remover. Campos: **nome**, **como soa**
(vai para o `criteria` do Jev), **argumento** (o que aparece no card). Salva em
`localStorage`. Já vem com 7 exemplos para quem vende agente de IA para pequena
empresa: tá caro, será que funciona pra mim, não é o momento, preciso falar com meu
sócio, já tentei e não deu certo, vou pensar, não confio.

## 8. Custo

Tarifa: **US$ 0,042 por 1M tokens de entrada, saída gratuita**.

Essa tarifa **não foi encontrada na documentação oficial da TypeSafe** — vem de duas
fontes de terceiros independentes que concordam. Fica como constante em
`CONFIG.usdPorMilhaoInput`, marcada como estimativa na própria tela (rodapé mostra
"custo estimado"). Corrigir num lugar só quando a tarifa oficial aparecer.

## 9. Bloco CONFIG

Todos os botões de ajuste num só lugar no topo do JS, porque afinar o Jev depois tem
que ser mudança de uma linha, não refatoração:

`modelo`, `limiarObjecao` (0.6), `limiarConfianca` (0.5), `limiarTerminou` (0.5),
`limiarFase` (0.5), `pausaParcialMs` (700), `historicoFalas` (8),
`usdPorMilhaoInput` (0.042), e os 4 textos de `instructions` em inglês.

## 10. teste.js

20 falas de cliente cobrindo as 7 objeções, falas sem objeção e uma frase cortada.
Para cada uma imprime: fala, `tem_objecao`, objeção escolhida, confiança, se passou na
regra, latência em ms e custo. No fim: latência média e custo total. Serve para afinar
os thresholds sem precisar de call real.

## 11. Fora de escopo do v1

Afinar o texto das perguntas com call real. Ajustar thresholds com dados. Gravar a
call. Exportar histórico. Qualquer coisa multiusuário ou em nuvem.
