// ==================================================================
// Cartões de demonstração do funil.
//
// Existem por um motivo só: sem as chaves do Supabase no .env não há como
// ler o banco, e um quadro vazio não mostra nada de um quadro. Estes dados
// aparecem SOMENTE quando `temCredenciaisServidor()` é falso, e a tela diz
// na cara que são de demonstração.
//
// Nada aqui é escrito em lugar nenhum. O Kanban recebe `demonstracao` e
// recusa qualquer gravação.
//
// Importante: os dados crus passam pelo MESMO `montarCartoes()` que a tela
// de verdade usa. Assim a demonstração exercita as contas de tempo reais em
// vez de trazer números escritos à mão que poderiam mentir.
// ==================================================================

import { montarCartoes, type CartaoLead } from "@/components/KanbanTipos";
import type { Contato, Etapa, Evento, Lead } from "@/lib/tipos";

const VENDEDOR_DEMO = "00000000-0000-0000-0000-00000000de00";

type Roteiro = {
  nome: string;
  categoria: string;
  telefone: string;
  endereco: string;
  nota: number;
  avaliacoes: number;
  site?: string;
  instagram?: string;
  etapa: Etapa;
  /** Quem decide, e o que mais se descobriu no contato. */
  contatos: { nome: string; cargo: string; telefone: string; decisor?: boolean }[];
  /** [horas atrás, tipo, nota]. O primeiro da lista é o mais recente. */
  eventos: [number, string, string][];
};

const ROTEIRO: Roteiro[] = [
  {
    nome: "Pet Shop Patas & Mimos",
    categoria: "Pet shop",
    telefone: "(34) 3234-1180",
    endereco: "Av. Rondon Pacheco, 1820 — Uberlândia, MG",
    nota: 4.6,
    avaliacoes: 212,
    instagram: "@patasemimos",
    etapa: "novo_contato",
    contatos: [{ nome: "Simone Araújo", cargo: "Proprietária", telefone: "(34) 99812-4477", decisor: true }],
    eventos: [[5, "qualificou", "Atendente passou o celular da proprietária"]],
  },
  {
    nome: "Clínica Veterinária Bicho Bom",
    categoria: "Clínica veterinária",
    telefone: "(34) 3212-7744",
    endereco: "R. Goiás, 410 — Uberlândia, MG",
    nota: 4.8,
    avaliacoes: 486,
    site: "bichobomvet.com.br",
    etapa: "novo_contato",
    contatos: [
      { nome: "Dr. Henrique Salles", cargo: "Sócio-diretor", telefone: "(34) 99143-2210", decisor: true },
      { nome: "Letícia", cargo: "Recepção", telefone: "(34) 3212-7744" },
    ],
    eventos: [[86, "qualificou", "Sócio atende depois das 18h, pediu retorno na terça"]],
  },
  {
    nome: "Mundo Animal Center",
    categoria: "Pet shop",
    telefone: "(34) 3236-5521",
    endereco: "Av. João Naves de Ávila, 3400 — Uberlândia, MG",
    nota: 4.2,
    avaliacoes: 98,
    etapa: "novo_contato",
    contatos: [{ nome: "Wellington Braz", cargo: "Gerente", telefone: "(34) 99655-0132", decisor: true }],
    // O cartão esquecido: nove dias sem ninguém tocar nele.
    eventos: [[221, "qualificou", "Gerente decide sozinho sobre marketing"]],
  },
  {
    nome: "Au Au Banho & Tosa",
    categoria: "Banho e tosa",
    telefone: "(34) 3218-9043",
    endereco: "R. Arthur Bernardes, 77 — Uberlândia, MG",
    nota: 4.9,
    avaliacoes: 141,
    instagram: "@auaubanhoetosa",
    etapa: "conversando",
    contatos: [{ nome: "Camila Ferraz", cargo: "Proprietária", telefone: "(34) 99204-7781", decisor: true }],
    eventos: [
      [9, "ligacao", "Gostou do exemplo do concorrente, pediu um print do Maps dela"],
      [30, "moveu", "Novo contato → Conversando"],
      [34, "qualificou", "Falei direto com a dona"],
    ],
  },
  {
    nome: "Pet Village Uberlândia",
    categoria: "Pet shop",
    telefone: "(34) 3233-0098",
    endereco: "Av. Belarmino Cotta Pacheco, 980 — Uberlândia, MG",
    nota: 3.9,
    avaliacoes: 57,
    etapa: "conversando",
    contatos: [
      { nome: "Rogério Lima", cargo: "Dono", telefone: "(34) 98117-6620", decisor: true },
      { nome: "Tatiane Lima", cargo: "Administrativo", telefone: "(34) 98433-2109" },
    ],
    eventos: [
      [97, "nota", "Já usa Instagram — mandei o comparativo de busca no Maps"],
      [120, "moveu", "Novo contato → Conversando"],
    ],
  },
  {
    nome: "Reino dos Bichos",
    categoria: "Pet shop",
    telefone: "(34) 3227-4412",
    endereco: "R. Tenente Virmondes, 530 — Uberlândia, MG",
    nota: 4.4,
    avaliacoes: 173,
    etapa: "conversando",
    contatos: [{ nome: "Eliane Prado", cargo: "Proprietária", telefone: "(34) 99338-1205", decisor: true }],
    // Dez dias sem atividade em "Conversando": era o mais quente do funil.
    eventos: [
      [242, "ligacao", "Pediu proposta por escrito. NÃO ENVIEI."],
      [268, "moveu", "Novo contato → Conversando"],
    ],
  },
  {
    nome: "Espaço Cão & Gato",
    categoria: "Banho e tosa",
    telefone: "(34) 3215-6677",
    endereco: "Av. Cesário Alvim, 1240 — Uberlândia, MG",
    nota: 4.7,
    avaliacoes: 304,
    instagram: "@espacocaoegato",
    etapa: "proposta",
    contatos: [{ nome: "Marcos Vinícius Dias", cargo: "Proprietário", telefone: "(34) 99701-4458", decisor: true }],
    eventos: [
      [20, "proposta", "Enviei o pacote de R$ 490 + setup. Prometeu responder sexta"],
      [21, "moveu", "Conversando → Proposta"],
      [70, "ligacao", "Topou ver números"],
    ],
  },
  {
    nome: "Petiscos & Cia",
    categoria: "Pet shop",
    telefone: "(34) 3239-1122",
    endereco: "R. Bernardo Guimarães, 215 — Uberlândia, MG",
    nota: 4.1,
    avaliacoes: 64,
    etapa: "proposta",
    contatos: [{ nome: "Juliana Mota", cargo: "Sócia", telefone: "(34) 99882-3014", decisor: true }],
    eventos: [
      [172, "proposta", "Proposta enviada no WhatsApp. Visualizou e não respondeu"],
      [176, "moveu", "Conversando → Proposta"],
    ],
  },
  {
    nome: "Vet Center Santa Mônica",
    categoria: "Clínica veterinária",
    telefone: "(34) 3240-8890",
    endereco: "Av. Anselmo Alves dos Santos, 2900 — Uberlândia, MG",
    nota: 4.9,
    avaliacoes: 621,
    site: "vetcentersm.com.br",
    etapa: "fechou",
    contatos: [
      { nome: "Dra. Renata Vilela", cargo: "Diretora clínica", telefone: "(34) 99500-7733", decisor: true },
      { nome: "Paulo", cargo: "Financeiro", telefone: "(34) 3240-8891" },
    ],
    eventos: [
      [48, "fechou", "Assinou o anual. Primeira parcela na terça"],
      [48, "moveu", "Proposta → Fechou"],
      [96, "proposta", "Pacote anual com desconto de 10%"],
    ],
  },
  {
    nome: "Cia do Bicho",
    categoria: "Pet shop",
    telefone: "(34) 3221-3345",
    endereco: "R. Machado de Assis, 88 — Uberlândia, MG",
    nota: 4.5,
    avaliacoes: 119,
    etapa: "fechou",
    contatos: [{ nome: "Fábio Resende", cargo: "Dono", telefone: "(34) 99410-2288", decisor: true }],
    eventos: [
      [320, "fechou", "Fechou mensal sem desconto"],
      [320, "moveu", "Proposta → Fechou"],
    ],
  },
  {
    nome: "Pet Lar Tubalina",
    categoria: "Banho e tosa",
    telefone: "(34) 3214-0071",
    endereco: "R. Niterói, 1402 — Uberlândia, MG",
    nota: 3.6,
    avaliacoes: 31,
    etapa: "perdeu",
    contatos: [{ nome: "Sandra Küster", cargo: "Proprietária", telefone: "(34) 99126-5590", decisor: true }],
    eventos: [
      [140, "perdeu", "Vai abrir outra unidade e travou tudo por 6 meses. Retomar em março"],
      [140, "moveu", "Proposta → Perdeu"],
    ],
  },
];

