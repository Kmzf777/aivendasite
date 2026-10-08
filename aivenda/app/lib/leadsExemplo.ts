import type { Contato, Lead } from "@/lib/tipos";

/**
 * O poço mostra, em cada linha, o ativo que o cold call produziu: o contato de
 * quem decide. Então a linha não é um `Lead` puro — é um lead com os contatos
 * e o perfil do dono pendurados, que é o que o `select` aninhado do Supabase
 * devolve.
 *
 * O tipo mora aqui, e não em `lib/tipos.ts`, porque aquele arquivo é
 * compartilhado com as outras telas e não é meu para alterar.
 */
export type ContatoDoPoco = Pick<Contato, "id" | "nome" | "cargo" | "telefone" | "e_decisor">;

export type LeadDoPoco = Lead & {
  contatos?: ContatoDoPoco[] | null;
};

/* ------------------------------------------------------------------ *
 * DADOS DE DEMONSTRAÇÃO
 *
 * Existem por um motivo só: sem as chaves do Supabase no .env não há como
 * carregar o poço, e uma tela em branco não ensina nada sobre o produto.
 * São usados SOMENTE quando `temCredenciaisServidor()` é falso, e a tela
 * grita que são de mentira. Nunca se misturam com dados reais.
 * ------------------------------------------------------------------ */

/** Quem "está logado" na demonstração. */
export const VENDEDOR_EXEMPLO = { id: "00000000-0000-4000-8000-000000000001", nome: "você (demo)" };
const OUTRO_VENDEDOR = { id: "00000000-0000-4000-8000-000000000002", nome: "Marina" };

const AGORA = "2026-09-30T12:00:00.000Z";

// Atalho para não repetir os quinze campos do schema em cada linha.
function exemplo(dados: Partial<LeadDoPoco> & { id: string; nome: string }): LeadDoPoco {
  return {
    categoria: "Pet Shop",
    telefone: "",
    endereco: "",
    nota: null,
    avaliacoes: null,
    instagram: "",
    site: "",
    fechado: false,
    origem: "raspado",
    situacao: "novo",
    etapa: null,
    vendedor_id: null,
    atribuido_em: null,
    motivo_desqualificacao: null,
    criado_em: AGORA,
    atualizado_em: AGORA,
    perfis: null,
    contatos: [],
    ...dados,
  };
}

export const LEADS_EXEMPLO: LeadDoPoco[] = [
  exemplo({
    id: "demo-01",
    nome: "VinculoPet Clínica Veterinária",
    categoria: "Veterinário",
    telefone: "(34) 98421-1136",
    endereco: "880 Rua Oscar Gomes de Moreira Júnior",
    nota: 5,
    avaliacoes: 41,
    instagram: "https://www.instagram.com/vinculopetcentroveterinario",
    site: "https://vinculopet.my.canva.site/",
  }),
  exemplo({
    id: "demo-02",
    nome: "SANARVET - Hospital Veterinário 24 horas",
    categoria: "Hospital Veterinário",
    telefone: "(34) 99880-7597",
    endereco: "995 Avenida Getúlio Vargas",
    nota: 4.9,
    avaliacoes: 218,
    instagram: "https://www.instagram.com/hospitalveterinariosanar",
  }),
  // Já qualificado: o telefone da lista era da recepção, e o cold call
  // produziu o número do dono. É isto que "qualificado" significa.
  exemplo({
    id: "demo-03",
    nome: "Santo Chico Pet",
    telefone: "(34) 99939-4601",
    endereco: "R. Guajajaras, 791",
    nota: 4.9,
    avaliacoes: 45,
    situacao: "qualificado",
    etapa: "novo_contato",
    vendedor_id: VENDEDOR_EXEMPLO.id,
    atribuido_em: AGORA,
    perfis: VENDEDOR_EXEMPLO,
    contatos: [
      {
        id: "demo-c1",
        nome: "Letícia Chico",
        cargo: "Proprietária",
        telefone: "(34) 99108-2244",
        e_decisor: true,
      },
    ],
  }),
  exemplo({
    id: "demo-04",
    nome: "Pet Shop Amigão",
    telefone: "(34) 3210-8217",
    endereco: "Av. Rio Branco, 562",
    nota: 4.8,
    avaliacoes: 105,
    situacao: "meu",
    vendedor_id: VENDEDOR_EXEMPLO.id,
    atribuido_em: AGORA,
    perfis: VENDEDOR_EXEMPLO,
  }),
  // Pego por outra pessoa: é exatamente este aviso que impede dois
  // vendedores de ligarem para o mesmo pet shop.
  exemplo({
    id: "demo-05",
    nome: "Cão & Cia Banho e Tosa",
    categoria: "Banho e tosa",
    telefone: "(34) 3236-7711",
    endereco: "R. Rio Grande do Norte, 410",
    nota: 4.7,
    avaliacoes: 63,
    situacao: "meu",
    vendedor_id: OUTRO_VENDEDOR.id,
    atribuido_em: AGORA,
    perfis: OUTRO_VENDEDOR,
  }),
  exemplo({
    id: "demo-06",
    nome: "Mundo Animal Uberlândia",
    telefone: "(34) 3212-4408",
    endereco: "Av. João Naves de Ávila, 2120",
    nota: 4.6,
    avaliacoes: 312,
  }),
  exemplo({
    id: "demo-07",
    nome: "Agropet Tubal",
    categoria: "Agropecuária",
    telefone: "(34) 3237-1900",
    endereco: "R. Olegário Maciel, 55",
    nota: 4.4,
    avaliacoes: 89,
  }),
  exemplo({
    id: "demo-08",
    nome: "Petland Center Shopping",
    telefone: "(34) 3214-6060",
    endereco: "Av. João Naves de Ávila, 1900",
    nota: 4.2,
    avaliacoes: 540,
    situacao: "nao_qualificado",
    vendedor_id: VENDEDOR_EXEMPLO.id,
    atribuido_em: AGORA,
    perfis: VENDEDOR_EXEMPLO,
    motivo_desqualificacao: "Rede nacional, marketing é decidido em São Paulo.",
  }),
  exemplo({
    id: "demo-09",
    nome: "Pet Feliz Tibery",
    telefone: "(34) 99712-0045",
    endereco: "R. Antônio Crispim, 1240",
    nota: 4.1,
    avaliacoes: 17,
  }),
  exemplo({
    id: "demo-10",
    nome: "Clínica Veterinária Santa Mônica",
    categoria: "Veterinário",
    telefone: "(34) 3233-8080",
    endereco: "R. Bernardo Guimarães, 302",
    nota: 3.9,
    avaliacoes: 22,
  }),
  exemplo({
    id: "demo-11",
    nome: "Tosa Express (indicação)",
    categoria: "Banho e tosa",
    telefone: "(34) 99400-1122",
    endereco: "",
    nota: null,
    avaliacoes: null,
    origem: "manual",
  }),
];
