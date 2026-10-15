// Tipos compartilhados pelas telas do CRM. Espelham supabase/schema.sql.

export type Situacao = "novo" | "meu" | "qualificado" | "nao_qualificado";
export type Etapa = "novo_contato" | "conversando" | "proposta" | "fechou" | "perdeu";

export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: "novo_contato", nome: "Novo contato" },
  { id: "conversando", nome: "Conversando" },
  { id: "proposta", nome: "Proposta" },
  { id: "fechou", nome: "Fechou" },
  { id: "perdeu", nome: "Perdeu" },
];

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  /** Coluna do banco, mantida no tipo. Hoje nenhuma tela depende dela. Muda só pelo banco — ver migracao-002. */
  admin: boolean;
};

export type Lead = {
  id: string;
  nome: string;
  categoria: string | null;
  telefone: string | null;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number | null;
  instagram: string | null;
  site: string | null;
  fechado: boolean;
  origem: "raspado" | "manual";
  situacao: Situacao;
  etapa: Etapa | null;
  vendedor_id: string | null;
  atribuido_em: string | null;
  motivo_desqualificacao: string | null;
  criado_em: string;
  atualizado_em: string;
  // vem do join quando a consulta pede
  perfis?: Pick<Perfil, "id" | "nome"> | null;
};

// O ativo que a prospecção PRODUZ: o numero de quem decide.
export type Contato = {
  id: string;
  lead_id: string;
  nome: string;
  cargo: string;
  telefone: string;
  e_decisor: boolean;
  criado_em: string;
};

export type Evento = {
  id: string;
  lead_id: string;
  vendedor_id: string | null;
  tipo: string;
  nota: string;
  criado_em: string;
};
