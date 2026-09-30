# Copiloto v4 — Next.js + React (spec + plano)

Data: 2026-09-30
Substitui a interface da v3 (HTML/JS vanilla). A camada de decisão não muda.

## 1. Objetivo

Remodelar o sistema em Next 16 + React 19. Três telas:

| Rota | Para quê |
|---|---|
| `/` | home: só dois acessos, `/objecoes` e `/coldcall` |
| `/objecoes` | onde o Jev é configurado: catálogo + limiares |
| `/coldcall` | modo foco: onde a call acontece |

## 2. Decisão de arquitetura

**O Next substitui o `server.js` na porta 3000**, implementando os mesmos caminhos
(`/jev`, `/objecoes`, `/evento`, `/eventos`). Consequência deliberada: **a extensão do
Meet continua funcionando sem alterar uma linha** dela.

O `server.js` tinha ~200 linhas e metade era parser de `.env` e servidor estático, que o
Next já faz. O que importa — o proxy da chave e o barramento SSE — vira route handler.

## 3. O que sobrevive intacto

`lib/decisao.js` e `lib/atribuir.js` são funções puras: portam direto, **com os 89
testes**. A regra de decisão (duas portas), a atribuição por transições de tecla, o
AudioWorklet e o sigilo da chave não mudam de comportamento.

## 4. `/coldcall` — o modo foco

Abre com **modal de configuração**: microfone, modo (push-to-talk ou duas entradas),
botão **Ligar**. Ao ligar, o modal fecha e a tela vira três faixas:

```
┌─────────────────────────────────────────────────┐
│  ▓▓▓ VOCÊ FALANDO        ∿∿∿╱╲∿∿╱╲╲∿∿∿          │  push-to-talk + curva
├─────────────────────────────────────────────────┤
│         TÁ CARO                      98%        │
│         Caro comparado com quê                  │  ÁREA DE FOCO
│         ─────────────────────────────           │
│         ⚠  Não desça de preço antes do não.     │
│                          [↓] ver argumento      │
├─────────────────────────────────────────────────┤
│  tá caro · já tenho instagram · vou pensar      │  histórico discreto
└─────────────────────────────────────────────────┘
```

**O card mostra `headline` + `pivot`**, não o `argumento`. São campos que já existem no
catálogo e que nenhuma tela usava. O argumento completo aparece com a **seta ↓** —
não com espaço, que é o push-to-talk.

A transcrição sai da tela principal. Em foco você lê o card, não a transcrição.

A **curva de voz** vem do AudioWorklet que já existe: ele entrega RMS a 20 Hz e é imune
ao estrangulamento de `setInterval` com a aba oculta.

## 5. `/objecoes`

Os 13 campos da objeção, com destaque para os três que fazem o sistema funcionar:
`comoSoa` (o que o Jev casa), `headline` e `pivot` (o que aparece no card).

Mais os limiares hoje escondidos no `CONFIG`: `limiarObjecao` (0,6), `limiarConfianca`
(0,5), `limiarConfiancaSozinha` (0,95), `limiarTerminou` (0,5) e o modelo. Persistidos
junto do catálogo, lidos pela decisão em vez das constantes.

## 6. A armadilha que vai morder

**O StrictMode do Next monta e desmonta todo efeito duas vezes em dev.** Como o Chrome
só permite **um `SpeechRecognition` ativo por vez** (medido nesta sessão: o segundo
aborta o primeiro em ~2 ms), a segunda montagem mata a primeira e o reconhecimento
morre em silêncio.

É o mesmo limite que matou a arquitetura v1, reaparecendo por outro caminho. Exige
guarda por `useRef` e cleanup correto, e é o primeiro item a testar.

## 7. Divisão do trabalho

**Fundação (feita antes, sequencial, porque todo o resto depende):** scaffold, tokens de
cor, layout, home, port do `lib/` com testes, as quatro rotas de API.

**Depois, em paralelo, sem sobreposição de arquivos:**

| Agente | Dono de | Entrega |
|---|---|---|
| A | `app/coldcall/**`, `app/hooks/**`, `components/Card*`, `components/Curva*` | modo foco completo |
| B | `app/objecoes/**`, `components/Objec*`, `components/Limiares*` | catálogo + limiares |

## 8. Critério de pronto

1. `npm run build` passa.
2. Os 89 testes da camada de decisão continuam verdes.
3. `/` navega para as duas páginas.
4. `/coldcall` abre o modal, liga, mostra push-to-talk e curva, e o card com headline +
   pivot quando o Jev decide.
5. `/objecoes` lista, edita e salva; os limiares afetam a decisão de verdade.
6. A extensão do Meet, sem alteração, ainda recebe decisão pelas rotas novas.

## 9. Fora de escopo

Autenticação. Deploy. Banco de dados. A página do Meet dentro do Next (a extensão
continua sendo o ouvido dele). Afinar limiares — a tela passa a permitir, mas o valor
certo continua sendo assunto de call real.
