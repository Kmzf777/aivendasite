# Copiloto v5 — CRM com Supabase (spec + plano)

Data: 2026-09-30
Soma-se à v4 (Next 16 + React 19). Nada da v4 é jogado fora.

## 1. A dobradiça do sistema

**Qualificado = ter o contato de quem decide.** Não é "tem dor e verba" — é um fato
binário: ou o vendedor conseguiu o número do dono/gerente, ou não conseguiu. (Se o
número que já estava na lista era o do dono, nasce qualificado.)

Essa definição separa o sistema em duas superfícies:

| Superfície | O que é | Quem vê |
|---|---|---|
| **Poço de leads** (home) | os 117 pet shops raspados + os criados à mão | todos |
| **Kanban** | só lead qualificado, onde a venda acontece | cada vendedor vê o seu |

O poço existe para **dar vontade de ligar**: o que salta aos olhos é quanta coisa
está sem dono. A atribuição não é burocracia — serve para dois vendedores não
ligarem para o mesmo pet shop.

```
POÇO (compartilhado)                      KANBAN (por vendedor)
┌───────────────────────┐
│ sem dono ──► meu      │  pegou o nº do dono   ┌──────────────┐
│               │       │  ───────────────────► │ Novo contato │
│               └─ não  │                       │ Conversando  │
│                  qual.│                       │ Proposta     │
└───────────────────────┘                       │ Fechou/Perdeu│
                                                └──────────────┘
```

## 2. Layout: CRM

Menu lateral fixo à esquerda, conteúdo à direita. O menu leva a **Leads**, **Funil**,
**Objeções** e **Cold call** — as duas últimas são as telas da v4, que passam a viver
dentro do mesmo casco.

**Exceção deliberada:** quando a `/coldcall` entra em modo foco (depois do "Ligar"), o
menu **some**. A tela de foco existe para ser lida em milissegundos com um cliente
falando no ouvido; uma barra lateral ali é ruído. O menu volta ao desligar.

## 3. Schema

```sql
perfis        id → auth.users · nome · email · criado_em
leads         id · nome · categoria · telefone · endereco · nota · avaliacoes
              instagram · site · fechado · origem('raspado'|'manual')
              situacao('novo'|'meu'|'qualificado'|'nao_qualificado')
              etapa('novo_contato'|'conversando'|'proposta'|'fechou'|'perdeu')
              vendedor_id → perfis · atribuido_em · motivo_desqualificacao
contatos      id · lead_id → leads · nome · cargo · telefone · e_decisor
              — o ativo que o cold call PRODUZ
eventos       id · lead_id · vendedor_id · tipo · nota · criado_em
              — histórico: atribuiu, ligou, qualificou, moveu no funil
```

`etapa` só tem sentido quando `situacao = 'qualificado'`. Um lead qualificado entra no
kanban em `novo_contato`.

## 4. Permissões (RLS)

- **Ler leads:** qualquer usuário autenticado lê o poço inteiro. Sem isso a atribuição
  não cumpre o papel de avisar os outros.
- **Escrever num lead:** só quem é o `vendedor_id`, ou qualquer um quando o lead está
  sem dono (é assim que se pega).
- **Largar:** o dono pode devolver o lead ao poço.
- **Roubar:** não. Lead com dono só muda de mãos se o dono largar.
- **Contatos e eventos:** leitura para todos, escrita só do dono do lead.
- **Perfis:** cada um edita só o seu.

## 5. Autenticação

E-mail e senha pelo Supabase Auth. Sem cadastro aberto: o primeiro usuário é criado no
painel do Supabase e os demais por convite. Rota protegida por middleware — qualquer
página fora de `/login` exige sessão.

## 6. O que não dá para verificar sem as credenciais

Tudo que toca o banco. Sem a URL e as chaves do projeto, o código é escrito e compila,
mas **nenhum fluxo é exercitado**: login, leitura do poço, atribuição, qualificação e
kanban ficam não verificados até alguém colar as três chaves no `.env`.

Isso está dito aqui para não ser descoberto depois como surpresa.

## 7. Divisão do trabalho

**Fundação (sequencial, porque todo o resto depende):** SQL do schema com RLS, clientes
do Supabase (browser e servidor), tipos compartilhados, o casco do CRM com menu lateral,
e a mudança das rotas da v4 para dentro dele.

**Depois, em paralelo, sem sobreposição de arquivos:**

| Agente | Dono de | Entrega |
|---|---|---|
| A | `app/login/**`, `middleware.ts`, `lib/auth*`, `components/Sessao*` | login, sessão, proteção de rota |
| B | `app/(crm)/leads/**`, `components/Lead*`, `components/NovoLead*` | poço, atribuição, qualificação, criação |
| C | `app/(crm)/funil/**`, `components/Kanban*`, `components/Cartao*` | kanban por vendedor |

## 8. Fora de escopo

Convite de usuário pela tela. Importação do CSV pela tela (entra por script). Métricas e
relatórios. Histórico visual de eventos. Edição de lead além do necessário para o fluxo.
