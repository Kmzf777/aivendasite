# Copiloto v3 — Fechamento (spec)

Data: 2026-09-30
Antecede: `2026-09-30-copiloto-v2-extensao-design.md`

## 1. Onde o projeto está

Três "ouvidos" alimentando **uma** camada de decisão e **um** painel:

| Ouvido | Para quê | Estado |
|---|---|---|
| Extensão + legendas do Meet | reunião agendada | código pronto, **nunca testado em call real** |
| `coldcall.html` push-to-talk | cold call, viva-voz, presencial | funciona, **com um bug de precisão** |
| `coldcall.html` duas entradas | cold call com cabo | funciona, **com o mesmo bug, pior** |

Camada de decisão (`lib/decisao.js`, `lib/atribuir.js`), servidor, SSE e catálogo:
verificados, 81 testes offline passando.

## 2. O bug que fecha esta versão

`comecarMedicao()` amostra energia e estado da tecla com `setInterval(..., 50)`.
**O Chrome estrangula `setInterval` para 1 Hz em aba oculta ou sem foco.** Medido:

```
intervalos reais: 999, 1001, 1000, 1008, 991 ms   (esperado: 50)
visibilityState: "hidden" · hasFocus: false
taxa: 1,1 Hz em vez de 20 Hz
```

Consequência: uma frase de 2 s rende 2 amostras em vez de 40. A fração que decide
quem falou fica grosseira, e no modo de duas entradas — onde a página **não precisa de
foco** — a atribuição por energia deixa de funcionar.

É a mesma armadilha que `pesquisa/README.md` já registrou na coleta das transcrições.

### 2.1 A correção, diferente por modo

**Push-to-talk:** parar de *amostrar* o estado da tecla. `keydown`/`keyup` já são
eventos com timestamp exato — guardar as transições e integrar os intervalos dentro da
janela. Zero timers, precisão exata, imune a estrangulamento.

**Duas entradas:** mover a medição de energia para um **AudioWorklet**. O processamento
de áudio roda na thread de áudio, que não é estrangulada. O worklet calcula RMS por
bloco e posta para a thread principal.

Nos dois casos a assinatura pública de `atribuir.js` não muda — só a fonte dos dados.

## 3. O que mais falta

- **Extensão do Meet nunca rodou numa call.** Os `jsname` das legendas podem estar
  desatualizados. Precisa de auditoria de código e, depois, de um teste com gente.
- **Nenhuma voz humana passou pelo `coldcall.html`.** O caminho de áudio foi validado
  (dispositivos, `getUserMedia`, grafo, `recognition.start`, `audiostart`), mas nunca
  com fala real.
- **Documentação divergente.** O spec v1 descreve a arquitetura morta (Web Speech em
  dois canais); o README não cobre push-to-talk nem os três ouvidos.
- **`coldcall.html` não trata** dispositivo desconectado no meio da call nem reinício
  do reconhecedor depois de silêncio longo.

## 4. Fora de escopo

Afinar thresholds do Jev. VoIP. APK. API paga de diarização. Tudo isso foi avaliado e
descartado por custo ou por trava de plataforma — registrado nas decisões anteriores.

## 5. Critério de pronto

1. Atribuição correta com a janela oculta (teste automatizado que prove a imunidade).
2. 81+ testes offline passando.
3. Extensão auditada, com os achados reportados.
4. README cobrindo os três ouvidos e o push-to-talk.
5. Uma call real feita pelo usuário — único passo que não dá para automatizar.