/**
 * Os cartões de demonstração.
 *
 * Recebe `agora` como argumento — e não lê o relógio por dentro — porque é
 * chamado só no servidor, uma vez por render. O resultado viaja serializado
 * para o cliente, então nenhum relógio de navegador participa das contas e
 * não há risco de divergência na hidratação.
 */
export function cartoesExemplo(agora: number = Date.now()): CartaoLead[] {
  const leads: Lead[] = [];
  const contatos: Contato[] = [];
  const eventos: Evento[] = [];

  const quando = (horasAtras: number) => new Date(agora - horasAtras * 3_600_000).toISOString();

  ROTEIRO.forEach((r, i) => {
    const id = `demo-lead-${i + 1}`;
    const maisAntigo = Math.max(...r.eventos.map(([h]) => h), 24);

    leads.push({
      id,
      nome: r.nome,
      categoria: r.categoria,
      telefone: r.telefone,
      endereco: r.endereco,
      nota: r.nota,
      avaliacoes: r.avaliacoes,
      instagram: r.instagram ?? null,
      site: r.site ?? null,
      fechado: false,
      origem: "raspado",
      situacao: "qualificado",
      etapa: r.etapa,
      vendedor_id: VENDEDOR_DEMO,
      atribuido_em: quando(maisAntigo + 4),
      motivo_desqualificacao: null,
      criado_em: quando(maisAntigo + 72),
      atualizado_em: quando(r.eventos[0][0]),
    });

    r.contatos.forEach((c, j) => {
      contatos.push({
        id: `demo-contato-${i + 1}-${j + 1}`,
        lead_id: id,
        nome: c.nome,
        cargo: c.cargo,
        telefone: c.telefone,
        e_decisor: c.decisor === true,
        criado_em: quando(maisAntigo),
      });
    });

    r.eventos.forEach(([h, tipo, nota], j) => {
      eventos.push({
        id: `demo-evento-${i + 1}-${j + 1}`,
        lead_id: id,
        vendedor_id: VENDEDOR_DEMO,
        tipo,
        nota,
        criado_em: quando(h),
      });
    });
  });

  return montarCartoes(leads, contatos, eventos, agora);
}
