# Site — Alva Petshop

Landing page do Alva Petshop (Uberlândia), feita com o site do Agrozet como base.
Site estático puro: HTML + CSS + ~20 linhas de JS. **Sem build, sem dependência.**

```
site-alva/
├── index.html
└── assets/
    ├── css/styles.css
    ├── img/      ← serv-*, hero, taxi, faixa: Pexels (uso comercial livre)
    │               cliente-*: fotos REAIS de clientes, tiradas do Instagram @alva.petshop
    └── logo/alva-logo.jpg   ← foto de perfil do Instagram (150×150, provisória)
```

## Ver localmente

```bash
python -m http.server 8766 -d site-alva
```

## Dados usados (fontes)

| Dado | Fonte |
|---|---|
| WhatsApp (34) 99987-0785 | link enviado + Linktree + Google |
| R. Prata, 909 – Nossa Sra. Aparecida, 38400-622 | Google Maps |
| Seg–Sex 9h–18h · Sáb 9h–14h | bio do Instagram |
| Nota 5,0 · 13 avaliações + 3 depoimentos | Google Maps |
| Taxi Pet e seus 4 benefícios | post do Instagram |
| Dicas (água / coceira) | posts "Dica da semana" do Instagram |

## Decisões

**Paleta** tirada da logo e dos posts: creme `#fffaf0`, verde-petróleo `#154345` ("PETSHOP"),
laranja `#ec6a2c` ("ALVA"). **Tipografia** Fredoka (arredondada, conversa com o letreiro da logo)
+ Figtree. Todas as CTAs abrem o WhatsApp com mensagem pré-preenchida; botão flutuante sempre visível.

## Pendências antes de publicar

| # | O que | Por quê |
|---|---|---|
| 1 | **Logo em alta** | A atual é a foto de perfil do Instagram (150 px). Trocar `assets/logo/alva-logo.jpg` pelo arquivo original (PNG/SVG). |
| 2 | **Lista de serviços** | Tosa na tesoura, tosa higiênica e o que vai no "banho completo" foram inferidos. Confirmar com a dona; atendem gatos? |
| 3 | **Preços** | Não há preço público no Instagram. Se quiserem, dá para criar uma seção de tabela. |
| 4 | **Taxi Pet** | Confirmar bairros atendidos e se tem taxa. |
| 5 | **Fotos da loja** | Hero e serviços são de banco. Fotos reais do espaço/equipe convertem mais. |
| 6 | **Depoimentos** | Nomes abreviados (Rafaela D., L. P., Luiz). Confirmar que podem ser exibidos. |

## Aviso

Usa nome, marca, fotos e dados de um negócio real. Não publicar em domínio público sem o aval do Alva Petshop.
