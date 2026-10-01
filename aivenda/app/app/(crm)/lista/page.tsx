import TelaLeads from "@/components/TelaLeads";

// A lista muda a cada ação de qualquer vendedor da equipe. Cache aqui seria
// mentira: dois vendedores ligando para o mesmo pet shop é justo o que esta
// tela existe para evitar.
export const dynamic = "force-dynamic";

export default function PaginaLista() {
  return <TelaLeads modo="universal" />;
}
