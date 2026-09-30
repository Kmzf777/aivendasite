# Copiloto de Call — Design v2 (extensão Chrome, legendas do Meet)

Data: 2026-09-30
Substitui: `2026-09-30-copiloto-call-vendas-design.md` (v1, Web Speech API)

## 1. Por que a v1 morreu

A v1 mandava duas instâncias de `SpeechRecognition` rodarem ao mesmo tempo — uma no
microfone, outra no áudio da aba. **Isso é impossível no Chrome.** Medido:

```
   0ms  A start()-ok
   1ms  A start
 208ms  A audiostart
1475ms  B start()-ok
1477ms  A ERROR aborted   <- iniciar B matou A
1477ms  A end
1480ms  B start
```

O Chrome permite **um** reconhecedor ativo por vez, no processo inteiro. Testado
também com a segunda instância dentro de um `<iframe>` mesmo-origem: mesmo aborto.
Não é limite por documento, é global.

Na v1 isso virava uma guerra de reinícios: a trilha do cliente matava a do microfone,
o `onend` ressuscitava a do microfone 250 ms depois, que matava a do cliente, e assim
para sempre. Quem estivesse vivo no momento capturava o áudio — e como a caixa de som
devolve a voz do cliente para o microfone, tudo caía na coluna "Você". Exatamente o
sintoma relatado.

O que **não** era o problema: `start(audioTrack)` funciona. Verificado com uma track
viva de oscilador — `start(track)` aceito, `audiostart` disparado, `no-speech` depois
de 8 s de som sem fala, e nenhum resultado vindo do microfone da sala. O roteamento da
track é correto. O que não existe é o paralelismo.

O guard `suportaAudioTrack()` da v1 testava a coisa errada: confirmava que o
*parâmetro* é validado (e é), mas o parâmetro nunca foi a restrição.

## 2. A arquitetura que os produtos reais usam

Tactiq, Recall.ai e as extensões open source **não usam a Web Speech API**. Elas leem
**as legendas do próprio Google Meet** do DOM, por content script de extensão.

A separação de falante vem pronta do Meet. É a peça que a v1 não conseguia produzir.

Ganhos sobre a v1: sem microfone, sem compartilhar aba, sem eco, sem limite de
reconhecedor, ASR do Google em pt-BR, custo zero.

Custos honestos, registrados pelas duas fontes:

- **Seletores quebram** quando o Meet muda o frontend. É manutenção recorrente.
- **Texto é "lossy"**: a legenda parafraseia, corta frase longa e come pontuação.
  Para transcrição literal seria ruim; para classificar objeção é irrelevante.
- **Legenda precisa estar ligada.** Dá para clicar sozinho, mas pode falhar calado.
- Uma língua de legenda por vez. pt-BR, sem problema.

## 3. O que sobrevive da v1

Toda a camada de decisão, intacta, porque foi escrita como funções puras:

| Arquivo | Estado |
|---|---|
| `lib/decisao.js` — CONFIG, `montarPerguntas`, `montarState`, `aplicarRegra`, `calcularCusto` | **intacto** |
| `lib/objecoes-exemplo.js` | **intacto** |
| `server.js` — proxy `/jev` | **estendido** (eventos + catálogo) |
| `teste.js`, `teste-decisao.js` (36 testes) | **intactos** |
| `audio.js` — Web Speech | **removido** |
| `index.html` | **mantido**, passa a receber por SSE |

Só o ouvido muda.

## 4. Selectors e armadilhas (do `gMeetTranscriptCapture`, MIT)

Estratégia de três camadas, porque o Meet usa classes CSS ofuscadas:

1. **`jsname`** (primário): `tgaKEf` container · `YSxPC` bloco por falante ·
   `r4nke` nome do falante · `bVV8Bd` texto
2. **região `aria-live`** (fallback)
3. **heurística estrutural** (último recurso)

Quatro armadilhas que o código precisa tratar:

- **Anúncios de status do Meet compartilham a `aria-live` das legendas.** O fallback
  sozinho captura aviso de sistema em vez de fala. Precisa filtrar.
- **Achar o botão CC por palavra-chave acha "Configurações → Legendas"** e abre um
  diálogo. Rejeitar `[role="dialog"]` e labels de settings/idioma. O atalho `(c)` no
  label é independente de idioma e é o sinal mais confiável. `jsname` conhecidos do
  botão CC: `r8qRAd`, `Dg9Wp`.
