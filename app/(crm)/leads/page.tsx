import TelaLeads from "@/components/TelaLeads";

export const dynamic = "force-dynamic";

// Só o que está na minha mão. A pergunta que esta tela responde é
// "o que eu tenho para trabalhar hoje?", não "o que existe?".
export default function PaginaMeusLeads() {
  return <TelaLeads modo="meus" />;
}