- **`data-self-name`** no próprio tile de vídeo identifica você sem abrir painel.
  Todo falante que não for esse nome é cliente.
- **A legenda chega palavra por palavra.** Debounce por falante e commit quando: o
  timer estoura, o bloco do falante some do DOM, ou o texto deixa de ser prefixo do
  que já foi committado.

## 5. Arquitetura

```
aba do Meet (https://meet.google.com)
 │
 ├─ content.js  ── liga CC, observa as legendas, separa falante
 │                 injeta o OVERLAY (fase + card + histórico)
 │                 │
 │                 └── chrome.runtime.sendMessage ──┐
 │                                                   ▼
 └────────────────────────────────── background.js (service worker)
                                      monta perguntas + state  (lib/decisao.js)
                                      POST http://localhost:3000/jev
                                      POST http://localhost:3000/evento
                                           │
                     ┌─────────────────────┘
                     ▼
             server.js  ── proxy do Jev (chave do .env)
                        ── barramento de eventos (SSE)
                        ── catálogo de objeções (objecoes.json)
                     │
                     └── GET /eventos (SSE) ──► index.html (painel separado)
```

**Por que a chamada ao Jev sai do service worker, não do content script:** o content
script roda em `https://meet.google.com`; chamar `http://localhost:3000` de lá é
mixed content, que o Chrome **bloqueia em silêncio** — o fetch pendura até dar
timeout. Essa armadilha já está documentada no `pesquisa/README.md` deste projeto,
descoberta na coleta das transcrições. O service worker não sofre a regra de
mixed-content da página e tem `host_permissions` explícito para o localhost.

**Essa é a única suposição não verificada do design.** É a primeira tarefa do plano:
se o service worker não alcançar o localhost, o plano B é a extensão chamar
`https://api.typesafe.ai` direto com a chave em `chrome.storage`, e o servidor local
vira opcional. Decidir só com evidência, não com esperança.

## 6. O catálogo sai do localStorage e vai para o servidor

Na v1 as objeções viviam no `localStorage` da página. Com duas superfícies (overlay na
aba do Meet e painel em localhost) o `localStorage` não é compartilhado — seriam dois
catálogos divergentes.

O catálogo passa a morar em `objecoes.json` no servidor, com `GET /objecoes` e
`PUT /objecoes`. Uma fonte de verdade para as duas telas, e sobrevive a troca de perfil
do Chrome. Se o servidor estiver fora do ar, a extensão cai nas 7 de exemplo embutidas.

## 7. As duas superfícies

**Overlay no Meet** (para usar ao vivo): painel flutuante, arrastável, canto da tela.
Barra de fase compacta, o card grande com o argumento, e as últimas objeções. Botão
para recolher. É onde você olha durante a call.

**Painel em `localhost:3000`** (para gravar e revisar): a página que já existe, com as
duas colunas de transcrição, o card central, o histórico e o rodapé de métricas.
Recebe tudo por SSE — não decide nada, só exibe. Assim a decisão acontece num lugar
só e as duas telas nunca divergem.

## 8. Regra de decisão

Inalterada da v1, e é literalmente o mesmo código (`aplicarRegra`):

1. Card se `tem_objecao.noul >= 0.6` **E** `objecao.confidence >= 0.5` **E**
   `objecao.choice !== "nenhuma"`.
2. `terminou_de_falar.noul < 0.5` → espera o resto.
3. Não repete a mesma objeção seguida.
4. Objeção fora do catálogo → card de alerta neutro.
5. `fase` atualiza a barra quando `confidence >= 0.5`.

Só o gatilho muda: em vez de uma frase final do `SpeechRecognition`, é uma linha de
legenda committada de um falante que **não** é `data-self-name`.

## 9. Fora de escopo

Zoom e Teams. Gravar a call. Exportar transcrição. Afinar thresholds (continua
deferido). Qualquer coisa multiusuário.

## 10. Riscos aceitos

| Risco | Mitigação |
|---|---|
| Meet muda o DOM e a captura para | 3 camadas de seletor + modo diagnóstico que reporta qual camada pegou e quantas linhas vieram |
| Service worker não alcança localhost | Verificado na Tarefa 1, antes de qualquer código em cima. Plano B definido |
| Auto-ligar CC abre o diálogo errado | Filtro de `[role="dialog"]` e settings, prioriza o atalho `(c)` |
| Anúncio de status vira "fala do cliente" | Só aceita texto vindo de bloco com nome de falante identificado |
